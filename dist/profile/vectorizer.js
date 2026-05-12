import { EmbeddingClient } from '../ai/embedding.js';
import { logger } from '../utils/logger.js';
/**
 * 向量化模块
 * 负责将账号画像转换为 embedding 向量
 */
export class Vectorizer {
    embeddingClient;
    constructor(openaiApiKey) {
        this.embeddingClient = new EmbeddingClient(openaiApiKey);
        logger.info('Vectorizer initialized');
    }
    /**
     * 将账号画像转换为向量
     * 策略：将 topics + interests 组合成文本，生成 embedding
     */
    async vectorizeProfile(profile) {
        try {
            logger.info(`Vectorizing profile for account: ${profile.accountHandle}`);
            // 组合主题和兴趣
            const combinedText = this.buildProfileText(profile);
            logger.debug(`Combined text for vectorization: ${combinedText}`);
            // 生成 embedding 向量
            const vector = await this.embeddingClient.getEmbeddingWithRetry(combinedText);
            logger.info(`Profile vectorized successfully (${vector.length} dimensions)`);
            return vector;
        }
        catch (error) {
            logger.error('Failed to vectorize profile:', error);
            throw error;
        }
    }
    /**
     * 构建用于向量化的文本
     * 包含：主题、兴趣、受众描述
     */
    buildProfileText(profile) {
        const parts = [];
        // 添加主题
        if (profile.topics && profile.topics.length > 0) {
            parts.push(`主题: ${profile.topics.join(', ')}`);
        }
        // 添加兴趣
        if (profile.interests && profile.interests.length > 0) {
            parts.push(`兴趣: ${profile.interests.join(', ')}`);
        }
        // 添加受众描述
        if (profile.audience) {
            parts.push(`受众: ${profile.audience}`);
        }
        // 添加简介
        if (profile.bio) {
            parts.push(`简介: ${profile.bio}`);
        }
        return parts.join('\n');
    }
    /**
     * 重新生成向量（用于画像更新后）
     */
    async refreshVector(profile) {
        logger.info(`Refreshing vector for account: ${profile.accountHandle}`);
        return await this.vectorizeProfile(profile);
    }
    /**
     * 批量向量化（用于多个画像）
     */
    async vectorizeProfiles(profiles) {
        logger.info(`Batch vectorizing ${profiles.length} profiles`);
        const results = new Map();
        for (const profile of profiles) {
            try {
                const vector = await this.vectorizeProfile(profile);
                results.set(profile.accountHandle, vector);
            }
            catch (error) {
                logger.error(`Failed to vectorize profile ${profile.accountHandle}:`, error);
                // 继续处理其他画像
            }
        }
        logger.info(`Batch vectorization completed: ${results.size}/${profiles.length} successful`);
        return results;
    }
}
//# sourceMappingURL=vectorizer.js.map