/**
 * DeepSeek 客户端
 * 用于深度分析账号画像，提取更细粒度的风格特征
 */
export declare class DeepSeekClient {
    private client;
    private model;
    constructor(apiKey: string, baseURL?: string);
    /**
     * 深度分析账号画像
     * 基于样本推文提取风格特征
     */
    analyzeProfile(sampleTweets: string[], currentProfile: any): Promise<any>;
    /**
     * 构建分析提示词
     */
    private buildAnalysisPrompt;
    /**
     * 生成推文草稿
     */
    generateTweetDraft(topic: string, profile: any): Promise<string>;
}
//# sourceMappingURL=deepseek.d.ts.map