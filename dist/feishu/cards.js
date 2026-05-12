/**
 * 飞书交互式卡片构建器
 */
export class CardBuilder {
    /**
     * 构建推荐卡片
     */
    static buildRecommendationCard(content, drafts, recommendationId) {
        const { content: contentItem, aiScore, aiReason } = content;
        return {
            config: {
                wide_screen_mode: true,
            },
            header: {
                title: {
                    content: `💡 推荐话题 (适配度: ${aiScore?.toFixed(1) || 'N/A'}/10)`,
                    tag: 'plain_text',
                },
                template: 'blue',
            },
            elements: [
                // 原始内容
                {
                    tag: 'div',
                    text: {
                        content: `**${contentItem.title}**\n来源: ${contentItem.source} | 作者: ${contentItem.author || '未知'}`,
                        tag: 'lark_md',
                    },
                },
                {
                    tag: 'hr',
                },
                // 内容摘要
                {
                    tag: 'div',
                    text: {
                        content: `**内容摘要：**\n${this.truncateText(contentItem.content, 200)}`,
                        tag: 'lark_md',
                    },
                },
                {
                    tag: 'hr',
                },
                // 匹配原因
                {
                    tag: 'div',
                    text: {
                        content: `**为什么推荐：**\n${aiReason || '与你的兴趣高度相关'}`,
                        tag: 'lark_md',
                    },
                },
                {
                    tag: 'hr',
                },
                // 草稿标题
                {
                    tag: 'div',
                    text: {
                        content: '**推文草稿：**',
                        tag: 'lark_md',
                    },
                },
                // 草稿 1-3
                ...this.buildDraftElements(drafts, recommendationId, content.contentId),
                {
                    tag: 'hr',
                },
                // 操作按钮
                {
                    tag: 'action',
                    actions: [
                        {
                            tag: 'button',
                            text: {
                                content: '📋 复制草稿1',
                                tag: 'plain_text',
                            },
                            type: 'primary',
                            value: JSON.stringify({
                                action: 'copy',
                                draft_index: 0,
                                content_id: content.contentId,
                                recommendation_id: recommendationId,
                            }),
                        },
                        {
                            tag: 'button',
                            text: {
                                content: '📋 复制草稿2',
                                tag: 'plain_text',
                            },
                            type: 'primary',
                            value: JSON.stringify({
                                action: 'copy',
                                draft_index: 1,
                                content_id: content.contentId,
                                recommendation_id: recommendationId,
                            }),
                        },
                        {
                            tag: 'button',
                            text: {
                                content: '📋 复制草稿3',
                                tag: 'plain_text',
                            },
                            type: 'primary',
                            value: JSON.stringify({
                                action: 'copy',
                                draft_index: 2,
                                content_id: content.contentId,
                                recommendation_id: recommendationId,
                            }),
                        },
                    ],
                },
                {
                    tag: 'action',
                    actions: [
                        {
                            tag: 'button',
                            text: {
                                content: '👎 不感兴趣',
                                tag: 'plain_text',
                            },
                            type: 'default',
                            value: JSON.stringify({
                                action: 'reject',
                                content_id: content.contentId,
                                recommendation_id: recommendationId,
                            }),
                        },
                        {
                            tag: 'button',
                            text: {
                                content: '🔗 查看原文',
                                tag: 'plain_text',
                            },
                            type: 'default',
                            url: contentItem.url,
                        },
                    ],
                },
            ],
        };
    }
    /**
     * 构建草稿元素
     */
    static buildDraftElements(drafts, _recommendationId, _contentId) {
        const elements = [];
        drafts.forEach((draft, index) => {
            const styleLabel = this.getStyleLabel(draft.style);
            elements.push({
                tag: 'div',
                text: {
                    content: `**草稿 ${index + 1} (${styleLabel})：**\n${draft.content}\n\n_${draft.reasoning}_\n\n字数: ${draft.length}`,
                    tag: 'lark_md',
                },
            });
            // 在草稿之间添加分隔线（除了最后一个）
            if (index < drafts.length - 1) {
                elements.push({
                    tag: 'hr',
                });
            }
        });
        return elements;
    }
    /**
     * 获取风格标签
     */
    static getStyleLabel(style) {
        const labels = {
            opinion: '观点型',
            share: '分享型',
            question: '提问型',
        };
        return labels[style] || style;
    }
    /**
     * 截断文本
     */
    static truncateText(text, maxLength) {
        if (text.length <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength) + '...';
    }
    /**
     * 构建批量推荐摘要卡片
     */
    static buildBatchSummaryCard(count) {
        return {
            config: {
                wide_screen_mode: true,
            },
            header: {
                title: {
                    content: `🎯 今日推荐 (${count} 条)`,
                    tag: 'plain_text',
                },
                template: 'green',
            },
            elements: [
                {
                    tag: 'div',
                    text: {
                        content: `为你精选了 **${count}** 条优质内容，每条都附带 3 个不同风格的推文草稿。\n\n点击下方卡片查看详情，选择你喜欢的草稿直接复制发布！`,
                        tag: 'lark_md',
                    },
                },
            ],
        };
    }
    /**
     * 构建反馈确认卡片
     */
    static buildFeedbackCard(action, draftIndex) {
        const messages = {
            accepted: `✅ 草稿 ${(draftIndex || 0) + 1} 已复制！\n\n记得替换 [链接] 为实际 URL，然后去 X 发布吧！`,
            rejected: '👌 已记录你的反馈！\n\n我们会根据你的偏好优化后续推荐。',
        };
        return {
            config: {
                wide_screen_mode: true,
            },
            header: {
                title: {
                    content: action === 'accepted' ? '✅ 操作成功' : '👌 已记录',
                    tag: 'plain_text',
                },
                template: action === 'accepted' ? 'green' : 'grey',
            },
            elements: [
                {
                    tag: 'div',
                    text: {
                        content: messages[action],
                        tag: 'lark_md',
                    },
                },
            ],
        };
    }
}
//# sourceMappingURL=cards.js.map