import { ContentItem } from '../types/content.js';

/**
 * 过滤后的内容项
 */
export interface FilteredContent {
  content: ContentItem;
  contentId: number; // 数据库 ID
  embeddingSimilarity: number; // 0-1，Embedding 相似度
  aiScore?: number; // 0-10，AI 精排分数
  aiReason?: string; // AI 给出的匹配原因
  rank: number; // 最终排名
  dimensions?: ScoreDimensions; // 评分维度
}

/**
 * AI 评分维度
 */
export interface ScoreDimensions {
  topicRelevance: number; // 话题相关性 (0-10)
  audienceMatch: number; // 受众匹配度 (0-10)
  timeliness: number; // 时效性 (0-10)
  potential: number; // 可发挥空间 (0-10)
}

/**
 * AI 精排结果（单条内容）
 */
export interface RankedContent {
  id: number; // 候选内容的序号（1-based）
  score: number; // 总分 (0-10)
  reason: string; // 匹配原因
  dimensions: ScoreDimensions;
}

/**
 * 过滤选项
 */
export interface FilterOptions {
  topK?: number; // Embedding 初筛保留数量，默认 20
  finalCount?: number; // 最终返回数量，默认 5
  minAiScore?: number; // AI 最低分数阈值，默认 7.0
  enableTimeBoost?: boolean; // 是否启用时效性加权，默认 true
  enableDiversity?: boolean; // 是否启用多样性控制，默认 true
  maxPerSource?: number; // 每个来源最多保留数量，默认 2
  blacklist?: string[]; // 黑名单关键词
}

/**
 * 过滤统计信息
 */
export interface FilterStats {
  totalInput: number; // 输入内容数
  afterEmbedding: number; // Embedding 初筛后数量
  afterAI: number; // AI 精排后数量
  finalOutput: number; // 最终输出数量
  embeddingDuration: number; // Embedding 耗时 (ms)
  aiDuration: number; // AI 精排耗时 (ms)
  totalDuration: number; // 总耗时 (ms)
  embeddingFallback?: boolean;
  embeddingFallbackReason?: string;
  aiFallback?: boolean;
  aiFallbackReason?: string;
}
