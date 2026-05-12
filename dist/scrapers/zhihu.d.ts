import { BaseScraper } from './base.js';
import { ContentItem } from '../types/content.js';
/**
 * 知乎热榜爬虫
 * 使用 Puppeteer 抓取
 */
export declare class ZhihuScraper extends BaseScraper {
    protected source: string;
    protected baseUrl: string;
    private browser;
    scrape(): Promise<ContentItem[]>;
    /**
     * 解析知乎热榜
     */
    private parseHotItems;
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