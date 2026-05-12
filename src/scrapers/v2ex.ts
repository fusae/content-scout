import { BaseScraper } from './base.js';
import { ContentItem } from '../types/content.js';
import { logger } from '../utils/logger.js';

interface V2EXTopic {
  id: number;
  title: string;
  content: string;
  content_rendered: string;
  url: string;
  member: {
    username: string;
  };
  created: number;
  replies: number;
}

/**
 * V2EX 爬虫
 * 使用官方 API（无需认证）
 */
export class V2EXScraper extends BaseScraper {
  protected source = 'v2ex';
  protected baseUrl = 'https://www.v2ex.com/api';

  async scrape(): Promise<ContentItem[]> {
    try {
      logger.info('Starting V2EX scrape...');

      const url = `${this.baseUrl}/topics/hot.json`;
      const topics = await this.fetchWithRetry<V2EXTopic[]>(url);

      logger.debug(`Fetched ${topics.length} hot topics from V2EX`);

      // 转换为标准格式
      const items = topics
        .map((topic) => this.convertToContentItem(topic))
        .filter((item) => this.validateItem(item));

      // 去重
      const dedupedItems = this.deduplicateByUrl(items);

      logger.info(`V2EX scrape completed: ${dedupedItems.length} items collected`);

      return dedupedItems;
    } catch (error) {
      logger.error('V2EX scrape failed:', error as Error);
      return [];
    }
  }

  /**
   * 转换为标准格式
   */
  private convertToContentItem(topic: V2EXTopic): ContentItem {
    // V2EX 的 content 可能包含 HTML
    const content = topic.content
      ? this.cleanContent(this.stripHtml(topic.content))
      : topic.title;

    return {
      source: 'v2ex',
      title: topic.title,
      content: content,
      url: topic.url,
      author: topic.member?.username,
      publishedAt: new Date(topic.created * 1000),
      metrics: {
        comments: topic.replies,
      },
      collectedAt: new Date(),
    };
  }
}
