import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export class DatabaseManager {
    db;
    constructor(dbPath) {
        logger.info(`Initializing database at: ${dbPath}`);
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
    }
    /**
     * 初始化数据库表结构
     */
    initialize() {
        const schemaPath = join(__dirname, 'schema.sql');
        const schema = readFileSync(schemaPath, 'utf-8');
        this.db.exec(schema);
        logger.info('Database schema initialized successfully');
    }
    /**
     * 账号画像相关操作
     */
    upsertAccountProfile(profile) {
        const stmt = this.db.prepare(`
      INSERT INTO account_profile (account_handle, bio, topics, writing_style, interests, audience, sample_tweets, interest_vector, tweet_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_handle) DO UPDATE SET
        bio = excluded.bio,
        topics = excluded.topics,
        writing_style = excluded.writing_style,
        interests = excluded.interests,
        audience = excluded.audience,
        sample_tweets = excluded.sample_tweets,
        interest_vector = excluded.interest_vector,
        tweet_count = excluded.tweet_count,
        last_updated = CURRENT_TIMESTAMP
    `);
        stmt.run(profile.account_handle, profile.bio || null, profile.topics || null, profile.writing_style || null, profile.interests || null, profile.audience || null, profile.sample_tweets || null, profile.interest_vector || null, profile.tweet_count || 0);
        logger.debug(`Account profile upserted: ${profile.account_handle}`);
    }
    getAccountProfile(accountHandle) {
        const stmt = this.db.prepare('SELECT * FROM account_profile WHERE account_handle = ?');
        return stmt.get(accountHandle);
    }
    /**
     * 内容池相关操作
     */
    insertContent(content) {
        const stmt = this.db.prepare(`
      INSERT INTO content_pool (source, title, content, url, author, published_at, metrics, embedding_vector)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const result = stmt.run(content.source, content.title || null, content.content, content.url || null, content.author || null, content.published_at || null, content.metrics || null, content.embedding_vector || null);
        logger.debug(`Content inserted with ID: ${result.lastInsertRowid}`);
        return Number(result.lastInsertRowid);
    }
    getContentById(id) {
        const stmt = this.db.prepare('SELECT * FROM content_pool WHERE id = ?');
        return stmt.get(id);
    }
    getRecentContent(limit = 50) {
        const stmt = this.db.prepare(`
      SELECT * FROM content_pool
      ORDER BY collected_at DESC
      LIMIT ?
    `);
        return stmt.all(limit);
    }
    getContentByUrl(url) {
        const stmt = this.db.prepare('SELECT * FROM content_pool WHERE url = ?');
        return stmt.get(url);
    }
    getContentByHash(_hash) {
        // 使用 title 和 url 的组合来查找（简化实现）
        // 在实际应用中，可以添加专门的 hash 字段
        // 这是一个简化实现，实际应该在表中添加 content_hash 字段
        return undefined;
    }
    deleteOldContent(daysOld) {
        const stmt = this.db.prepare(`
      DELETE FROM content_pool
      WHERE collected_at < datetime('now', '-' || ? || ' days')
    `);
        const result = stmt.run(daysOld);
        logger.info(`Deleted ${result.changes} old content items`);
        return result.changes;
    }
    /**
     * 获取最近指定小时内的内容
     */
    getRecentContents(hours) {
        const stmt = this.db.prepare(`
      SELECT * FROM content_pool
      WHERE collected_at >= datetime('now', '-' || ? || ' hours')
      ORDER BY collected_at DESC
    `);
        return stmt.all(hours);
    }
    /**
     * 批量获取内容
     */
    getContentsByIds(ids) {
        if (ids.length === 0)
            return [];
        const placeholders = ids.map(() => '?').join(',');
        const stmt = this.db.prepare(`
      SELECT * FROM content_pool
      WHERE id IN (${placeholders})
    `);
        return stmt.all(...ids);
    }
    /**
     * 更新内容的 embedding 向量
     */
    updateContentEmbedding(id, vector) {
        const stmt = this.db.prepare(`
      UPDATE content_pool
      SET embedding_vector = ?
      WHERE id = ?
    `);
        stmt.run(vector, id);
        logger.debug(`Content ${id} embedding updated`);
    }
    /**
     * 推荐记录相关操作
     */
    insertRecommendation(recommendation) {
        const stmt = this.db.prepare(`
      INSERT INTO recommendations (content_id, match_score, match_reason, drafts, status)
      VALUES (?, ?, ?, ?, ?)
    `);
        const result = stmt.run(recommendation.content_id, recommendation.match_score, recommendation.match_reason || null, recommendation.drafts || null, recommendation.status || 'pending');
        logger.debug(`Recommendation inserted with ID: ${result.lastInsertRowid}`);
        return Number(result.lastInsertRowid);
    }
    updateRecommendationStatus(id, status, feedback) {
        const stmt = this.db.prepare(`
      UPDATE recommendations
      SET status = ?, user_feedback = ?
      WHERE id = ?
    `);
        stmt.run(status, feedback, id);
        logger.debug(`Recommendation ${id} status updated to: ${status}`);
    }
    getRecommendationsByStatus(status) {
        const stmt = this.db.prepare('SELECT * FROM recommendations WHERE status = ? ORDER BY recommended_at DESC');
        return stmt.all(status);
    }
    /**
     * 反馈日志相关操作
     */
    insertFeedback(feedback) {
        const stmt = this.db.prepare(`
      INSERT INTO feedback_log (recommendation_id, action, modified_draft)
      VALUES (?, ?, ?)
    `);
        const result = stmt.run(feedback.recommendation_id, feedback.action, feedback.modified_draft || null);
        logger.debug(`Feedback logged with ID: ${result.lastInsertRowid}`);
        return Number(result.lastInsertRowid);
    }
    getFeedbackByRecommendation(recommendationId) {
        const stmt = this.db.prepare('SELECT * FROM feedback_log WHERE recommendation_id = ? ORDER BY created_at DESC');
        return stmt.all(recommendationId);
    }
    /**
     * 关闭数据库连接
     */
    close() {
        this.db.close();
        logger.info('Database connection closed');
    }
}
//# sourceMappingURL=index.js.map