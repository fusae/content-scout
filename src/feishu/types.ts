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
  draft_index?: number; // 草稿索引（0-2）
  recommendation_id?: number; // 推荐记录 ID
}

/**
 * 飞书卡片操作回调
 */
export interface CardActionCallback {
  open_id: string; // 用户 open_id
  user_id: string; // 用户 user_id
  action: CardActionValue;
  token: string; // 回调验证 token
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
  batchSize?: number; // 批量推送数量，默认 5
  receiveIdType?: 'open_id' | 'user_id' | 'email'; // 接收者 ID 类型
  receiverId?: string; // 接收者 ID（如果不指定，发送到默认接收者）
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
