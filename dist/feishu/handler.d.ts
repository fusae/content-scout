import { DatabaseManager } from '../db/index.js';
import { CardActionCallback } from './types.js';
import { LarkClient } from './client.js';
/**
 * 飞书卡片交互处理器
 */
export declare class CardActionHandler {
    private larkClient;
    private db;
    constructor(larkClient: LarkClient, db: DatabaseManager);
    /**
     * 处理卡片按钮点击
     */
    handleAction(callback: CardActionCallback): Promise<void>;
    /**
     * 处理复制草稿
     */
    private handleCopyDraft;
    /**
     * 处理拒绝推荐
     */
    private handleReject;
    /**
     * 发送错误消息
     */
    private sendErrorMessage;
}
//# sourceMappingURL=handler.d.ts.map