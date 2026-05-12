import { AccountProfile } from '../profile/types.js';
/**
 * 风格分析器
 * 分析账号画像，提取写作风格特征
 */
export declare class StyleAnalyzer {
    /**
     * 生成风格描述文本
     * 用于 prompt 构建
     */
    static generateStyleDescription(profile: AccountProfile): string;
    /**
     * 生成历史推文样本文本
     */
    static generateSampleTweetsText(profile: AccountProfile): string;
    /**
     * 计算目标长度范围
     */
    static calculateTargetLength(profile: AccountProfile): {
        min: number;
        max: number;
    };
    /**
     * 分析 Emoji 使用策略
     */
    static analyzeEmojiStrategy(profile: AccountProfile): string;
    /**
     * 验证草稿是否符合风格
     */
    static validateDraft(draft: string, profile: AccountProfile): {
        valid: boolean;
        issues: string[];
    };
    /**
     * 统计 emoji 数量
     */
    private static countEmojis;
}
//# sourceMappingURL=style-analyzer.d.ts.map