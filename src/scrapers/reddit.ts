import { BaseScraper } from './base.js';
import { ContentItem } from '../types/content.js';
import { logger } from '../utils/logger.js';

interface RedditPost {
  data: {
    title: string;
    selftext: string;
    url: string;
    author: string;
    created_utc: number;
    ups: number;
    num_comments: number;
    permalink: string;
  };
}

interface RedditListing {
  data?: {
    children?: RedditPost[];
  };
}

/**
 * Reddit 爬虫
 * 使用公开的 JSON API（无需认证）
 */
export class RedditScraper extends BaseScraper {
  protected source = 'reddit';
  protected baseUrl = 'https://www.reddit.com';
  private subreddits = ['programming', 'technology'];

  async scrape(): Promise<ContentItem[]> {
    try {
      logger.info('Starting Reddit scrape...');

      const allItems: ContentItem[] = [];

      // 遍历每个 subreddit
      for (const subreddit of this.subreddits) {
        try {
          await this.rateLimiter.execute(async () => {
            const items = await this.scrapeSubreddit(subreddit);
            allItems.push(...items);
          });

          // 添加延迟，避免被限流
          await this.randomDelay(1000, 2000);
        } catch (error) {
          logger.error(`Failed to scrape r/${subreddit}:`, error as Error);
        }
      }

      // 去重
      const dedupedItems = this.deduplicateByUrl(allItems);

      logger.info(`Reddit scrape completed: ${dedupedItems.length} items collected`);

      return dedupedItems;
    } catch (error) {
      logger.error('Reddit scrape failed:', error as Error);
      return [];
    }
  }

  /**
   * 抓取单个 subreddit
   */
  private async scrapeSubreddit(subreddit: string): Promise<ContentItem[]> {
    const url = `${this.baseUrl}/r/${subreddit}/hot.json?limit=25`;

    try {
      logger.warn('Reddit public endpoint may be blocked in this network; consider configuring an official Reddit API client later.');
      const json = await this.fetchWithRetry<RedditListing>(url);
      const posts = json.data?.children || [];

      logger.debug(`Fetched ${posts.length} posts from r/${subreddit}`);

      // 转换为标准格式
      const items = posts
        .map((post: RedditPost) => this.convertToContentItem(post, subreddit))
        .filter((item: ContentItem) => this.validateItem(item));

      return items;
    } catch (error) {
      logger.error(`Failed to fetch r/${subreddit}:`, error as Error);
      return [];
    }
  }

  /**
   * 转换为标准格式
   */
  private convertToContentItem(post: RedditPost, subreddit: string): ContentItem {
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
