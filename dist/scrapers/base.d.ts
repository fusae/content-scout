import { AxiosInstance } from 'axios';
import { ContentItem } from '../types/content.js';
import { RateLimiter } from '../utils/rate-limiter.js';
/**
 * 爬虫基类 - 提供通用功能
 */
export declare abstract class BaseScraper {
    protected abstract source: string;
    protected abstract baseUrl: string;
    protected rateLimiter: RateLimiter;
    protected axiosInstance: AxiosInstance;
    private userAgents;
    constructor(rateLimiter: RateLimiter);
    /**
     * 抓取内容 - 子类必须实现
     */
    abstract scrape(): Promise<ContentItem[]>;
    /**
     * 带重试的 HTTP 请求
     */
    protected fetchWithRetry(url: string): Promise<string>;
    /**
     * 获取随机 User-Agent
     */
    protected getRandomUserAgent(): string;
    /**
     * URL 去重
     */
    protected deduplicateByUrl(items: ContentItem[]): ContentItem[];
    /**
     * 标题 + URL 哈希去重
     */
    protected deduplicateByHash(items: ContentItem[]): ContentItem[];
    /**
     * 生成内容哈希
     */
    protected generateHash(content: string): string;
    /**
     * 清洗内容文本
     */
    protected cleanContent(text: string): string;
    /**
     * 清洗 HTML 标签
     */
    protected stripHtml(html: string): string;
    /**
     * 验证内容项
     */
    protected validateItem(item: ContentItem): boolean;
    /**
     * 随机延迟（防止被封）
     */
    protected randomDelay(min?: number, max?: number): Promise<void>;
}
//# sourceMappingURL=base.d.ts.map