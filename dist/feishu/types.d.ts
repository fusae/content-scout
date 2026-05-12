/**
 * 飞书相关类型定义
 */
import { FilteredContent } from '../filter/types.js';
import { Draft } from '../generator/types.js';
/**
 * 飞书卡片操作类型
 */
export type CardActionType = 'copy' | 'reject' | 'view';
/**
 * 飞书卡片操作数据
 */
export interface CardActionValue {
    action: CardActionType;
    content_id: number;
    draft_index?: number;
    recommendation_id?: number;
}
/**
 * 飞书卡片操作回调
 */
export interface CardActionCallback {
    open_id: string;
    user_id: string;
    action: CardActionValue;
    token: string;
}
/**
 * 推荐卡片数据
 */
export interface RecommendationCard {
    content: FilteredContent;
    drafts: Draft[];
    recommendationId: number;
}
/**
 * 飞书推送选项
 */
export interface PushOptions {
    batchSize?: number;
    receiveIdType?: 'open_id' | 'user_id' | 'email';
    receiverId?: string;
}
/**
 * 飞书推送结果
 */
export interface PushResult {
    success: boolean;
    messageId?: string;
    error?: string;
    timestamp: Date;
}
//# sourceMappingURL=types.d.ts.map