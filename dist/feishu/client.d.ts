import * as lark from '@larksuiteoapi/node-sdk';
/**
 * 飞书客户端封装
 * 封装飞书 SDK 的基础功能
 */
export declare class LarkClient {
    private client;
    private appId;
    private appSecret;
    constructor();
    /**
     * 发送交互式卡片消息
     */
    sendCard(receiveId: string, card: any, receiveIdType?: 'open_id' | 'user_id' | 'email'): Promise<{
        message_id: string;
    }>;
    /**
     * 发送文本消息
     */
    sendText(receiveId: string, text: string, receiveIdType?: 'open_id' | 'user_id' | 'email'): Promise<{
        message_id: string;
    }>;
    /**
     * 回复消息
     */
    replyMessage(messageId: string, content: string, msgType?: 'text' | 'interactive'): Promise<void>;
    /**
     * 更新卡片消息
     */
    updateCard(messageId: string, card: any): Promise<void>;
    /**
     * 获取机器人信息
     */
    getBotInfo(): Promise<{
        bot_name: string;
        open_id: string;
    }>;
    /**
     * 获取客户端实例（用于高级操作）
     */
    getClient(): lark.Client;
}
//# sourceMappingURL=client.d.ts.map