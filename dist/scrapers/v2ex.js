import { BaseScraper } from './base.js';
import { logger } from '../utils/logger.js';
/**
 * V2EX 爬虫
 * 使用官方 API（无需认证）
 */
export class V2EXScraper extends BaseScraper {
    source = 'v2ex';
    baseUrl = 'https://www.v2ex.com/api';
    async scrape() {
        try {
            logger.info('Starting V2EX scrape...');
            const url = `${this.baseUrl}/topics/hot.json`;
            const topics = await this.fetchWithRetry(url);
            logger.debug(`Fetched ${topics.length} hot topics from V2EX`);
            // 转换为标准格式
            const items = topics
                .map((topic) => this.convertToContentItem(topic))
                .filter((item) => this.validateItem(item));
            // 去重
            const dedupedItems = this.deduplicateByUrl(items);
            logger.info(`V2EX scrape completed: ${dedupedItems.length} items collected`);
            return dedupedItems;
        }
        catch (error) {
            logger.error('V2EX scrape failed:', error);
            return [];
        }
    }
    /**
     * 转换为标准格式
     */
    convertToContentItem(topic) {
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
//# sourceMappingURL=v2ex.js.map