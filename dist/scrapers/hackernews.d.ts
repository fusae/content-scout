import { BaseScraper } from './base.js';
import { ContentItem } from '../types/content.js';
/**
 * Hacker News 爬虫
 * 使用官方 API: https://hacker-news.firebaseio.com/v0/
 */
export declare class HackerNewsScraper extends BaseScraper {
    protected source: string;
    protected baseUrl: string;
    scrape(): Promise<ContentItem[]>;
    /**
     * 转换 HN 数据为标准格式
     */
    private convertToContentItem;
}
//# sourceMappingURL=hackernews.d.ts.map