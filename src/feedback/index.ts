import { DatabaseManager } from '../db';
import { AccountProfile } from '../profile/types';
import { logger } from '../utils/logger';

interface FeedbackPattern {
  acceptedTopics: string[];
  rejectedTopics: string[];
  preferredSources: string[];
  avoidedSources: string[];
  acceptanceRate: number;
  totalFeedbacks: number;
}

interface FeedbackLog {
  id: number;
  recommendationId: number;
  action: 'accept' | 'reject' | 'modify' | 'view_source';
  modifiedDraft?: string;
  createdAt: Date;
  contentSource?: string;
  contentTopics?: string[];
}

export class FeedbackLearner {
  constructor(private db: DatabaseManager) {}

  async analyzeFeedback(feedbacks: FeedbackLog[]): Promise<FeedbackPattern> {
    const accepted = feedbacks.filter(f => f.action === 'accept');
    const rejected = feedbacks.filter(f => f.action === 'reject');

    const acceptedTopics = this.extractTopics(accepted);
    const rejectedTopics = this.extractTopics(rejected);
    const preferredSources = this.extractSources(accepted);
    const avoidedSources = this.extractSources(rejected);

    return {
      acceptedTopics,
      rejectedTopics,
      preferredSources,
      avoidedSources,
      acceptanceRate: accepted.length / feedbacks.length,
      totalFeedbacks: feedbacks.length
    };
  }

  async updateProfile(
    profile: AccountProfile,
    pattern: FeedbackPattern
  ): Promise<AccountProfile> {
    logger.info('开始更新账号画像', {
      acceptedTopics: pattern.acceptedTopics.length,
      rejectedTopics: pattern.rejectedTopics.length,
      acceptanceRate: pattern.acceptanceRate
    });

    // 1. 更新主题权重
    const updatedTopics = this.adjustTopicWeights(
      profile.topics,
      pattern.acceptedTopics,
      pattern.rejectedTopics
    );

    // 2. 更新兴趣标签
    const updatedInterests = this.adjustInterests(
      profile.interests,
      pattern.acceptedTopics
    );

    // 3. 构建黑名单（连续 3 次拒绝的话题）
    const blacklist = this.buildBlacklist(pattern.rejectedTopics);

    const updatedProfile: AccountProfile = {
      ...profile,
      topics: updatedTopics,
      interests: updatedInterests,
      lastUpdated: new Date()
    };

    logger.info('画像更新完成', {
      topics: updatedTopics.length,
      interests: updatedInterests.length,
      blacklist: blacklist.length
    });

    return updatedProfile;
  }

  async shouldTriggerLearning(): Promise<boolean> {
    // 检查是否需要触发学习
    // 条件1: 累积 10 次反馈
    const recentFeedbacks = await this.getRecentFeedbackCount(7);
    if (recentFeedbacks >= 10) {
      return true;
    }

    // 条件2: 距离上次学习超过 7 天
    const lastLearning = await this.getLastLearningDate();
    if (lastLearning) {
      const daysSince = (Date.now() - lastLearning.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince >= 7) {
        return true;
      }
    }

    return false;
  }

  private extractTopics(feedbacks: FeedbackLog[]): string[] {
    const topics = new Set<string>();
    feedbacks.forEach(f => {
      f.contentTopics?.forEach(t => topics.add(t));
    });
    return Array.from(topics);
  }

  private extractSources(feedbacks: FeedbackLog[]): string[] {
    const sources = new Set<string>();
    feedbacks.forEach(f => {
      if (f.contentSource) sources.add(f.contentSource);
    });
    return Array.from(sources);
  }

  private adjustTopicWeights(
    currentTopics: string[],
    acceptedTopics: string[],
    rejectedTopics: string[]
  ): string[] {
    // 简单策略：添加新的接受话题，移除频繁拒绝的话题
    const topics = new Set(currentTopics);

    // 添加接受的话题
    acceptedTopics.forEach(t => topics.add(t));

    // 移除频繁拒绝的话题（出现 3 次以上）
    const rejectedCounts = new Map<string, number>();
    rejectedTopics.forEach(t => {
      rejectedCounts.set(t, (rejectedCounts.get(t) || 0) + 1);
    });

    rejectedCounts.forEach((count, topic) => {
      if (count >= 3) {
        topics.delete(topic);
      }
    });

    return Array.from(topics);
  }

  private adjustInterests(
    currentInterests: string[],
    acceptedTopics: string[]
  ): string[] {
    // 将接受的话题添加到兴趣列表
    const interests = new Set(currentInterests);
    acceptedTopics.slice(0, 3).forEach(t => interests.add(t));
    return Array.from(interests).slice(0, 10); // 最多保留 10 个
  }

  private buildBlacklist(rejectedTopics: string[]): string[] {
    const counts = new Map<string, number>();
    rejectedTopics.forEach(t => {
      counts.set(t, (counts.get(t) || 0) + 1);
    });

    const blacklist: string[] = [];
    counts.forEach((count, topic) => {
      if (count >= 3) {
        blacklist.push(topic);
      }
    });

    return blacklist;
  }

  private async getRecentFeedbackCount(days: number): Promise<number> {
    // 从数据库获取最近 N 天的反馈数量
    const sql = `
      SELECT COUNT(*) as count
      FROM feedback_log
      WHERE created_at >= datetime('now', '-${days} days')
    `;
    const result = this.db['db'].prepare(sql).get() as { count: number };
    return result.count;
  }

  private async getLastLearningDate(): Promise<Date | null> {
    // 从数据库获取上次学习时间
    // 这里简化处理，实际应该有专门的学习记录表
    const sql = `
      SELECT last_updated
      FROM account_profile
      ORDER BY last_updated DESC
      LIMIT 1
    `;
    const result = this.db['db'].prepare(sql).get() as { last_updated: string } | undefined;
    return result ? new Date(result.last_updated) : null;
  }
}
