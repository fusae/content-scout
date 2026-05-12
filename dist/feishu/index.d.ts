import { LarkClient } from './client.js';
import { DatabaseManager } from '../db/index.js';
import { FilteredContent } from '../filter/types.js';
import { Draft } from '../generator/types.js';
import { PushOptions, PushResult } from './types.js';
/**
 * 飞书客户端主类
 * 整合飞书 SDK、卡片构建、交互处理
 */
export declare class FeishuClient {
    private db;
    private larkClient;
    private actionHandler;
    private defaultReceiverId?;
    constructor(db: DatabaseManager);
    /**
     * 初始化客户端
     */
    initialize(defaultReceiverId?: string): Promise<void>;
    /**
     * 推送推荐内容
     */
    pushRecommendations(recommendations: Array<{
        content: FilteredContent;
        drafts: Draft[];
    }>, options?: PushOptions): Promise<PushResult[]>;
    /**
     * 推送单个推荐
     */
    private pushSingleRecommendation;
    /**
     * 处理卡片交互回调
     */
    handleCardAction(callbackData: any): Promise<void>;
    /**
     * 发送文本消息
     */
    sendText(text: string, receiverId?: string): Promise<void>;
    /**
     * 获取推荐统计
     */
    getRecommendationStats(): {
        pending: number;
        approved: number;
        rejected: number;
    };
    /**
     * 标准化选项
     */
    private normalizeOptions;
    /**
     * 延迟函数
     */
    private delay;
    /**
     * 获取底层 Lark 客户端（用于高级操作）
     */
    getLarkClient(): LarkClient;
}
//# sourceMappingURL=index.d.ts.map