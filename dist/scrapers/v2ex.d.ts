import { BaseScraper } from './base.js';
import { ContentItem } from '../types/content.js';
/**
 * V2EX 爬虫
 * 使用官方 API（无需认证）
 */
export declare class V2EXScraper extends BaseScraper {
    protected source: string;
    protected baseUrl: string;
    scrape(): Promise<ContentItem[]>;
    /**
     * 转换为标准格式
     */
    private convertToContentItem;
}
//# sourceMappingURL=v2ex.d.ts.map