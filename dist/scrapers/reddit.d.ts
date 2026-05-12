import { BaseScraper } from './base.js';
import { ContentItem } from '../types/content.js';
/**
 * Reddit 爬虫
 * 使用公开的 JSON API（无需认证）
 */
export declare class RedditScraper extends BaseScraper {
    protected source: string;
    protected baseUrl: string;
    private subreddits;
    scrape(): Promise<ContentItem[]>;
    /**
     * 抓取单个 subreddit
     */
    private scrapeSubreddit;
    /**
     * 转换为标准格式
     */
    private convertToContentItem;
}
//# sourceMappingURL=reddit.d.ts.map