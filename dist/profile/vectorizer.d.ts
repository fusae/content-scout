import { AccountProfile } from './types.js';
/**
 * 向量化模块
 * 负责将账号画像转换为 embedding 向量
 */
export declare class Vectorizer {
    private embeddingClient;
    constructor(openaiApiKey: string);
    /**
     * 将账号画像转换为向量
     * 策略：将 topics + interests 组合成文本，生成 embedding
     */
    vectorizeProfile(profile: AccountProfile): Promise<number[]>;
    /**
     * 构建用于向量化的文本
     * 包含：主题、兴趣、受众描述
     */
    private buildProfileText;
    /**
     * 重新生成向量（用于画像更新后）
     */
    refreshVector(profile: AccountProfile): Promise<number[]>;
    /**
     * 批量向量化（用于多个画像）
     */
    vectorizeProfiles(profiles: AccountProfile[]): Promise<Map<string, number[]>>;
}
//# sourceMappingURL=vectorizer.d.ts.map