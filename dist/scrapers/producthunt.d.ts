import { BaseScraper } from './base.js';
import { ContentItem } from '../types/content.js';
/**
 * Product Hunt 爬虫
 * 使用官方 GraphQL API
 * 需要 API Token: https://api.producthunt.com/v2/docs
 */
export declare class ProductHuntScraper extends BaseScraper {
    protected source: string;
    protected baseUrl: string;
    private apiToken;
    constructor(rateLimiter: any);
    scrape(): Promise<ContentItem[]>;
    /**
     * 获取今天的开始时间（ISO 格式）
     */
    private getTodayStart;
    /**
     * 转换为标准格式
     */
    private convertToContentItem;
}
//# sourceMappingURL=producthunt.d.ts.map