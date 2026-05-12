import { BaseScraper } from './base.js';
import { ContentItem } from '../types/content.js';
/**
 * 知乎内容爬虫
 * 热榜接口需要登录时，使用知乎日报公开 API 作为稳定 fallback
 */
export declare class ZhihuScraper extends BaseScraper {
    protected source: string;
    protected baseUrl: string;
    scrape(): Promise<ContentItem[]>;
    /**
     * 转换为标准格式
     */
    private convertToContentItem;
    /**
     * 解析热度值
     */
    private parseHeat;
}
//# sourceMappingURL=zhihu.d.ts.map