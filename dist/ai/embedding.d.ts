/**
 * OpenAI 兼容 Embedding 客户端
 */
export declare class EmbeddingClient {
    private client;
    private model;
    constructor(apiKey: string, baseURL?: string, model?: string);
    /**
     * 生成单个文本的 embedding 向量
     */
    getEmbedding(text: string): Promise<number[]>;
    /**
     * 批量生成 embedding 向量
     */
    getBatchEmbeddings(texts: string[]): Promise<number[][]>;
    /**
     * 带重试机制的 embedding 生成
     */
    getEmbeddingWithRetry(text: string, maxRetries?: number): Promise<number[]>;
}
//# sourceMappingURL=embedding.d.ts.map