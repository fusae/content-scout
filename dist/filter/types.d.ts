import { ContentItem } from '../types/content.js';
/**
 * 过滤后的内容项
 */
export interface FilteredContent {
    content: ContentItem;
    contentId: number;
    embeddingSimilarity: number;
    aiScore?: number;
    aiReason?: string;
    rank: number;
    dimensions?: ScoreDimensions;
}
/**
 * AI 评分维度
 */
export interface ScoreDimensions {
    topicRelevance: number;
    audienceMatch: number;
    timeliness: number;
    potential: number;
}
/**
 * AI 精排结果（单条内容）
 */
export interface RankedContent {
    id: number;
    score: number;
    reason: string;
    dimensions: ScoreDimensions;
}
/**
 * 过滤选项
 */
export interface FilterOptions {
    topK?: number;
    finalCount?: number;
    minAiScore?: number;
    enableTimeBoost?: boolean;
    enableDiversity?: boolean;
    maxPerSource?: number;
    blacklist?: string[];
}
/**
 * 过滤统计信息
 */
export interface FilterStats {
    totalInput: number;
    afterEmbedding: number;
    afterAI: number;
    finalOutput: number;
    embeddingDuration: number;
    aiDuration: number;
    totalDuration: number;
}
//# sourceMappingURL=types.d.ts.map