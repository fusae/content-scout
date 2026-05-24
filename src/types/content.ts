/**
 * 内容项接口 - 标准化的内容数据结构
 */
export interface ContentItem {
  source: 'x' | 'hackernews' | 'github' | 'zhihu' | 'producthunt' | 'reddit' | 'v2ex' | 'douyin' | 'xiaohongshu' | 'weibo';
  title: string;
  content: string;
  url: string;
  author?: string;
  publishedAt: Date;
  metrics?: {
    likes?: number;
    comments?: number;
    shares?: number;
    stars?: number;
    points?: number;
  };
  collectedAt: Date;
}

/**
 * 爬虫统计信息
 */
export interface ScraperStats {
  source: string;
  itemsCollected: number;
  itemsDeduped: number;
  itemsSaved: number;
  errors: number;
  duration: number; // 毫秒
  failureType?: import('../utils/failure.js').FailureType;
  userMessage?: string;
  recoverable?: boolean;
  actionLabel?: string;
}
