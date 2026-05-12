/**
 * 账号画像类型定义
 */

export interface WritingStyle {
  tone: string; // 语气风格，如 "专业/轻松"
  avgLength: number; // 平均推文长度
  emojiUsage: string; // emoji 使用频率，如 "很少"、"适中"、"频繁"
  commonEmojis: string[]; // 常用 emoji 列表
  structure?: string; // 推文结构模式
}

export interface SampleTweet {
  text: string;
  likes: number;
}

export interface AccountProfile {
  id?: number;
  accountHandle: string;
  bio: string;
  topics: string[]; // 主题标签
  writingStyle: WritingStyle;
  interests: string[]; // 兴趣领域
  audience: string; // 目标受众描述
  interestVector?: number[]; // embedding 向量 (768维)
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
