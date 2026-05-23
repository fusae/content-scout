import { FilteredContent } from '../filter/types.js';
import { Draft } from '../generator/types.js';
import { CardActionValue } from './types.js';

/**
 * 飞书交互式卡片构建器
 */
export class CardBuilder {
  /**
   * 构建推荐卡片
   */
  static buildRecommendationCard(
    content: FilteredContent,
    drafts: Draft[],
    recommendationId: number
  ): any {
    const { content: contentItem, aiScore, aiReason } = content;

    return {
      config: {
        wide_screen_mode: true,
      },
      header: {
        title: {
          content: `💡 推荐话题 (适配度: ${aiScore?.toFixed(1) || 'N/A'}/10)`,
          tag: 'plain_text',
        },
        template: 'blue',
      },
      elements: [
        // 原始内容
        {
          tag: 'div',
          text: {
            content: `**${contentItem.title}**\n来源: ${contentItem.source} | 作者: ${contentItem.author || '未知'}`,
            tag: 'lark_md',
          },
        },
        {
          tag: 'hr',
        },
        // 内容摘要
        {
          tag: 'div',
          text: {
            content: `**内容摘要：**\n${this.truncateText(contentItem.content, 200)}`,
            tag: 'lark_md',
          },
        },
        {
          tag: 'hr',
        },
        // 匹配原因
        {
          tag: 'div',
          text: {
            content: `**为什么推荐：**\n${aiReason || '与你的兴趣高度相关'}`,
            tag: 'lark_md',
          },
        },
        {
          tag: 'hr',
        },
        // 草稿标题
        {
          tag: 'div',
          text: {
            content: '**推文草稿：**',
            tag: 'lark_md',
          },
        },
        // 草稿 1-3
        ...this.buildDraftElements(drafts, recommendationId, content.contentId),
        {
          tag: 'hr',
        },
        // 操作按钮
        {
          tag: 'action',
          actions: [
            {
              tag: 'button',
              text: {
                content: '📋 复制短版',
                tag: 'plain_text',
              },
              type: 'primary',
              value: {
                action: 'copy',
                draft_index: 0,
                content_id: content.contentId,
                recommendation_id: recommendationId,
              } as CardActionValue,
            },
            {
              tag: 'button',
              text: {
                content: '📋 复制中版',
                tag: 'plain_text',
              },
              type: 'primary',
              value: {
                action: 'copy',
                draft_index: 1,
                content_id: content.contentId,
                recommendation_id: recommendationId,
              } as CardActionValue,
            },
            {
              tag: 'button',
              text: {
                content: '📋 复制长版',
                tag: 'plain_text',
              },
              type: 'primary',
              value: {
                action: 'copy',
                draft_index: 2,
                content_id: content.contentId,
                recommendation_id: recommendationId,
              } as CardActionValue,
            },
          ],
        },
        {
          tag: 'action',
          actions: [
            {
              tag: 'button',
              text: {
                content: '✍️ 写成文章',
                tag: 'plain_text',
              },
              type: 'primary',
              value: {
                action: 'article',
                content_id: content.contentId,
                recommendation_id: recommendationId,
              } as CardActionValue,
            },
            {
              tag: 'button',
              text: {
                content: '👎 不感兴趣',
                tag: 'plain_text',
              },
              type: 'default',
              value: {
                action: 'reject',
                content_id: content.contentId,
                recommendation_id: recommendationId,
              } as CardActionValue,
            },
            {
              tag: 'button',
              text: {
                content: '🔗 查看原文',
                tag: 'plain_text',
              },
              type: 'default',
              url: contentItem.url,
            },
          ],
        },
      ],
    };
  }

  /**
   * 构建草稿元素
   */
  private static buildDraftElements(
    drafts: Draft[],
    _recommendationId: number,
    _contentId: number
  ): any[] {
    const elements: any[] = [];

    drafts.forEach((draft, index) => {
      const styleLabel = this.getStyleLabel(draft.style);

      elements.push({
        tag: 'div',
        text: {
          content: `**草稿 ${index + 1} (${styleLabel})：**\n${draft.content}\n\n生成思路：${draft.reasoning}\n字数: ${draft.length}`,
          tag: 'lark_md',
        },
      });

      // 在草稿之间添加分隔线（除了最后一个）
      if (index < drafts.length - 1) {
        elements.push({
          tag: 'hr',
        });
      }
    });

    return elements;
  }

  /**
   * 获取风格标签
   */
  private static getStyleLabel(style: string): string {
    const labels: Record<string, string> = {
      short: '短版',
      medium: '中版',
      long: '长版',
      opinion: '短版',
      share: '中版',
      question: '长版',
    };
    return labels[style] || style;
  }

  /**
   * 截断文本
   */
  private static truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + '...';
  }

  /**
   * 构建批量推荐摘要卡片
   */
  static buildBatchSummaryCard(count: number): any {
    return {
      config: {
        wide_screen_mode: true,
      },
      header: {
        title: {
          content: `🎯 今日推荐 (${count} 条)`,
          tag: 'plain_text',
        },
        template: 'green',
      },
      elements: [
        {
          tag: 'div',
          text: {
            content: `为你精选了 **${count}** 条优质内容，每条都附带短/中/长 3 个推文草稿。\n\n你可以直接复制发布，也可以把合适的话题一键转成文章任务。`,
            tag: 'lark_md',
          },
        },
      ],
    };
  }

  /**
   * 构建反馈确认卡片
   */
  static buildFeedbackCard(action: 'accepted' | 'rejected', draftIndex?: number): any {
    const messages = {
      accepted: `✅ ${this.getDraftIndexLabel(draftIndex)}已复制！\n\n去 X 发布吧。`,
      rejected: '👌 已记录你的反馈！\n\n我们会根据你的偏好优化后续推荐。',
    };

    return {
      config: {
        wide_screen_mode: true,
      },
      header: {
        title: {
          content: action === 'accepted' ? '✅ 操作成功' : '👌 已记录',
          tag: 'plain_text',
        },
        template: action === 'accepted' ? 'green' : 'grey',
      },
      elements: [
        {
          tag: 'div',
          text: {
            content: messages[action],
            tag: 'lark_md',
          },
        },
      ],
    };
  }

  private static getDraftIndexLabel(draftIndex?: number): string {
    const labels = ['短版草稿', '中版草稿', '长版草稿'];
    return labels[draftIndex || 0] || `草稿 ${(draftIndex || 0) + 1}`;
  }
}
