import { ScraperStats } from '../types/content.js';
import { DatabaseManager } from '../db/index.js';
/**
 * 内容聚合器 - 协调所有爬虫并管理内容存储
 */
export declare class ContentAggregator {
    private db;
    private scrapers;
    private rateLimiter;
    constructor(db: DatabaseManager);
    /**
     * 运行所有爬虫
     */
    aggregateAll(): Promise<ScraperStats[]>;
    /**
     * 运行指定的爬虫
     */
    aggregateFrom(sources: string[]): Promise<ScraperStats[]>;
    /**
     * 运行单个爬虫
     */
    private runScraper;
    /**
     * 与数据库中的内容去重
     */
    private deduplicateWithDatabase;
    /**
     * 检查 URL 是否已存在
     */
    private isUrlExists;
    /**
     * 检查内容哈希是否已存在
     */
    private isContentHashExists;
    /**
     * 生成内容哈希（用于去重）
     */
    private generateContentHash;
    /**
     * 保存内容到数据库
     */
    private saveItems;
    /**
     * 清理过期内容（7天前）
     */
    cleanupOldContent(daysOld?: number): Promise<number>;
    /**
     * 记录统计信息
     */
    private logStats;
}
//# sourceMappingURL=index.d.ts.map