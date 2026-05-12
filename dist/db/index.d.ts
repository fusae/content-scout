export interface AccountProfile {
    id?: number;
    account_handle: string;
    bio?: string;
    topics?: string;
    writing_style?: string;
    interest_vector?: string;
    last_updated?: string;
    tweet_count?: number;
}
export interface ContentPool {
    id?: number;
    source: string;
    title?: string;
    content: string;
    url?: string;
    author?: string;
    published_at?: string;
    metrics?: string;
    collected_at?: string;
    embedding_vector?: string;
}
export interface Recommendation {
    id?: number;
    content_id: number;
    match_score: number;
    match_reason?: string;
    drafts?: string;
    recommended_at?: string;
    status?: string;
    user_feedback?: string;
}
export interface FeedbackLog {
    id?: number;
    recommendation_id: number;
    action: string;
    modified_draft?: string;
    created_at?: string;
}
export declare class DatabaseManager {
    private db;
    constructor(dbPath: string);
    /**
     * 初始化数据库表结构
     */
    initialize(): void;
    /**
     * 账号画像相关操作
     */
    upsertAccountProfile(profile: AccountProfile): void;
    getAccountProfile(accountHandle: string): AccountProfile | undefined;
    /**
     * 内容池相关操作
     */
    insertContent(content: ContentPool): number;
    getContentById(id: number): ContentPool | undefined;
    getRecentContent(limit?: number): ContentPool[];
    getContentByUrl(url: string): ContentPool | undefined;
    getContentByHash(_hash: string): ContentPool | undefined;
    deleteOldContent(daysOld: number): number;
    /**
     * 推荐记录相关操作
     */
    insertRecommendation(recommendation: Recommendation): number;
    updateRecommendationStatus(id: number, status: string, feedback?: string): void;
    getRecommendationsByStatus(status: string): Recommendation[];
    /**
     * 反馈日志相关操作
     */
    insertFeedback(feedback: FeedbackLog): number;
    getFeedbackByRecommendation(recommendationId: number): FeedbackLog[];
    /**
     * 关闭数据库连接
     */
    close(): void;
}
//# sourceMappingURL=index.d.ts.map