import { BaseScraper } from './base.js';
import { ContentItem } from '../types/content.js';
import { logger } from '../utils/logger.js';

interface HNItem {
  id: number;
  title?: string;
  url?: string;
  text?: string;
  by?: string;
  time?: number;
  score?: number;
  descendants?: number;
  type?: string;
}

/**
 * Hacker News 爬虫
 * 使用官方 API: https://hacker-news.firebaseio.com/v0/
 */
export class HackerNewsScraper extends BaseScraper {
  protected source = 'hackernews';
  protected baseUrl = 'https://hacker-news.firebaseio.com/v0';

  async scrape(): Promise<ContentItem[]> {
    try {
      logger.info('Starting Hacker News scrape...');

      // 获取 Top Stories IDs
      const topStoriesUrl = `${this.baseUrl}/topstories.json`;
      const topStoriesData = await this.fetchWithRetry(topStoriesUrl);
      const topStoryIds = JSON.parse(topStoriesData) as number[];

      // 限制获取前 30 条
      const limitedIds = topStoryIds.slice(0, 30);
      logger.info(`Fetching ${limitedIds.length} top stories from Hacker News`);

      // 并发获取每条故事的详情
      const items: ContentItem[] = [];
      for (const id of limitedIds) {
        try {
          await this.rateLimiter.execute(async () => {
            const itemUrl = `${this.baseUrl}/item/${id}.json`;
            const itemData = await this.fetchWithRetry(itemUrl);
            const hnItem = JSON.parse(itemData) as HNItem;

            // 只处理 story 类型
            if (hnItem.type === 'story' && hnItem.title) {
              const contentItem = this.convertToContentItem(hnItem);
              if (this.validateItem(contentItem)) {
                items.push(contentItem);
              }
            }
          });
        } catch (error) {
          logger.error(`Failed to fetch HN item ${id}:`, error as Error);
        }
      }

      // 去重
      const dedupedItems = this.deduplicateByUrl(items);
      logger.info(`Hacker News scrape completed: ${dedupedItems.length} items collected`);

      return dedupedItems;
    } catch (error) {
      logger.error('Hacker News scrape failed:', error as Error);
      throw error;
    }
  }

  /**
   * 转换 HN 数据为标准格式
   */
  private convertToContentItem(hnItem: HNItem): ContentItem {
    // HN 的 text 字段包含 HTML，需要清理
    const content = hnItem.text
      ? this.cleanContent(this.stripHtml(hnItem.text))
      : hnItem.title || '';

    // 如果没有外部 URL，使用 HN 的讨论页面
    const url = hnItem.url || `https://news.ycombinator.com/item?id=${hnItem.id}`;

    return {
      source: 'hackernews',
      title: hnItem.title || '',
      content: content,
      url: url,
      author: hnItem.by,
      publishedAt: hnItem.time ? new Date(hnItem.time * 1000) : new Date(),
      metrics: {
        points: hnItem.score,
        comments: hnItem.descendants,
      },
      collectedAt: new Date(),
    };
  }
}
