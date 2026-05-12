import { DeepSeekClient } from '../ai/deepseek.js';
import { AccountProfile } from '../profile/types.js';
import { FilteredContent } from '../filter/types.js';
import { DraftGenerationOptions, DraftGenerationResult } from './types.js';
/**
 * 草稿生成器
 * 为筛选后的内容生成多个风格的推文草稿
 */
export declare class DraftGenerator {
    private deepseekClient;
    private readonly DEFAULT_STYLES;
    private readonly MAX_LENGTH;
    constructor(deepseekClient: DeepSeekClient);
    /**
     * 为单条内容生成草稿
     */
    generateDrafts(content: FilteredContent, profile: AccountProfile, options?: DraftGenerationOptions): Promise<DraftGenerationResult>;
    /**
     * 批量生成草稿
     */
    generateBatch(contents: FilteredContent[], profile: AccountProfile, options?: DraftGenerationOptions): Promise<DraftGenerationResult[]>;
    /**
     * 构建 prompt
     */
    private buildPrompt;
    /**
     * 解析 API 响应
     */
    private parseResponse;
    /**
     * 验证草稿
     */
    private validateDrafts;
    /**
     * 截断草稿
     */
    private truncateDraft;
    /**
     * 标准化选项
     */
    private normalizeOptions;
    /**
     * 延迟函数
     */
    private delay;
}
//# sourceMappingURL=index.d.ts.map