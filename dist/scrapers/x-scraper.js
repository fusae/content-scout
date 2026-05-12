import { BaseScraper } from './base.js';
import { logger } from '../utils/logger.js';
/**
 * X (Twitter) 爬虫
 * 注意：X 有严格的反爬虫机制，需要谨慎使用
 * 策略：
 * 1. 使用 Puppeteer 模拟真实浏览器
 * 2. 添加随机延迟
 * 3. 限制抓取频率
 */
export class XScraper extends BaseScraper {
    source = 'x';
    baseUrl = 'https://api.twitter.com/2';
    maxTweets = 10; // 限制抓取数量，避免被封
    async scrape() {
        try {
            logger.info('Starting X (Twitter) scrape...');
            const bearerToken = process.env.X_BEARER_TOKEN;
            if (!bearerToken) {
                logger.warn('X_BEARER_TOKEN not set, skipping X scrape');
                return [];
            }
            const tweets = await this.searchTweets(bearerToken);
            if (tweets.length === 0) {
                logger.warn('No tweets collected from X. This may indicate anti-bot detection.');
                return [];
            }
            // 转换为标准格式
            const items = tweets.map((tweet) => this.convertToContentItem(tweet));
            // 验证和去重
            const validItems = items.filter((item) => this.validateItem(item));
            const dedupedItems = this.deduplicateByUrl(validItems);
            logger.info(`X scrape completed: ${dedupedItems.length} items collected`);
            return dedupedItems;
        }
        catch (error) {
            logger.error('X scrape failed:', error);
            return [];
        }
    }
    /**
     * 使用 X API 搜索 AI/开发相关推文
     */
    async searchTweets(bearerToken) {
        const query = encodeURIComponent('(AI OR "AI agent" OR Codex OR LLM OR developer tools) lang:en -is:retweet');
        const url = `${this.baseUrl}/tweets/search/recent?query=${query}` +
            `&max_results=${this.maxTweets}` +
            '&tweet.fields=created_at,public_metrics,author_id' +
            '&expansions=author_id' +
            '&user.fields=username,name';
        const response = await this.axiosInstance.get(url, {
            headers: {
                Authorization: `Bearer ${bearerToken}`,
            },
        });
        const users = new Map((response.data.includes?.users || []).map((user) => [user.id, user]));
        return (response.data.data || []).map((tweet) => {
            const user = tweet.author_id ? users.get(tweet.author_id) : undefined;
            const username = user?.username || tweet.author_id || 'unknown';
            return {
                text: tweet.text,
                author: user?.name || username,
                url: `https://x.com/${username}/status/${tweet.id}`,
                likes: tweet.public_metrics?.like_count,
                retweets: tweet.public_metrics?.retweet_count,
                replies: tweet.public_metrics?.reply_count,
                createdAt: tweet.created_at,
            };
        });
    }
    /**
     * 转换为标准格式
     */
    convertToContentItem(tweet) {
        return {
            source: 'x',
            title: tweet.text.substring(0, 100) + (tweet.text.length > 100 ? '...' : ''),
            content: this.cleanContent(tweet.text),
            url: tweet.url,
            author: tweet.author,
            publishedAt: tweet.createdAt ? new Date(tweet.createdAt) : new Date(),
            metrics: {
                likes: tweet.likes,
                shares: tweet.retweets,
                comments: tweet.replies,
            },
            collectedAt: new Date(),
        };
    }
}
//# sourceMappingURL=x-scraper.js.map