import { FilteredContent } from '../filter/types.js';
import { Draft } from '../generator/types.js';
/**
 * 飞书交互式卡片构建器
 */
export declare class CardBuilder {
    /**
     * 构建推荐卡片
     */
    static buildRecommendationCard(content: FilteredContent, drafts: Draft[], recommendationId: number): any;
    /**
     * 构建草稿元素
     */
    private static buildDraftElements;
    /**
     * 获取风格标签
     */
    private static getStyleLabel;
    /**
     * 截断文本
     */
    private static truncateText;
    /**
     * 构建批量推荐摘要卡片
     */
    static buildBatchSummaryCard(count: number): any;
    /**
     * 构建反馈确认卡片
     */
    static buildFeedbackCard(action: 'accepted' | 'rejected', draftIndex?: number): any;
}
//# sourceMappingURL=cards.d.ts.map