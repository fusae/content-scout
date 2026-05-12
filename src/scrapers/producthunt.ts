import { BaseScraper } from './base.js';
import { ContentItem } from '../types/content.js';
import { logger } from '../utils/logger.js';

interface ProductHuntPost {
  id: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  votesCount: number;
  commentsCount: number;
}

/**
 * Product Hunt 爬虫
 * 使用官方 GraphQL API
 * 需要 API Token: https://api.producthunt.com/v2/docs
 */
export class ProductHuntScraper extends BaseScraper {
  protected source = 'producthunt';
  protected baseUrl = 'https://api.producthunt.com/v2/api/graphql';
  private apiToken: string;

  constructor(rateLimiter: any) {
    super(rateLimiter);
    this.apiToken = process.env.PRODUCTHUNT_API_TOKEN || '';

    if (!this.apiToken) {
      logger.warn('PRODUCTHUNT_API_TOKEN not set, Product Hunt scraper will be disabled');
    }
  }

  async scrape(): Promise<ContentItem[]> {
    if (!this.apiToken) {
      logger.warn('Skipping Product Hunt scrape: API token not configured');
      return [];
    }

    try {
      logger.info('Starting Product Hunt scrape...');

      // GraphQL 查询：获取今日热门产品
      const query = `
        query {
          posts(order: VOTES, postedAfter: "${this.getTodayStart()}") {
            edges {
              node {
                id
                name
                tagline
                description
                url
                votesCount
                commentsCount
              }
            }
          }
        }
      `;

      const response = await this.axiosInstance.post(
        this.baseUrl,
        { query },
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const posts = response.data?.data?.posts?.edges || [];
      logger.debug(`Fetched ${posts.length} posts from Product Hunt`);

      // 转换为标准格式
      const items = posts
        .map((edge: any) => this.convertToContentItem(edge.node as ProductHuntPost))
        .filter((item: ContentItem) => this.validateItem(item));

      // 去重
      const dedupedItems = this.deduplicateByUrl(items);

      logger.info(`Product Hunt scrape completed: ${dedupedItems.length} items collected`);

      return dedupedItems;
    } catch (error) {
      logger.error('Product Hunt scrape failed:', error as Error);
      // 不抛出错误，返回空数组
      return [];
    }
  }

  /**
   * 获取今天的开始时间（ISO 格式）
   */
  private getTodayStart(): string {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.toISOString();
  }

  /**
   * 转换为标准格式
   */
  private convertToContentItem(post: ProductHuntPost): ContentItem {
    const content = post.description || post.tagline;

    return {
      source: 'producthunt',
      title: `${post.name} - ${post.tagline}`,
      content: this.cleanContent(content),
      url: post.url,
      publishedAt: new Date(), // Product Hunt API 返回的是今日产品
      metrics: {
        points: post.votesCount,
        comments: post.commentsCount,
      },
      collectedAt: new Date(),
    };
  }
}
