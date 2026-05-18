import { ContentItem, ScraperStats } from '../types/content.js';
import { DatabaseManager, ContentPool } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import {
  HackerNewsScraper,
  GitHubTrendingScraper,
  XScraper,
  ZhihuScraper,
  ProductHuntScraper,
  RedditScraper,
  V2EXScraper,
  BaseScraper,
} from '../scrapers/index.js';
import crypto from 'crypto';

/**
 * 内容聚合器 - 协调所有爬虫并管理内容存储
 */
export class ContentAggregator {
  private db: DatabaseManager;
  private scrapers: Map<string, BaseScraper>;
  private rateLimiter: RateLimiter;

  constructor(db: DatabaseManager) {
    this.db = db;
    this.rateLimiter = new RateLimiter({
      maxConcurrent: 3,
      minDelay: 1000, // 1秒最小间隔
    });

    // 初始化所有爬虫
    this.scrapers = new Map<string, BaseScraper>([
      ['hackernews', new HackerNewsScraper(this.rateLimiter)],
      ['github', new GitHubTrendingScraper(this.rateLimiter)],
      ['x', new XScraper(this.rateLimiter)],
      ['zhihu', new ZhihuScraper(this.rateLimiter)],
      ['producthunt', new ProductHuntScraper(this.rateLimiter)],
      ['reddit', new RedditScraper(this.rateLimiter)],
      ['v2ex', new V2EXScraper(this.rateLimiter)],
    ]);

    logger.info(`ContentAggregator initialized with ${this.scrapers.size} scrapers`);
  }

  /**
   * 运行所有爬虫
   */
  async aggregateAll(): Promise<ScraperStats[]> {
    logger.info('Starting content aggregation from all sources...');
    const startTime = Date.now();

    const stats: ScraperStats[] = [];

    // 并发运行所有爬虫
    const promises = Array.from(this.scrapers.entries()).map(async ([source, scraper]) => {
      return this.runScraper(source, scraper);
    });

    const results = await Promise.allSettled(promises);

    // 收集统计信息
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        stats.push(result.value);
      } else {
        const source = Array.from(this.scrapers.keys())[index];
        logger.error(`Scraper ${source} failed:`, result.reason);
        stats.push({
          source,
          itemsCollected: 0,
          itemsDeduped: 0,
          itemsSaved: 0,
          errors: 1,
          duration: 0,
        });
      }
    });

    const totalDuration = Date.now() - startTime;
    logger.info(`Content aggregation completed in ${totalDuration}ms`);
    this.logStats(stats);

    return stats;
  }

  /**
   * 运行指定的爬虫
   */
  async aggregateFrom(sources: string[]): Promise<ScraperStats[]> {
    logger.info(`Starting content aggregation from: ${sources.join(', ')}`);

    const stats: ScraperStats[] = [];

    for (const source of sources) {
      const scraper = this.scrapers.get(source);
      if (!scraper) {
        logger.warn(`Unknown scraper: ${source}`);
        continue;
      }

      try {
        const stat = await this.runScraper(source, scraper);
        stats.push(stat);
      } catch (error) {
        logger.error(`Scraper ${source} failed:`, error as Error);
        stats.push({
          source,
          itemsCollected: 0,
          itemsDeduped: 0,
          itemsSaved: 0,
          errors: 1,
          duration: 0,
        });
      }
    }

    this.logStats(stats);
    return stats;
  }

  /**
   * 运行单个爬虫
   */
  private async runScraper(source: string, scraper: BaseScraper): Promise<ScraperStats> {
    const startTime = Date.now();
    let itemsCollected = 0;
    let itemsDeduped = 0;
    let itemsSaved = 0;
    let errors = 0;

    try {
      logger.info(`Running scraper: ${source}`);

      // 执行爬取
      const items = await scraper.scrape();
      itemsCollected = items.length;

      if (items.length === 0) {
        logger.warn(`No items collected from ${source}`);
        return {
          source,
          itemsCollected: 0,
          itemsDeduped: 0,
          itemsSaved: 0,
          errors: 0,
          duration: Date.now() - startTime,
        };
      }

      // 去重（与数据库中已有内容对比）
      const dedupedItems = await this.deduplicateWithDatabase(items);
      itemsDeduped = items.length - dedupedItems.length;

      // 保存到数据库
      itemsSaved = await this.saveItems(dedupedItems);

      logger.info(
        `Scraper ${source} completed: ${itemsCollected} collected, ${itemsDeduped} duplicates, ${itemsSaved} saved`
      );
    } catch (error) {
      logger.error(`Scraper ${source} encountered an error:`, error as Error);
      errors = 1;
    }

    return {
      source,
      itemsCollected,
      itemsDeduped,
      itemsSaved,
      errors,
      duration: Date.now() - startTime,
    };
  }

  /**
   * 与数据库中的内容去重
   */
  private async deduplicateWithDatabase(items: ContentItem[]): Promise<ContentItem[]> {
    const uniqueItems: ContentItem[] = [];

    for (const item of items) {
      // 检查 URL 是否已存在
      if (item.url && (await this.isUrlExists(item.url))) {
        logger.debug(`Duplicate URL found: ${item.url}`);
        continue;
      }

      // 检查内容哈希是否已存在
      const contentHash = this.generateContentHash(item);
      if (await this.isContentHashExists(contentHash)) {
        logger.debug(`Duplicate content hash found for: ${item.title}`);
        continue;
      }

      uniqueItems.push(item);
    }

    return uniqueItems;
  }

  /**
   * 检查 URL 是否已存在
   */
  private async isUrlExists(url: string): Promise<boolean> {
    try {
      const existing = this.db.getContentByUrl(url);
      return !!existing;
    } catch (error) {
      logger.error('Error checking URL existence:', error as Error);
      return false;
    }
  }

  /**
   * 检查内容哈希是否已存在
   */
  private async isContentHashExists(hash: string): Promise<boolean> {
    try {
      const existing = this.db.getContentByHash(hash);
      return !!existing;
    } catch (error) {
      logger.error('Error checking content hash:', error as Error);
      return false;
    }
  }

  /**
   * 生成内容哈希（用于去重）
   */
  private generateContentHash(item: ContentItem): string {
    const content = `${item.title}|${item.url}`;
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * 保存内容到数据库
   */
  private async saveItems(items: ContentItem[]): Promise<number> {
    let savedCount = 0;

    for (const item of items) {
      try {
        const contentPool: ContentPool = {
          source: item.source,
          title: item.title,
          content: item.content,
          url: item.url,
          author: item.author,
          published_at: item.publishedAt.toISOString(),
          metrics: item.metrics ? JSON.stringify(item.metrics) : undefined,
          collected_at: item.collectedAt.toISOString(),
        };

        this.db.insertContent(contentPool);
        savedCount++;
      } catch (error) {
        logger.error(`Failed to save item: ${item.title}`, error as Error);
      }
    }

    return savedCount;
  }

  /**
   * 清理过期内容（7天前）
   */
  async cleanupOldContent(daysOld: number = 7): Promise<number> {
    logger.info(`Cleaning up content older than ${daysOld} days...`);

    try {
      const deletedCount = this.db.deleteOldContent(daysOld);
      logger.info(`Deleted ${deletedCount} old content items`);
      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup old content:', error as Error);
      return 0;
    }
  }

  /**
   * 记录统计信息
   */
  private logStats(stats: ScraperStats[]): void {
    const totalCollected = stats.reduce((sum, s) => sum + s.itemsCollected, 0);
    const totalDeduped = stats.reduce((sum, s) => sum + s.itemsDeduped, 0);
    const totalSaved = stats.reduce((sum, s) => sum + s.itemsSaved, 0);
    const totalErrors = stats.reduce((sum, s) => sum + s.errors, 0);

    logger.info('=== Aggregation Summary ===');
    logger.info(`Total collected: ${totalCollected}`);
    logger.info(`Total duplicates: ${totalDeduped}`);
    logger.info(`Total saved: ${totalSaved}`);
    logger.info(`Total errors: ${totalErrors}`);

    stats.forEach((stat) => {
      logger.info(
        `  ${stat.source}: ${stat.itemsCollected} collected, ${stat.itemsSaved} saved (${stat.duration}ms)`
      );
    });
  }
}
