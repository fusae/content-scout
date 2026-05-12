import { BaseScraper } from './base.js';
import { ContentItem } from '../types/content.js';
/**
 * GitHub Trending 爬虫
 * 使用 Puppeteer 抓取（无官方 API）
 */
export declare class GitHubTrendingScraper extends BaseScraper {
    protected source: string;
    protected baseUrl: string;
    private browser;
    scrape(): Promise<ContentItem[]>;
    /**
     * 解析 GitHub Trending 页面
     */
    private parseRepos;
    /**
     * 转换为标准格式
     */
    private convertToContentItem;
}
//# sourceMappingURL=github-trending.d.ts.map