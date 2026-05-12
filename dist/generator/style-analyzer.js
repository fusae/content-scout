import { logger } from '../utils/logger.js';
/**
 * 风格分析器
 * 分析账号画像，提取写作风格特征
 */
export class StyleAnalyzer {
    /**
     * 生成风格描述文本
     * 用于 prompt 构建
     */
    static generateStyleDescription(profile) {
        const { writingStyle, topics, interests, audience } = profile;
        const description = `
账号风格特征：
- 语气：${writingStyle.tone}
- 平均长度：${writingStyle.avgLength} 字符
- Emoji 使用：${writingStyle.emojiUsage}
- 常用 Emoji：${writingStyle.commonEmojis.join(' ')}
- 推文结构：${writingStyle.structure || '实用导向，避坑分享'}

主题领域：
${topics.join(', ')}

兴趣方向：
${interests.join(', ')}

目标受众：
${audience}
`.trim();
        return description;
    }
    /**
     * 生成历史推文样本文本
     */
    static generateSampleTweetsText(profile) {
        if (!profile.sampleTweets || profile.sampleTweets.length === 0) {
            return '（无历史推文样本）';
        }
        return profile.sampleTweets
            .slice(0, 5) // 最多取 5 条
            .map((tweet, index) => `${index + 1}. ${tweet.text} (${tweet.likes} likes)`)
            .join('\n---\n');
    }
    /**
     * 计算目标长度范围
     */
    static calculateTargetLength(profile) {
        const avgLength = profile.writingStyle.avgLength;
        const variance = 120; // 宽松建议范围，仅用于 prompt，不作为硬约束
        return {
            min: Math.max(30, avgLength - variance),
            max: Math.min(4000, avgLength + variance),
        };
    }
    /**
     * 分析 Emoji 使用策略
     */
    static analyzeEmojiStrategy(profile) {
        const usage = profile.writingStyle.emojiUsage.toLowerCase();
        if (usage.includes('很少') || usage.includes('rare')) {
            return '尽量不使用 emoji，保持专业简洁';
        }
        else if (usage.includes('适中') || usage.includes('moderate')) {
            return `适度使用 emoji，优先使用：${profile.writingStyle.commonEmojis.slice(0, 3).join(' ')}`;
        }
        else if (usage.includes('频繁') || usage.includes('frequent')) {
            return `可以多使用 emoji 增强表达，常用：${profile.writingStyle.commonEmojis.join(' ')}`;
        }
        return '根据内容适当使用 emoji';
    }
    /**
     * 验证草稿是否符合风格
     */
    static validateDraft(draft, profile) {
        const issues = [];
        // 1. 检查长度
        if (draft.length > 4000) {
            issues.push(`超过 4000 字符限制 (当前: ${draft.length})`);
        }
        // 2. 检查 Emoji 使用
        const emojiCount = this.countEmojis(draft);
        const usage = profile.writingStyle.emojiUsage.toLowerCase();
        if (usage.includes('很少') && emojiCount > 1) {
            issues.push(`Emoji 使用过多 (当前: ${emojiCount}, 该账号很少使用 emoji)`);
        }
        else if (usage.includes('频繁') && emojiCount === 0) {
            issues.push('缺少 emoji（该账号通常会使用 emoji）');
        }
        // 3. 检查是否包含链接占位符
        if (!draft.includes('http') && !draft.includes('[链接]')) {
            logger.debug('Draft does not contain URL placeholder');
        }
        return {
            valid: issues.length === 0,
            issues,
        };
    }
    /**
     * 统计 emoji 数量
     */
    static countEmojis(text) {
        // 简单的 emoji 检测（匹配 Unicode emoji 范围）
        const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
        const matches = text.match(emojiRegex);
        return matches ? matches.length : 0;
    }
}
//# sourceMappingURL=style-analyzer.js.map