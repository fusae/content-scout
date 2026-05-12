import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

/**
 * OpenAI Embedding 客户端
 * 使用 text-embedding-3-small 模型生成 768 维向量
 */
export class EmbeddingClient {
  private client: OpenAI;
  private model: string = 'text-embedding-3-small';

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
    logger.info('EmbeddingClient initialized');
  }

  /**
   * 生成单个文本的 embedding 向量
   */
  async getEmbedding(text: string): Promise<number[]> {
    try {
      logger.debug(`Generating embedding for text (length: ${text.length})`);
      const startTime = Date.now();

      const response = await this.client.embeddings.create({
        model: this.model,
        input: text,
        encoding_format: 'float',
      });

      const embedding = response.data[0].embedding;
      const duration = Date.now() - startTime;

      logger.info(`Embedding generated successfully (${embedding.length} dimensions, ${duration}ms)`);
      return embedding;
    } catch (error) {
      logger.error('Failed to generate embedding:', error);
      throw error;
    }
  }

  /**
   * 批量生成 embedding 向量
   */
  async getBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      logger.debug(`Generating embeddings for ${texts.length} texts`);
      const startTime = Date.now();

      const response = await this.client.embeddings.create({
        model: this.model,
        input: texts,
        encoding_format: 'float',
      });

      const embeddings = response.data.map(item => item.embedding);
      const duration = Date.now() - startTime;

      logger.info(`Batch embeddings generated successfully (${embeddings.length} vectors, ${duration}ms)`);
      return embeddings;
    } catch (error) {
      logger.error('Failed to generate batch embeddings:', error);
      throw error;
    }
  }

  /**
   * 带重试机制的 embedding 生成
   */
  async getEmbeddingWithRetry(text: string, maxRetries: number = 3): Promise<number[]> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.getEmbedding(text);
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Embedding attempt ${attempt}/${maxRetries} failed:`, error);

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // 指数退避
          logger.debug(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`Failed to generate embedding after ${maxRetries} attempts: ${lastError?.message}`);
  }
}
