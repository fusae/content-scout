/**
 * 反馈学习类型定义
 */

/**
 * 反馈行为模式
 */
export interface FeedbackPattern {
  acceptedTopics: string[];      // 用户接受的话题
  rejectedTopics: string[];      // 用户拒绝的话题
  preferredSources: string[];    // 偏好的来源
  avoidedSources: string[];      // 避免的来源
  acceptanceRate: number;        // 接受率 (0-1)
  totalFeedbacks: number;        // 总反馈数
}

/**
 * 话题权重调整
 */
export interface TopicWeightAdjustment {
  topic: string;
  oldWeight: number;
  newWeight: number;
  reason: string;
}

/**
 * 学习结果
 */
export interface LearningResult {
  profileUpdated: boolean;
  adjustments: TopicWeightAdjustment[];
  blacklistUpdated: string[];    // 新增黑名单
  timestamp: Date;
  feedbackCount: number;
}

/**
 * 反馈统计
 */
export interface FeedbackStats {
  total: number;
  approved: number;
  rejected: number;
  modified: number;
  posted: number;
  acceptanceRate: number;
  lastFeedbackAt?: Date;
}
