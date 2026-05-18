import { LarkClient } from './client.js';
import { CardBuilder } from './cards.js';
import { CardActionHandler } from './handler.js';
import { DatabaseManager } from '../db/index.js';
import { FilteredContent } from '../filter/types.js';
import { Draft } from '../generator/types.js';
import { PushOptions, PushResult } from './types.js';
import { logger } from '../utils/logger.js';
import { CardActionCallback, CardActionValue } from './types.js';

/**
 * 飞书客户端主类
 * 整合飞书 SDK、卡片构建、交互处理
 */
export class FeishuClient {
  private larkClient: LarkClient;
  private actionHandler: CardActionHandler;
  private defaultReceiverId?: string;

  constructor(private db: DatabaseManager) {
    this.larkClient = new LarkClient();
    this.actionHandler = new CardActionHandler(this.larkClient, db);
    logger.info('FeishuClient initialized');
  }

  /**
   * 初始化客户端
   */
  async initialize(defaultReceiverId?: string): Promise<void> {
    this.defaultReceiverId = defaultReceiverId;

    // 获取机器人信息
    const botInfo = await this.larkClient.getBotInfo();
    logger.info(`Feishu bot ready: ${botInfo.bot_name}`);

    await this.larkClient.startCardActionListener(async (data) => {
      const callback = this.normalizeCardAction(data);
      if (callback) {
        await this.handleCardAction(callback);
      }
    });
  }

  /**
   * 推送推荐内容
   */
  async pushRecommendations(
    recommendations: Array<{
      content: FilteredContent;
      drafts: Draft[];
    }>,
    options?: PushOptions
  ): Promise<PushResult[]> {
    const opts = this.normalizeOptions(options);
    const receiverId = opts.receiverId || this.defaultReceiverId;

    if (!receiverId) {
      throw new Error('Receiver ID is required. Please set defaultReceiverId or pass receiverId in options.');
    }

    logger.info(`Pushing ${recommendations.length} recommendations to ${receiverId}`);

    const results: PushResult[] = [];

    try {
      // 1. 发送批量摘要卡片
      if (recommendations.length > 1) {
        const summaryCard = CardBuilder.buildBatchSummaryCard(recommendations.length);
        await this.larkClient.sendCard(receiverId, summaryCard, opts.receiveIdType);
        logger.info('Batch summary card sent');
      }

      // 2. 逐个发送推荐卡片
      for (const rec of recommendations) {
        try {
          const result = await this.pushSingleRecommendation(
            rec.content,
            rec.drafts,
            receiverId,
            opts.receiveIdType
          );
          results.push(result);

          // 添加延迟避免消息过快
          await this.delay(1000);
        } catch (error) {
          logger.error(`Failed to push recommendation for content #${rec.content.contentId}:`, error);
          results.push({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date(),
          });
        }
      }

      logger.info(`Push completed: ${results.filter(r => r.success).length}/${results.length} succeeded`);
      return results;
    } catch (error) {
      logger.error('Failed to push recommendations:', error);
      throw error;
    }
  }

  /**
   * 推送单个推荐
   */
  private async pushSingleRecommendation(
    content: FilteredContent,
    drafts: Draft[],
    receiverId: string,
    receiveIdType: 'open_id' | 'user_id' | 'email'
  ): Promise<PushResult> {
    try {
      // 1. 保存推荐记录到数据库
      const recommendationId = this.db.insertRecommendation({
        content_id: content.contentId,
        match_score: content.aiScore || content.embeddingSimilarity * 10,
        match_reason: content.aiReason,
        drafts: JSON.stringify(drafts),
        status: 'pending',
      });

      // 2. 构建卡片
      const card = CardBuilder.buildRecommendationCard(content, drafts, recommendationId);

      // 3. 发送卡片
      const { message_id } = await this.larkClient.sendCard(receiverId, card, receiveIdType);

      logger.info(`Recommendation #${recommendationId} pushed, message_id: ${message_id}`);

      return {
        success: true,
        messageId: message_id,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Failed to push single recommendation:', error);
      throw error;
    }
  }

  /**
   * 处理卡片交互回调
   */
  async handleCardAction(callbackData: any): Promise<void> {
    try {
      await this.actionHandler.handleAction(callbackData);
    } catch (error) {
      logger.error('Failed to handle card action:', error);
      throw error;
    }
  }

  /**
   * 发送文本消息
   */
  async sendText(text: string, receiverId?: string): Promise<void> {
    const targetId = receiverId || this.defaultReceiverId;
    if (!targetId) {
      throw new Error('Receiver ID is required');
    }

    await this.larkClient.sendText(targetId, text);
  }

  close(): void {
    this.larkClient.close();
  }

  /**
   * 获取推荐统计
   */
  getRecommendationStats(): {
    pending: number;
    approved: number;
    rejected: number;
  } {
    const pending = this.db.getRecommendationsByStatus('pending').length;
    const approved = this.db.getRecommendationsByStatus('approved').length;
    const rejected = this.db.getRecommendationsByStatus('rejected').length;

    return { pending, approved, rejected };
  }

  /**
   * 标准化选项
   */
  private normalizeOptions(options?: PushOptions): Required<Omit<PushOptions, 'receiverId'>> & { receiverId?: string } {
    return {
      batchSize: options?.batchSize ?? 5,
      receiveIdType: options?.receiveIdType ?? 'open_id',
      receiverId: options?.receiverId,
    };
  }

  private normalizeCardAction(data: any): CardActionCallback | undefined {
    const openId = data?.operator?.open_id || data?.open_id;
    const rawValue = data?.action?.value;
    const action = this.parseCardActionValue(rawValue);

    if (!openId || !action) {
      logger.warn('Ignored invalid card action event');
      return undefined;
    }

    return {
      open_id: openId,
      user_id: data?.operator?.user_id || data?.user_id || '',
      action,
      token: data?.token || '',
    };
  }

  private parseCardActionValue(value: unknown): CardActionValue | undefined {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as CardActionValue;
      } catch {
        return undefined;
      }
    }

    if (typeof value === 'object' && value !== null) {
      return value as CardActionValue;
    }

    return undefined;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取底层 Lark 客户端（用于高级操作）
   */
  getLarkClient(): LarkClient {
    return this.larkClient;
  }
}
