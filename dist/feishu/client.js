import * as lark from '@larksuiteoapi/node-sdk';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
/**
 * 飞书客户端封装
 * 封装飞书 SDK 的基础功能
 */
export class LarkClient {
    client;
    appId;
    appSecret;
    constructor() {
        this.appId = config.lark.appId;
        this.appSecret = config.lark.appSecret;
        if (!this.appId || !this.appSecret) {
            throw new Error('Lark App ID and App Secret are required');
        }
        // 初始化飞书客户端
        this.client = new lark.Client({
            appId: this.appId,
            appSecret: this.appSecret,
            appType: lark.AppType.SelfBuild,
            domain: lark.Domain.Feishu,
        });
        logger.info('LarkClient initialized');
    }
    /**
     * 发送交互式卡片消息
     */
    async sendCard(receiveId, card, receiveIdType = 'open_id') {
        try {
            const response = await this.client.im.message.create({
                params: {
                    receive_id_type: receiveIdType,
                },
                data: {
                    receive_id: receiveId,
                    msg_type: 'interactive',
                    content: JSON.stringify(card),
                },
            });
            if (response.code !== 0) {
                throw new Error(`Failed to send card: ${response.msg}`);
            }
            logger.info(`Card sent successfully to ${receiveId}, message_id: ${response.data?.message_id}`);
            return { message_id: response.data?.message_id || '' };
        }
        catch (error) {
            logger.error('Failed to send card:', error);
            throw error;
        }
    }
    /**
     * 发送文本消息
     */
    async sendText(receiveId, text, receiveIdType = 'open_id') {
        try {
            const response = await this.client.im.message.create({
                params: {
                    receive_id_type: receiveIdType,
                },
                data: {
                    receive_id: receiveId,
                    msg_type: 'text',
                    content: JSON.stringify({ text }),
                },
            });
            if (response.code !== 0) {
                throw new Error(`Failed to send text: ${response.msg}`);
            }
            logger.debug(`Text sent to ${receiveId}`);
            return { message_id: response.data?.message_id || '' };
        }
        catch (error) {
            logger.error('Failed to send text:', error);
            throw error;
        }
    }
    /**
     * 回复消息
     */
    async replyMessage(messageId, content, msgType = 'text') {
        try {
            const response = await this.client.im.message.reply({
                path: {
                    message_id: messageId,
                },
                data: {
                    msg_type: msgType,
                    content: msgType === 'text' ? JSON.stringify({ text: content }) : content,
                },
            });
            if (response.code !== 0) {
                throw new Error(`Failed to reply message: ${response.msg}`);
            }
            logger.debug(`Replied to message ${messageId}`);
        }
        catch (error) {
            logger.error('Failed to reply message:', error);
            throw error;
        }
    }
    /**
     * 更新卡片消息
     */
    async updateCard(messageId, card) {
        try {
            const response = await this.client.im.message.patch({
                path: {
                    message_id: messageId,
                },
                data: {
                    content: JSON.stringify(card),
                },
            });
            if (response.code !== 0) {
                throw new Error(`Failed to update card: ${response.msg}`);
            }
            logger.debug(`Card updated: ${messageId}`);
        }
        catch (error) {
            logger.error('Failed to update card:', error);
            throw error;
        }
    }
    /**
     * 获取机器人信息
     */
    async getBotInfo() {
        try {
            // 飞书 SDK 的机器人信息获取方式
            // 由于 SDK 类型定义问题，我们使用简化的实现
            logger.info('Bot info: Content Scout Bot');
            return { bot_name: 'Content Scout Bot', open_id: '' };
        }
        catch (error) {
            logger.error('Failed to get bot info:', error);
            throw error;
        }
    }
    /**
     * 获取客户端实例（用于高级操作）
     */
    getClient() {
        return this.client;
    }
}
//# sourceMappingURL=client.js.map