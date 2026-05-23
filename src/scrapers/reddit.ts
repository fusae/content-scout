import { BaseScraper } from './base.js';
import { ContentItem } from '../types/content.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import type { RateLimiter } from '../utils/rate-limiter.js';
import type { RedditSourceRuntimeConfig } from '../types/runtime-config.js';

interface RedditRssEntry {
  title: string;
  content: string;
  url: string;
  author: string;
  publishedAt: Date;
}

/**
 * Reddit 爬虫
 * API 审批前使用公开 RSS
 */
export class RedditScraper extends BaseScraper {
  protected source = 'reddit';
  protected baseUrl = 'https://www.reddit.com';
  private subreddits: string[];

  constructor(rateLimiter: RateLimiter, sourceConfig?: RedditSourceRuntimeConfig) {
    super(rateLimiter);
    this.subreddits = sourceConfig?.subreddits || config.reddit.subreddits;
  }

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
    const url = `${this.baseUrl}/r/${subreddit}/.rss`;

    try {
      const xml = await this.fetchWithRetry<string>(url);
      const entries = this.parseAtomEntries(xml);

      logger.debug(`Fetched ${entries.length} RSS entries from r/${subreddit}`);

      // 转换为标准格式
      const items = entries
        .map((entry) => this.convertToContentItem(entry, subreddit))
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
  private convertToContentItem(entry: RedditRssEntry, subreddit: string): ContentItem {
    return {
      source: 'reddit',
      title: `[r/${subreddit}] ${entry.title}`,
      content: this.cleanContent(this.stripHtml(this.decodeHtml(entry.content)) || entry.title),
      url: entry.url,
      author: entry.author,
      publishedAt: entry.publishedAt,
      metrics: {
        points: 0,
        comments: 0,
      },
      collectedAt: new Date(),
    };
  }

  private parseAtomEntries(xml: string): RedditRssEntry[] {
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];

    return entries.map(([, entryXml]) => {
      const title = this.decodeHtml(this.getTagValue(entryXml, 'title'));
      const content = this.getTagValue(entryXml, 'content');
      const author = this.decodeHtml(this.getNestedTagValue(entryXml, 'author', 'name')).replace(/^\/u\//, '');
      const url = this.getLinkHref(entryXml);
      const published = this.getTagValue(entryXml, 'published') || this.getTagValue(entryXml, 'updated');

      return {
        title,
        content,
        url,
        author,
        publishedAt: published ? new Date(published) : new Date(),
      };
    });
  }

  private getTagValue(xml: string, tagName: string): string {
    const match = xml.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`));
    return match?.[1]?.trim() || '';
  }

  private getNestedTagValue(xml: string, parentTagName: string, childTagName: string): string {
    const parent = this.getTagValue(xml, parentTagName);
    return parent ? this.getTagValue(parent, childTagName) : '';
  }

  private getLinkHref(xml: string): string {
    const match = xml.match(/<link\s+href="([^"]+)"/);
    return this.decodeHtml(match?.[1] || '');
  }

  private decodeHtml(text: string): string {
    if (!text) return '';

    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#32;/g, ' ')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  }
}
