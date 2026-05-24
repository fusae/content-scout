import { AccountProfile } from '../profile/types.js';
import { FilteredContent } from '../filter/types.js';
import { Draft, DraftGenerationOptions, DraftGenerationResult, DraftStyle } from './types.js';
import { StyleAnalyzer } from './style-analyzer.js';
import { logger } from '../utils/logger.js';

export interface DraftChatClient {
  chat(
    prompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
    }
  ): Promise<string>;
}

/**
 * 草稿生成器
 * 为筛选后的内容生成多个风格的推文草稿
 */
export class DraftGenerator {
  private readonly DEFAULT_STYLES: DraftStyle[] = ['short', 'medium', 'long'];
  private readonly MAX_LENGTH = 4000;
  private lastError?: Error;

  constructor(
    private chatClient: DraftChatClient,
    private modelName = 'deepseek-chat'
  ) {
    logger.info(`DraftGenerator initialized with ${modelName}`);
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

      // 2. 调用草稿生成模型
      const response = await this.chatClient.chat(prompt, {
        temperature: opts.temperature,
        maxTokens: 1500,
        systemPrompt:
          '你是一个中文 X/Twitter 代写编辑，只写像真人会直接发布的短帖。不要写新闻稿、摘要、导读、营销文案或解释说明。正文不要包含链接、URL 或链接占位符。',
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
        model: this.modelName,
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
    this.lastError = undefined;

    for (const content of contents) {
      try {
        const result = await this.generateDrafts(content, profile, options);
        results.push(result);

        // 添加延迟避免 API 限流
        await this.delay(500);
      } catch (error) {
        this.lastError = error instanceof Error ? error : new Error(String(error));
        logger.error(`Failed to generate drafts for content #${content.contentId}, skipping`, error);
        // 继续处理下一条
      }
    }

    logger.info(`Batch generation completed: ${results.length}/${contents.length} succeeded`);
    return results;
  }

  getLastError(): Error | undefined {
    return this.lastError;
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

    const prompt = `你要为一个中文 X/Twitter 账号写可直接发布的推文。

${styleDescription}

历史推文样本：
${sampleTweets}

原始内容：
标题：${content.content.title}
摘要：${content.content.content}
来源：${content.content.url}
推荐理由：${content.aiReason || '相关度高'}

任务：生成 3 个不同长度版本的推文草稿。每条都必须像账号本人临时发的一条推文，而不是资讯摘要。

1. **短版（short）**：60-120 字，一句话快评，先给判断
2. **中版（medium）**：150-280 字，判断 + 关键理由，适合正常单条推文
3. **长版（long）**：400-800 字，分段展开，适合长推，但不要写成文章

要求：
- 严格模仿账号的语气、节奏、句子长度和表达习惯
- 内容要有一个清晰观点或信息增量，不要只是复述标题
- 开头不要用“这篇文章/这个项目/这个内容/推荐阅读/值得一看/点击查看/了解更多”
- 不要写成新闻摘要、产品介绍、公众号导语、营销文案
- 不要使用“首先/其次/最后”这种文章结构
- 不要解释“我为什么这样写”，解释只能放在 reasoning 字段
- 短版不要换行；中版最多 2 段；长版最多 4 段
- 优先遵守短/中/长的字数范围；账号平均长度 ${targetLength.min}-${targetLength.max} 只作为语气参考
- ${emojiStrategy}
- 草稿正文不要包含任何链接、URL、[链接] 或“点击/查看原文”等导流话术
- 每个草稿附带生成理由（为什么这样写）

返回 JSON 格式（纯 JSON，不要 markdown 代码块）：
[
  {
    "content": "像真人发的推文正文",
    "style": "short",
    "reasoning": "内部说明，不要重复正文"
  },
  {
    "content": "像真人发的推文正文",
    "style": "medium",
    "reasoning": "内部说明，不要重复正文"
  },
  {
    "content": "像真人发的推文正文",
    "style": "long",
    "reasoning": "内部说明，不要重复正文"
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

      const drafts: Draft[] = parsed.map((item: any) => {
        const content = this.sanitizeDraftContent(item.content || '');
        return {
          content,
          style: this.normalizeDraftStyle(item.style),
          reasoning: item.reasoning || '',
          length: content.length,
        };
      });

      // 过滤掉异常超长的草稿
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

        // 尝试修复：如果只是超过宽松上限，截断处理
        if (draft.length > this.MAX_LENGTH && validation.issues.length === 1) {
          const fixed = this.truncateDraft(draft.content, this.MAX_LENGTH);
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

  private sanitizeDraftContent(content: string): string {
    return content
      .replace(/\[链接\]/g, '')
      .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\s+$/g, '')
      .trim();
  }

  private normalizeDraftStyle(style: unknown): DraftStyle {
    if (style === 'short' || style === 'medium' || style === 'long') {
      return style;
    }

    const legacyMap: Record<string, DraftStyle> = {
      opinion: 'short',
      share: 'medium',
      question: 'long',
    };

    if (typeof style === 'string' && legacyMap[style]) {
      return legacyMap[style];
    }

    return 'medium';
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
