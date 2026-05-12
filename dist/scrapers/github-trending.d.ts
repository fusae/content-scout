import { BaseScraper } from './base.js';
import { ContentItem } from '../types/content.js';
/**
 * GitHub Trending 爬虫
 * 使用 HTTP 抓取 Trending 页面，避免 Puppeteer 导航超时
 */
export declare class GitHubTrendingScraper extends BaseScraper {
    protected source: string;
    protected baseUrl: string;
    scrape(): Promise<ContentItem[]>;
    /**
     * 解析 GitHub Trending 页面
     */
    private parseRepos;
    private decodeHtml;
    /**
     * 转换为标准格式
     */
    private convertToContentItem;
}
//# sourceMappingURL=github-trending.d.ts.map