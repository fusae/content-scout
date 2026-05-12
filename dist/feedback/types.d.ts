/**
 * 反馈学习类型定义
 */
/**
 * 反馈行为模式
 */
export interface FeedbackPattern {
    acceptedTopics: string[];
    rejectedTopics: string[];
    preferredSources: string[];
    avoidedSources: string[];
    acceptanceRate: number;
    totalFeedbacks: number;
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
    blacklistUpdated: string[];
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
//# sourceMappingURL=types.d.ts.map