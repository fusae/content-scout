import { EmbeddingClient } from '../ai/embedding.js';
import { DeepSeekClient } from '../ai/deepseek.js';
import { DatabaseManager } from '../db/index.js';
import { AccountProfile } from '../profile/types.js';
import { FilteredContent, FilterOptions, FilterStats } from './types.js';
/**
 * 智能过滤引擎
 * 整合 Embedding 初筛和 AI 精排，从海量内容中筛选出最适合的推荐
 */
export declare class FilterEngine {
    private db;
    private embeddingFilter;
    private aiRanker;
    constructor(embeddingClient: EmbeddingClient, deepseekClient: DeepSeekClient, db: DatabaseManager);
    /**
     * 执行完整的过滤流程
     * @param profile 账号画像
     * @param options 过滤选项
     * @returns 过滤后的内容列表和统计信息
     */
    filter(profile: AccountProfile, options?: FilterOptions): Promise<{
        contents: FilteredContent[];
        stats: FilterStats;
    }>;
    /**
     * 获取最近的内容
     */
    private getRecentContents;
    /**
     * 获取账号画像向量
     */
    private getProfileVector;
    /**
     * 更新数据库中的 embedding 向量
     */
    private updateContentEmbeddings;
    /**
     * 应用过滤策略
     */
    private applyFilters;
    /**
     * 黑名单过滤
     */
    private applyBlacklist;
    /**
     * 时效性加权
     * 根据发布时间调整分数，新内容获得加成
     */
    private applyTimeBoost;
    /**
     * 计算时效性分数
     */
    private calculateTimelinessScore;
    /**
     * 多样性控制
     * 确保不同来源的内容都有机会被推荐
     */
    private ensureDiversity;
    /**
     * 标准化选项
     */
    private normalizeOptions;
    /**
     * 完成结果处理（用于重试场景）
     */
    private finalizeResults;
    /**
     * 创建空统计信息
     */
    private createEmptyStats;
}
//# sourceMappingURL=index.d.ts.map