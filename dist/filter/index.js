import { logger } from '../utils/logger.js';
import { EmbeddingFilter } from './embedding-filter.js';
import { AIRanker } from './ai-ranker.js';
/**
 * 智能过滤引擎
 * 整合 Embedding 初筛和 AI 精排，从海量内容中筛选出最适合的推荐
 */
export class FilterEngine {
    db;
    embeddingFilter;
    aiRanker;
    constructor(embeddingClient, deepseekClient, db) {
        this.db = db;
        this.embeddingFilter = new EmbeddingFilter(embeddingClient);
        this.aiRanker = new AIRanker(deepseekClient);
        logger.info('FilterEngine initialized');
    }
    /**
     * 执行完整的过滤流程
     * @param profile 账号画像
     * @param options 过滤选项
     * @returns 过滤后的内容列表和统计信息
     */
    async filter(profile, options) {
        const opts = this.normalizeOptions(options);
        const overallStart = Date.now();
        logger.info('=== Starting Filter Engine ===');
        logger.info(`Profile: @${profile.accountHandle}`);
        logger.info(`Options: topK=${opts.topK}, finalCount=${opts.finalCount}, minScore=${opts.minAiScore}`);
        // 1. 获取最近的内容
        const recentContents = this.getRecentContents(opts);
        logger.info(`Fetched ${recentContents.length} recent contents from database`);
        if (recentContents.length === 0) {
            logger.warn('No content available for filtering');
            return {
                contents: [],
                stats: this.createEmptyStats(),
            };
        }
        // 2. Embedding 初筛
        const embeddingStart = Date.now();
        const profileVector = this.getProfileVector(profile);
        const candidates = await this.embeddingFilter.filter(recentContents, profileVector, opts.topK);
        const embeddingDuration = Date.now() - embeddingStart;
        // 更新数据库中的 embedding 向量（如果有新生成的）
        await this.updateContentEmbeddings(recentContents);
        if (candidates.length === 0) {
            logger.warn('No candidates after embedding filter');
            return {
                contents: [],
                stats: {
                    totalInput: recentContents.length,
                    afterEmbedding: 0,
                    afterAI: 0,
                    finalOutput: 0,
                    embeddingDuration,
                    aiDuration: 0,
                    totalDuration: Date.now() - overallStart,
                },
            };
        }
        // 3. AI 精排
        const aiStart = Date.now();
        const ranked = await this.aiRanker.rank(candidates, profile, opts.minAiScore);
        const aiDuration = Date.now() - aiStart;
        if (ranked.length === 0) {
            logger.warn(`No content passed AI ranking (minScore=${opts.minAiScore})`);
            // 如果 AI 精排没有结果，尝试降低阈值重试
            if (opts.minAiScore > 6.0) {
                logger.info('Retrying with lower threshold (6.0)');
                const retryRanked = await this.aiRanker.rank(candidates, profile, 6.0);
                if (retryRanked.length > 0) {
                    logger.info(`Retry successful: ${retryRanked.length} results`);
                    return this.finalizeResults(retryRanked, opts, {
                        totalInput: recentContents.length,
                        afterEmbedding: candidates.length,
                        afterAI: retryRanked.length,
                        embeddingDuration,
                        aiDuration,
                        overallStart,
                    });
                }
            }
        }
        // 4. 应用过滤策略
        const filtered = this.applyFilters(ranked, opts);
        const totalDuration = Date.now() - overallStart;
        const stats = {
            totalInput: recentContents.length,
            afterEmbedding: candidates.length,
            afterAI: ranked.length,
            finalOutput: filtered.length,
            embeddingDuration,
            aiDuration,
            totalDuration,
        };
        logger.info('=== Filter Engine Completed ===');
        logger.info(`Pipeline: ${stats.totalInput} → ${stats.afterEmbedding} → ${stats.afterAI} → ${stats.finalOutput}`);
        logger.info(`Duration: embedding=${embeddingDuration}ms, ai=${aiDuration}ms, total=${totalDuration}ms`);
        return { contents: filtered, stats };
    }
    /**
     * 获取最近的内容
     */
    getRecentContents(options) {
        // 获取最近 48 小时的内容，数量为 topK 的 5 倍（确保有足够的候选）
        const limit = Math.max(options.topK * 5, 100);
        return this.db.getRecentContent(limit);
    }
    /**
     * 获取账号画像向量
     */
    getProfileVector(profile) {
        if (!profile.interestVector || profile.interestVector.length === 0) {
            throw new Error('Profile vector is missing. Please generate profile first.');
        }
        return profile.interestVector;
    }
    /**
     * 更新数据库中的 embedding 向量
     */
    async updateContentEmbeddings(contents) {
        let updated = 0;
        for (const content of contents) {
            if (content.embedding_vector && content.id) {
                try {
                    this.db.updateContentEmbedding(content.id, content.embedding_vector);
                    updated++;
                }
                catch (error) {
                    logger.warn(`Failed to update embedding for content ${content.id}:`, error);
                }
            }
        }
        if (updated > 0) {
            logger.info(`Updated ${updated} content embeddings in database`);
        }
    }
    /**
     * 应用过滤策略
     */
    applyFilters(contents, options) {
        let filtered = [...contents];
        // 1. 黑名单过滤
        if (options.blacklist && options.blacklist.length > 0) {
            filtered = this.applyBlacklist(filtered, options.blacklist);
        }
        // 2. 时效性加权
        if (options.enableTimeBoost) {
            filtered = this.applyTimeBoost(filtered);
        }
        // 3. 多样性控制
        if (options.enableDiversity) {
            filtered = this.ensureDiversity(filtered, options.maxPerSource);
        }
        // 4. 限制最终数量
        filtered = filtered.slice(0, options.finalCount);
        // 5. 更新最终排名
        filtered.forEach((item, index) => {
            item.rank = index + 1;
        });
        return filtered;
    }
    /**
     * 黑名单过滤
     */
    applyBlacklist(contents, blacklist) {
        const before = contents.length;
        const filtered = contents.filter(item => {
            const text = `${item.content.title} ${item.content.content}`.toLowerCase();
            return !blacklist.some(keyword => text.includes(keyword.toLowerCase()));
        });
        const removed = before - filtered.length;
        if (removed > 0) {
            logger.info(`Blacklist filter removed ${removed} items`);
        }
        return filtered;
    }
    /**
     * 时效性加权
     * 根据发布时间调整分数，新内容获得加成
     */
    applyTimeBoost(contents) {
        const boosted = contents.map(item => {
            const timeScore = this.calculateTimelinessScore(item.content.publishedAt);
            const originalScore = item.aiScore || item.embeddingSimilarity * 10;
            const boostedScore = originalScore * (0.7 + 0.3 * timeScore); // 最多 30% 加成
            return {
                ...item,
                aiScore: boostedScore,
            };
        });
        // 重新排序
        boosted.sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0));
        logger.debug('Applied time boost to scores');
        return boosted;
    }
    /**
     * 计算时效性分数
     */
    calculateTimelinessScore(publishedAt) {
        const hoursAgo = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
        if (hoursAgo < 6)
            return 1.0; // 6小时内：满分
        if (hoursAgo < 24)
            return 0.8; // 24小时内：0.8
        if (hoursAgo < 48)
            return 0.5; // 48小时内：0.5
        return 0.2; // 更早：0.2
    }
    /**
     * 多样性控制
     * 确保不同来源的内容都有机会被推荐
     */
    ensureDiversity(contents, maxPerSource) {
        const sources = new Map();
        const result = [];
        for (const content of contents) {
            const source = content.content.source;
            const count = sources.get(source) || 0;
            if (count < maxPerSource) {
                result.push(content);
                sources.set(source, count + 1);
            }
        }
        const removed = contents.length - result.length;
        if (removed > 0) {
            logger.info(`Diversity filter removed ${removed} items (maxPerSource=${maxPerSource})`);
        }
        return result;
    }
    /**
     * 标准化选项
     */
    normalizeOptions(options) {
        return {
            topK: options?.topK ?? 20,
            finalCount: options?.finalCount ?? 5,
            minAiScore: options?.minAiScore ?? 7.0,
            enableTimeBoost: options?.enableTimeBoost ?? true,
            enableDiversity: options?.enableDiversity ?? true,
            maxPerSource: options?.maxPerSource ?? 2,
            blacklist: options?.blacklist ?? [],
        };
    }
    /**
     * 完成结果处理（用于重试场景）
     */
    finalizeResults(ranked, options, partialStats) {
        const filtered = this.applyFilters(ranked, options);
        const totalDuration = Date.now() - partialStats.overallStart;
        return {
            contents: filtered,
            stats: {
                ...partialStats,
                finalOutput: filtered.length,
                totalDuration,
            },
        };
    }
    /**
     * 创建空统计信息
     */
    createEmptyStats() {
        return {
            totalInput: 0,
            afterEmbedding: 0,
            afterAI: 0,
            finalOutput: 0,
            embeddingDuration: 0,
            aiDuration: 0,
            totalDuration: 0,
        };
    }
}
//# sourceMappingURL=index.js.map