import { DatabaseManager } from '../db/index.js';
import { CardActionCallback, CardActionValue } from './types.js';
import { LarkClient } from './client.js';
import { logger } from '../utils/logger.js';
import { TuringClient } from '../turing/client.js';

/**
 * 飞书卡片交互处理器
 */
export class CardActionHandler {
  private turingClient = new TuringClient();

  constructor(
    private larkClient: LarkClient,
    private db: DatabaseManager
  ) {
    logger.info('CardActionHandler initialized');
  }

  /**
   * 处理卡片按钮点击
   */
  async handleAction(callback: CardActionCallback): Promise<void> {
    const { open_id, action } = callback;

    logger.info(`Handling card action: ${action.action} from ${open_id}`);

    try {
      switch (action.action) {
        case 'copy':
          await this.handleCopyDraft(open_id, action);
          break;
        case 'reject':
          await this.handleReject(open_id, action);
          break;
        case 'article':
          await this.handleWriteArticle(open_id, action);
          break;
        default:
          logger.warn(`Unknown action type: ${action.action}`);
      }
    } catch (error) {
      logger.error('Failed to handle card action:', error);
      await this.sendErrorMessage(open_id);
    }
  }

  /**
   * 处理复制草稿
   */
  private async handleCopyDraft(openId: string, action: CardActionValue): Promise<void> {
    const { recommendation_id, draft_index, content_id } = action;

    if (draft_index === undefined || !recommendation_id) {
      throw new Error('Missing draft_index or recommendation_id');
    }

    // 1. 记录反馈
    this.db.insertFeedback({
      recommendation_id,
      action: 'accepted',
      modified_draft: `draft_${draft_index}`,
    });

    // 2. 更新推荐状态
    this.db.updateRecommendationStatus(recommendation_id, 'approved', `draft_${draft_index}`);

    // 3. 获取草稿内容
    const recommendation = this.db.getRecommendationById(recommendation_id);
    if (!recommendation) {
      throw new Error(`Recommendation ${recommendation_id} not found`);
    }

    const drafts = recommendation.drafts ? JSON.parse(recommendation.drafts) : [];
    const selectedDraft = drafts[draft_index];

    if (!selectedDraft) {
      throw new Error(`Draft ${draft_index} not found`);
    }

    // 4. 获取原文内容，确认记录仍存在
    const content = this.db.getContentById(content_id);
    if (!content) {
      throw new Error(`Content ${content_id} not found`);
    }

    // 5. 草稿正文不附带链接，避免影响 X 分发
    const finalDraft = selectedDraft.content;

    // 6. 发送确认消息（包含可复制的草稿）
    await this.larkClient.sendText(
      openId,
      `✅ 草稿 ${draft_index + 1} 已准备好！\n\n${finalDraft}\n\n复制上面的内容，去 X 发布吧！`
    );

    logger.info(`Draft ${draft_index} copied for recommendation ${recommendation_id}`);
  }

  /**
   * 处理拒绝推荐
   */
  private async handleReject(openId: string, action: CardActionValue): Promise<void> {
    const { recommendation_id } = action;

    if (!recommendation_id) {
      throw new Error('Missing recommendation_id');
    }

    // 1. 记录反馈
    this.db.insertFeedback({
      recommendation_id,
      action: 'rejected',
    });

    // 2. 更新推荐状态
    this.db.updateRecommendationStatus(recommendation_id, 'rejected', 'user_rejected');

    // 3. 发送确认消息
    await this.larkClient.sendText(
      openId,
      '👌 已记录你的反馈！\n\n我们会根据你的偏好优化后续推荐，避免类似内容。'
    );

    logger.info(`Recommendation ${recommendation_id} rejected`);
  }

  /**
   * 处理写成文章
   */
  private async handleWriteArticle(openId: string, action: CardActionValue): Promise<void> {
    const { recommendation_id, content_id } = action;

    if (!recommendation_id || !content_id) {
      throw new Error('Missing recommendation_id or content_id');
    }

    const recommendation = this.db.getRecommendationById(recommendation_id);
    if (!recommendation) {
      throw new Error(`Recommendation ${recommendation_id} not found`);
    }

    const content = this.db.getContentById(content_id);
    if (!content) {
      throw new Error(`Content ${content_id} not found`);
    }

    const task = await this.turingClient.createArticleTask(recommendation, content);

    this.db.insertFeedback({
      recommendation_id,
      action: 'article_requested',
      modified_draft: task.id,
    });

    await this.larkClient.sendText(
      openId,
      `✍️ 已提交写作任务\n\n任务 ID：${task.id}`
    );

    logger.info(`Article task ${task.id} created for recommendation ${recommendation_id}`);
  }

  /**
   * 发送错误消息
   */
  private async sendErrorMessage(openId: string): Promise<void> {
    try {
      await this.larkClient.sendText(
        openId,
        '❌ 操作失败，请稍后重试或联系管理员。'
      );
    } catch (error) {
      logger.error('Failed to send error message:', error);
    }
  }
}
