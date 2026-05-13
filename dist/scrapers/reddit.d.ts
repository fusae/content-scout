import { BaseScraper } from './base.js';
import { ContentItem } from '../types/content.js';
/**
 * Reddit 爬虫
 * API 审批前使用公开 RSS
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
    private parseAtomEntries;
    private getTagValue;
    private getNestedTagValue;
    private getLinkHref;
    private decodeHtml;
}
//# sourceMappingURL=reddit.d.ts.map