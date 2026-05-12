import { BaseScraper } from './base.js';
import { logger } from '../utils/logger.js';
/**
 * 知乎内容爬虫
 * 热榜接口需要登录时，使用知乎日报公开 API 作为稳定 fallback
 */
export class ZhihuScraper extends BaseScraper {
    source = 'zhihu';
    baseUrl = 'https://daily.zhihu.com/api/4/news/latest';
    async scrape() {
        try {
            logger.info('Starting Zhihu scrape...');
            const response = await this.fetchWithRetry(this.baseUrl);
            const hotItems = (response.stories || []).map((story) => ({
                title: story.title,
                url: story.url,
                excerpt: story.hint || story.title,
                heat: '',
            }));
            const items = hotItems.map((item) => this.convertToContentItem(item));
            // 验证和去重
            const validItems = items.filter((item) => this.validateItem(item));
            const dedupedItems = this.deduplicateByUrl(validItems);
            logger.info(`Zhihu scrape completed: ${dedupedItems.length} items collected`);
            return dedupedItems;
        }
        catch (error) {
            logger.error('Zhihu scrape failed:', error);
            return [];
        }
    }
    /**
     * 转换为标准格式
     */
    convertToContentItem(item) {
        const content = item.excerpt || item.title;
        return {
            source: 'zhihu',
            title: item.title,
            content: this.cleanContent(content),
            url: item.url,
            publishedAt: new Date(), // 知乎热榜没有时间戳
            metrics: {
                // 热度值通常是 "XXX 万热度" 格式
                points: this.parseHeat(item.heat),
            },
            collectedAt: new Date(),
        };
    }
    /**
     * 解析热度值
     */
    parseHeat(heat) {
        if (!heat)
            return undefined;
        const match = heat.match(/([\d.]+)\s*万/);
        if (match) {
            return Math.floor(parseFloat(match[1]) * 10000);
        }
        const numMatch = heat.match(/[\d,]+/);
        if (numMatch) {
            return parseInt(numMatch[0].replace(/,/g, ''), 10);
        }
        return undefined;
    }
}
//# sourceMappingURL=zhihu.js.map