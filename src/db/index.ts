import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface AccountProfile {
  id?: number;
  account_handle: string;
  bio?: string;
  topics?: string; // JSON
  writing_style?: string; // JSON
  interest_vector?: string;
  last_updated?: string;
  tweet_count?: number;
}

export interface ContentPool {
  id?: number;
  source: string;
  title?: string;
  content: string;
  url?: string;
  author?: string;
  published_at?: string;
  metrics?: string; // JSON
  collected_at?: string;
  embedding_vector?: string;
}

export interface Recommendation {
  id?: number;
  content_id: number;
  match_score: number;
  match_reason?: string;
  drafts?: string; // JSON
  recommended_at?: string;
  status?: string;
  user_feedback?: string;
}

export interface FeedbackLog {
  id?: number;
  recommendation_id: number;
  action: string;
  modified_draft?: string;
  created_at?: string;
}

export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    logger.info(`Initializing database at: ${dbPath}`);
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  /**
   * 初始化数据库表结构
   */
  initialize(): void {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    this.db.exec(schema);
    logger.info('Database schema initialized successfully');
  }

  /**
   * 账号画像相关操作
   */
  upsertAccountProfile(profile: AccountProfile): void {
    const stmt = this.db.prepare(`
      INSERT INTO account_profile (account_handle, bio, topics, writing_style, interest_vector, tweet_count)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_handle) DO UPDATE SET
        bio = excluded.bio,
        topics = excluded.topics,
        writing_style = excluded.writing_style,
        interest_vector = excluded.interest_vector,
        tweet_count = excluded.tweet_count,
        last_updated = CURRENT_TIMESTAMP
    `);
    stmt.run(
      profile.account_handle,
      profile.bio || null,
      profile.topics || null,
      profile.writing_style || null,
      profile.interest_vector || null,
      profile.tweet_count || 0
    );
    logger.debug(`Account profile upserted: ${profile.account_handle}`);
  }

  getAccountProfile(accountHandle: string): AccountProfile | undefined {
    const stmt = this.db.prepare('SELECT * FROM account_profile WHERE account_handle = ?');
    return stmt.get(accountHandle) as AccountProfile | undefined;
  }

  /**
   * 内容池相关操作
   */
  insertContent(content: ContentPool): number {
    const stmt = this.db.prepare(`
      INSERT INTO content_pool (source, title, content, url, author, published_at, metrics, embedding_vector)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      content.source,
      content.title || null,
      content.content,
      content.url || null,
      content.author || null,
      content.published_at || null,
      content.metrics || null,
      content.embedding_vector || null
    );
    logger.debug(`Content inserted with ID: ${result.lastInsertRowid}`);
    return Number(result.lastInsertRowid);
  }

  getContentById(id: number): ContentPool | undefined {
    const stmt = this.db.prepare('SELECT * FROM content_pool WHERE id = ?');
    return stmt.get(id) as ContentPool | undefined;
  }

  getRecentContent(limit: number = 50): ContentPool[] {
    const stmt = this.db.prepare(`
      SELECT * FROM content_pool
      ORDER BY collected_at DESC
      LIMIT ?
    `);
    return stmt.all(limit) as ContentPool[];
  }

  getContentByUrl(url: string): ContentPool | undefined {
    const stmt = this.db.prepare('SELECT * FROM content_pool WHERE url = ?');
    return stmt.get(url) as ContentPool | undefined;
  }

  getContentByHash(_hash: string): ContentPool | undefined {
    // 使用 title 和 url 的组合来查找（简化实现）
    // 在实际应用中，可以添加专门的 hash 字段
    // 这是一个简化实现，实际应该在表中添加 content_hash 字段
    return undefined;
  }

  deleteOldContent(daysOld: number): number {
    const stmt = this.db.prepare(`
      DELETE FROM content_pool
      WHERE collected_at < datetime('now', '-' || ? || ' days')
    `);
    const result = stmt.run(daysOld);
    logger.info(`Deleted ${result.changes} old content items`);
    return result.changes;
  }

  /**
   * 推荐记录相关操作
   */
  insertRecommendation(recommendation: Recommendation): number {
    const stmt = this.db.prepare(`
      INSERT INTO recommendations (content_id, match_score, match_reason, drafts, status)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      recommendation.content_id,
      recommendation.match_score,
      recommendation.match_reason || null,
      recommendation.drafts || null,
      recommendation.status || 'pending'
    );
    logger.debug(`Recommendation inserted with ID: ${result.lastInsertRowid}`);
    return Number(result.lastInsertRowid);
  }

  updateRecommendationStatus(id: number, status: string, feedback?: string): void {
    const stmt = this.db.prepare(`
      UPDATE recommendations
      SET status = ?, user_feedback = ?
      WHERE id = ?
    `);
    stmt.run(status, feedback, id);
    logger.debug(`Recommendation ${id} status updated to: ${status}`);
  }

  getRecommendationsByStatus(status: string): Recommendation[] {
    const stmt = this.db.prepare('SELECT * FROM recommendations WHERE status = ? ORDER BY recommended_at DESC');
    return stmt.all(status) as Recommendation[];
  }

  /**
   * 反馈日志相关操作
   */
  insertFeedback(feedback: FeedbackLog): number {
    const stmt = this.db.prepare(`
      INSERT INTO feedback_log (recommendation_id, action, modified_draft)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(
      feedback.recommendation_id,
      feedback.action,
      feedback.modified_draft || null
    );
    logger.debug(`Feedback logged with ID: ${result.lastInsertRowid}`);
    return Number(result.lastInsertRowid);
  }

  getFeedbackByRecommendation(recommendationId: number): FeedbackLog[] {
    const stmt = this.db.prepare('SELECT * FROM feedback_log WHERE recommendation_id = ? ORDER BY created_at DESC');
    return stmt.all(recommendationId) as FeedbackLog[];
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close();
    logger.info('Database connection closed');
  }
}
