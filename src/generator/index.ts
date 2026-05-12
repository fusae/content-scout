import { DeepSeekClient } from '../ai/deepseek.js';
import { AccountProfile } from '../profile/types.js';
import { FilteredContent } from '../filter/types.js';
import { Draft, DraftGenerationOptions, DraftGenerationResult, DraftStyle } from './types.js';
import { StyleAnalyzer } from './style-analyzer.js';
import { logger } from '../utils/logger.js';

/**
 * 草稿生成器
 * 为筛选后的内容生成多个风格的推文草稿
 */
export class DraftGenerator {
  private readonly DEFAULT_STYLES: DraftStyle[] = ['opinion', 'share', 'question'];
  private readonly MAX_LENGTH = 280;

  constructor(private deepseekClient: DeepSeekClient) {
    logger.info('DraftGenerator initialized');
  }

  /**
   * 为单条内容生成草稿
   */
  async generateDrafts(
    content: FilteredContent,
    profile: AccountProfile,
    options?: DraftGenerationOptions
  ): Promise<DraftGenerationResult> {
    const startTime = Date.now();
    const opts = this.normalizeOptions(options);

    logger.info(`Generating drafts for content #${content.contentId}`);
    logger.debug(`Title: ${content.content.title}`);

    try {
      // 1. 构建 prompt
      const prompt = this.buildPrompt(content, profile, opts);

      // 2. 调用 DeepSeek API
      const response = await this.deepseekClient.chat(prompt, {
        temperature: opts.temperature,
        maxTokens: 1500,
      });

      // 3. 解析响应
      const drafts = this.parseResponse(response, opts.maxLength!);

      // 4. 验证草稿
      const validatedDrafts = this.validateDrafts(drafts, profile);

      const duration = Date.now() - startTime;
      logger.info(`Generated ${validatedDrafts.length} drafts in ${duration}ms`);

      return {
        drafts: validatedDrafts,
        contentId: content.contentId,
        generatedAt: new Date(),
        model: 'deepseek-chat',
      };
    } catch (error) {
      logger.error(`Failed to generate drafts for content #${content.contentId}:`, error);
      throw error;
    }
  }

  /**
   * 批量生成草稿
   */
  async generateBatch(
    contents: FilteredContent[],
    profile: AccountProfile,
    options?: DraftGenerationOptions
  ): Promise<DraftGenerationResult[]> {
    logger.info(`Generating drafts for ${contents.length} contents`);

    const results: DraftGenerationResult[] = [];

    for (const content of contents) {
      try {
        const result = await this.generateDrafts(content, profile, options);
        results.push(result);

        // 添加延迟避免 API 限流
        await this.delay(500);
      } catch (error) {
        logger.error(`Failed to generate drafts for content #${content.contentId}, skipping`, error);
        // 继续处理下一条
      }
    }

    logger.info(`Batch generation completed: ${results.length}/${contents.length} succeeded`);
    return results;
  }

  /**
   * 构建 prompt
   */
  private buildPrompt(
    content: FilteredContent,
    profile: AccountProfile,
    _options: Required<DraftGenerationOptions>
  ): string {
    const styleDescription = StyleAnalyzer.generateStyleDescription(profile);
    const sampleTweets = StyleAnalyzer.generateSampleTweetsText(profile);
    const targetLength = StyleAnalyzer.calculateTargetLength(profile);
    const emojiStrategy = StyleAnalyzer.analyzeEmojiStrategy(profile);

    const prompt = `你是一个推文写手，需要模仿特定账号的风格写推文。

${styleDescription}

历史推文样本：
${sampleTweets}

原始内容：
标题：${content.content.title}
摘要：${content.content.content}
来源：${content.content.url}
推荐理由：${content.aiReason || '相关度高'}

任务：生成 3 个不同风格的推文草稿

1. **观点型（opinion）**：提出你的见解和评论，表达独特观点
2. **分享型（share）**：简洁介绍 + 推荐理由，引导读者点击
3. **提问型（question）**：提出引发讨论的问题，激发互动

要求：
- 严格模仿账号的语气和风格
- 长度控制在 ${targetLength.min} 到 ${targetLength.max} 字符
- ${emojiStrategy}
- 链接放在推文末尾，用 [链接] 占位
- 每个草稿附带生成理由（为什么这样写）

返回 JSON 格式（纯 JSON，不要 markdown 代码块）：
[
  {
    "content": "推文内容 [链接]",
    "style": "opinion",
    "reasoning": "为什么这样写"
  },
  {
    "content": "推文内容 [链接]",
    "style": "share",
    "reasoning": "为什么这样写"
  },
  {
    "content": "推文内容 [链接]",
    "style": "question",
    "reasoning": "为什么这样写"
  }
]`;

    return prompt;
  }

  /**
   * 解析 API 响应
   */
  private parseResponse(response: string, maxLength: number): Draft[] {
    try {
      // 移除可能的 markdown 代码块标记
      let cleaned = response.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/```\s*$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '');
      }

      const parsed = JSON.parse(cleaned);

      if (!Array.isArray(parsed)) {
        throw new Error('Response is not an array');
      }

      const drafts: Draft[] = parsed.map((item: any) => ({
        content: item.content || '',
        style: item.style || 'share',
        reasoning: item.reasoning || '',
        length: (item.content || '').length,
      }));

      // 过滤掉超长的草稿
      return drafts.filter(draft => draft.length <= maxLength);
    } catch (error) {
      logger.error('Failed to parse draft response:', error);
      logger.debug('Raw response:', response);
      throw new Error('Failed to parse draft generation response');
    }
  }

  /**
   * 验证草稿
   */
  private validateDrafts(drafts: Draft[], profile: AccountProfile): Draft[] {
    const validated: Draft[] = [];

    for (const draft of drafts) {
      const validation = StyleAnalyzer.validateDraft(draft.content, profile);

      if (validation.valid) {
        validated.push(draft);
      } else {
        logger.warn(`Draft validation failed: ${validation.issues.join(', ')}`);
        logger.debug(`Draft content: ${draft.content}`);

        // 尝试修复：如果只是长度问题，截断处理
        if (draft.length > 280 && validation.issues.length === 1) {
          const fixed = this.truncateDraft(draft.content, 280);
          validated.push({
            ...draft,
            content: fixed,
            length: fixed.length,
            reasoning: draft.reasoning + ' (已自动截断)',
          });
          logger.info('Draft truncated to fit length limit');
        }
      }
    }

    return validated;
  }

  /**
   * 截断草稿
   */
  private truncateDraft(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    // 保留链接占位符
    const linkPlaceholder = '[链接]';
    const hasLink = content.includes(linkPlaceholder);

    if (hasLink) {
      const withoutLink = content.replace(linkPlaceholder, '').trim();
      const availableLength = maxLength - linkPlaceholder.length - 1; // -1 for space

      if (withoutLink.length > availableLength) {
        const truncated = withoutLink.substring(0, availableLength - 3) + '...';
        return `${truncated} ${linkPlaceholder}`;
      }
    }

    // 简单截断
    return content.substring(0, maxLength - 3) + '...';
  }

  /**
   * 标准化选项
   */
  private normalizeOptions(options?: DraftGenerationOptions): Required<DraftGenerationOptions> {
    return {
      maxLength: options?.maxLength ?? this.MAX_LENGTH,
      styles: options?.styles ?? this.DEFAULT_STYLES,
      temperature: options?.temperature ?? 0.7,
    };
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
