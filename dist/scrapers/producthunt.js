import { BaseScraper } from './base.js';
import { logger } from '../utils/logger.js';
/**
 * Product Hunt 爬虫
 * 使用官方 GraphQL API
 * 需要 API Token: https://api.producthunt.com/v2/docs
 */
export class ProductHuntScraper extends BaseScraper {
    source = 'producthunt';
    baseUrl = 'https://api.producthunt.com/v2/api/graphql';
    apiToken;
    constructor(rateLimiter) {
        super(rateLimiter);
        this.apiToken = process.env.PRODUCTHUNT_API_TOKEN || '';
        if (!this.apiToken) {
            logger.warn('PRODUCTHUNT_API_TOKEN not set, Product Hunt scraper will be disabled');
        }
    }
    async scrape() {
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
            const response = await this.axiosInstance.post(this.baseUrl, { query }, {
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json',
                },
            });
            const posts = response.data?.data?.posts?.edges || [];
            logger.debug(`Fetched ${posts.length} posts from Product Hunt`);
            // 转换为标准格式
            const items = posts
                .map((edge) => this.convertToContentItem(edge.node))
                .filter((item) => this.validateItem(item));
            // 去重
            const dedupedItems = this.deduplicateByUrl(items);
            logger.info(`Product Hunt scrape completed: ${dedupedItems.length} items collected`);
            return dedupedItems;
        }
        catch (error) {
            logger.error('Product Hunt scrape failed:', error);
            // 不抛出错误，返回空数组
            return [];
        }
    }
    /**
     * 获取今天的开始时间（ISO 格式）
     */
    getTodayStart() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return today.toISOString();
    }
    /**
     * 转换为标准格式
     */
    convertToContentItem(post) {
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
//# sourceMappingURL=producthunt.js.map