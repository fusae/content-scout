import { EmbeddingClient } from '../ai/embedding.js';
import { ContentPool } from '../db/index.js';
import { FilteredContent } from './types.js';
/**
 * 余弦相似度计算
 */
export declare function cosineSimilarity(vecA: number[], vecB: number[]): number;
/**
 * Embedding 初筛器
 * 使用向量相似度从大量内容中筛选出候选集
 */
export declare class EmbeddingFilter {
    private embeddingClient;
    constructor(embeddingClient: EmbeddingClient);
    /**
     * 执行 Embedding 初筛
     * @param contents 内容池数据（来自数据库）
     * @param profileVector 账号画像向量
     * @param topK 保留前 K 个结果
     * @returns 筛选后的内容列表
     */
    filter(contents: ContentPool[], profileVector: number[], topK?: number): Promise<FilteredContent[]>;
    /**
     * 批量生成缺失的 embedding 向量
     */
    private generateMissingEmbeddings;
    /**
     * 准备用于 embedding 的文本
     * 组合标题和内容，限制长度
     */
    private prepareTextForEmbedding;
    /**
     * 序列化向量为字符串（用于存储）
     */
    private serializeVector;
    /**
     * 反序列化向量字符串
     */
    private deserializeVector;
    /**
     * 将 ContentPool 转换为 ContentItem
     */
    private convertToContentItem;
}
//# sourceMappingURL=embedding-filter.d.ts.map