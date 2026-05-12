import { FilteredContent } from '../filter/types.js';
/**
 * 推荐结果
 * 包含筛选后的内容和生成的推文草稿
 */
export interface RecommendationResult {
    id?: number;
    content: FilteredContent;
    drafts: string[];
    matchScore: number;
    matchReason: string;
    status: 'pending' | 'approved' | 'rejected' | 'published';
    recommendedAt: Date;
    userFeedback?: string;
}
/**
 * 推荐批次
 * 一次推荐的完整结果
 */
export interface RecommendationBatch {
    accountHandle: string;
    recommendations: RecommendationResult[];
    generatedAt: Date;
    stats: {
        totalCandidates: number;
        finalRecommendations: number;
        avgScore: number;
        processingTime: number;
    };
}
//# sourceMappingURL=recommendation.d.ts.map