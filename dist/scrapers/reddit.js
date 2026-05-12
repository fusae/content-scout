import { BaseScraper } from './base.js';
import { logger } from '../utils/logger.js';
/**
 * Reddit 爬虫
 * 使用公开的 JSON API（无需认证）
 */
export class RedditScraper extends BaseScraper {
    source = 'reddit';
    baseUrl = 'https://www.reddit.com';
    subreddits = ['programming', 'technology'];
    async scrape() {
        try {
            logger.info('Starting Reddit scrape...');
            const allItems = [];
            // 遍历每个 subreddit
            for (const subreddit of this.subreddits) {
                try {
                    await this.rateLimiter.execute(async () => {
                        const items = await this.scrapeSubreddit(subreddit);
                        allItems.push(...items);
                    });
                    // 添加延迟，避免被限流
                    await this.randomDelay(1000, 2000);
                }
                catch (error) {
                    logger.error(`Failed to scrape r/${subreddit}:`, error);
                }
            }
            // 去重
            const dedupedItems = this.deduplicateByUrl(allItems);
            logger.info(`Reddit scrape completed: ${dedupedItems.length} items collected`);
            return dedupedItems;
        }
        catch (error) {
            logger.error('Reddit scrape failed:', error);
            return [];
        }
    }
    /**
     * 抓取单个 subreddit
     */
    async scrapeSubreddit(subreddit) {
        const url = `${this.baseUrl}/r/${subreddit}/hot.json?limit=25`;
        try {
            const data = await this.fetchWithRetry(url);
            const json = JSON.parse(data);
            const posts = json.data?.children || [];
            logger.debug(`Fetched ${posts.length} posts from r/${subreddit}`);
            // 转换为标准格式
            const items = posts
                .map((post) => this.convertToContentItem(post, subreddit))
                .filter((item) => this.validateItem(item));
            return items;
        }
        catch (error) {
            logger.error(`Failed to fetch r/${subreddit}:`, error);
            return [];
        }
    }
    /**
     * 转换为标准格式
     */
    convertToContentItem(post, subreddit) {
        const postData = post.data;
        const content = postData.selftext || postData.title;
        const url = postData.url.startsWith('http')
            ? postData.url
            : `${this.baseUrl}${postData.permalink}`;
        return {
            source: 'reddit',
            title: `[r/${subreddit}] ${postData.title}`,
            content: this.cleanContent(content),
            url: url,
            author: postData.author,
            publishedAt: new Date(postData.created_utc * 1000),
            metrics: {
                points: postData.ups,
                comments: postData.num_comments,
            },
            collectedAt: new Date(),
        };
    }
}
//# sourceMappingURL=reddit.js.map