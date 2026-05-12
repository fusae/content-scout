/**
 * 账号画像类型定义
 */
export interface WritingStyle {
    tone: string;
    avgLength: number;
    emojiUsage: string;
    commonEmojis: string[];
    structure?: string;
}
export interface SampleTweet {
    text: string;
    likes: number;
}
export interface AccountProfile {
    id?: number;
    accountHandle: string;
    bio: string;
    topics: string[];
    writingStyle: WritingStyle;
    interests: string[];
    audience: string;
    interestVector?: number[];
    lastUpdated?: Date;
    tweetCount: number;
    sampleTweets?: SampleTweet[];
}
/**
 * 初始画像数据格式（从 JSON 文件读取）
 */
export interface InitialProfileData {
    accountHandle: string;
    bio: string;
    topics: string[];
    writingStyle: WritingStyle;
    interests: string[];
    audience: string;
    tweetCount: number;
    sampleTweets: SampleTweet[];
}
//# sourceMappingURL=types.d.ts.map