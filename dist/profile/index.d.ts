import { DatabaseManager } from '../db/index.js';
import { AccountProfile } from './types.js';
/**
 * 账号画像管理器
 * 负责画像的初始化、查询、更新和向量化
 */
export declare class ProfileManager {
    private db;
    private vectorizer;
    private deepseekClient?;
    private accountHandle;
    constructor(db: DatabaseManager, embeddingApiKey: string, accountHandle: string, deepseekApiKey?: string, deepseekBaseURL?: string, embeddingBaseURL?: string, embeddingModel?: string);
    /**
     * 初始化账号画像
     * 从 initial-profile.json 读取数据并存储到数据库
     */
    initializeProfile(): Promise<AccountProfile>;
    /**
     * 获取账号画像
     */
    getProfile(): Promise<AccountProfile | null>;
    /**
     * 更新账号画像
     */
    updateProfile(updates: Partial<AccountProfile>): Promise<void>;
    /**
     * 刷新 embedding 向量
     */
    refreshVector(): Promise<void>;
    /**
     * 使用 DeepSeek 进行深度分析（可选）
     */
    deepAnalyze(): Promise<any>;
    /**
     * 从文件加载初始画像数据
     */
    private loadInitialProfileData;
    /**
     * 保存画像到数据库
     */
    private saveProfileToDatabase;
}
//# sourceMappingURL=index.d.ts.map