import { BaseScraper } from './base.js';
import { ContentItem } from '../types/content.js';
/**
 * X (Twitter) 爬虫
 * 注意：X 有严格的反爬虫机制，需要谨慎使用
 * 策略：
 * 1. 使用 Puppeteer 模拟真实浏览器
 * 2. 添加随机延迟
 * 3. 限制抓取频率
 */
export declare class XScraper extends BaseScraper {
    protected source: string;
    protected baseUrl: string;
    private browser;
    private maxTweets;
    scrape(): Promise<ContentItem[]>;
    /**
     * 解析推文
     * 注意：X 的 DOM 结构经常变化，这个实现可能需要更新
     */
    private parseTweets;
    /**
     * 转换为标准格式
     */
    private convertToContentItem;
}
//# sourceMappingURL=x-scraper.d.ts.map