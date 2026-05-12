import { FilteredContent } from '../filter/types.js';

/**
 * 推荐结果
 * 包含筛选后的内容和生成的推文草稿
 */
export interface RecommendationResult {
  id?: number; // 数据库 ID
  content: FilteredContent;
  drafts: string[]; // 生成的推文草稿（多个版本）
  matchScore: number; // 匹配分数 (0-10)
  matchReason: string; // 匹配原因
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
    processingTime: number; // ms
  };
}
