import { DeepSeekClient } from '../ai/deepseek.js';
import { FilteredContent } from './types.js';
import { AccountProfile } from '../profile/types.js';
/**
 * AI 精排器
 * 使用 DeepSeek 对候选内容进行深度评分和排序
 */
export declare class AIRanker {
    private deepseekClient;
    constructor(deepseekClient: DeepSeekClient);
    /**
     * 执行 AI 精排
     * @param candidates 候选内容列表
     * @param profile 账号画像
     * @param minScore 最低分数阈值
     * @returns 精排后的内容列表
     */
    rank(candidates: FilteredContent[], profile: AccountProfile, minScore?: number): Promise<FilteredContent[]>;
    /**
     * 构建精排 Prompt
     */
    private buildRankingPrompt;
    /**
     * 调用 DeepSeek API
     */
    private callDeepSeek;
    /**
     * 解析 AI 返回的 JSON 结果
     */
    private parseRankingResponse;
    /**
     * 验证 RankedContent 对象的有效性
     */
    private isValidRankedContent;
    /**
     * 合并 AI 排序结果到候选内容
     */
    private mergeRankingResults;
    /**
     * 截断文本
     */
    private truncateText;
    /**
     * 格式化日期
     */
    private formatDate;
}
//# sourceMappingURL=ai-ranker.d.ts.map