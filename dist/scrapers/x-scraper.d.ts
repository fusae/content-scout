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
    private maxTweets;
    scrape(): Promise<ContentItem[]>;
    /**
     * 使用 X API 搜索 AI/开发相关推文
     */
    private searchTweets;
    /**
     * 转换为标准格式
     */
    private convertToContentItem;
}
//# sourceMappingURL=x-scraper.d.ts.map