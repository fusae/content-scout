import { ContentItem } from './content.js';

export type SourceName = ContentItem['source'];

export const sourceNames: SourceName[] = [
  'x',
  'hackernews',
  'github',
  'zhihu',
  'producthunt',
  'reddit',
  'v2ex',
  'douyin',
  'xiaohongshu',
];

export interface SourceRuntimeConfig {
  enabled: boolean;
}

export interface RedditSourceRuntimeConfig extends SourceRuntimeConfig {
  subreddits: string[];
}

export interface DouyinSourceRuntimeConfig extends SourceRuntimeConfig {
  keywords: string[];
  cookie: string;
  tiktokDownloaderApiUrl: string;
  tiktokDownloaderToken: string;
}

export interface XiaohongshuSourceRuntimeConfig extends SourceRuntimeConfig {
  keywords: string[];
  cookie: string;
  adapter: 'redbook' | 'native';
  cookieSource: 'chrome' | 'safari' | 'firefox';
  chromeProfile: string;
}

export interface SourcesRuntimeConfig {
  x: SourceRuntimeConfig;
  hackernews: SourceRuntimeConfig;
  github: SourceRuntimeConfig;
  zhihu: SourceRuntimeConfig;
  producthunt: SourceRuntimeConfig;
  reddit: RedditSourceRuntimeConfig;
  v2ex: SourceRuntimeConfig;
  douyin: DouyinSourceRuntimeConfig;
  xiaohongshu: XiaohongshuSourceRuntimeConfig;
}

export interface UserRuntimeConfig {
  userId: string;
  accountHandle: string;
  profilePath: string;
  sources: SourcesRuntimeConfig;
  lark: {
    appId: string;
    appSecret: string;
    baseId: string;
    defaultReceiverId: string;
  };
  schedule: {
    cronSchedule: string;
    timezone: string;
  };
  rateLimit: {
    maxConcurrent: number;
    requestDelayMs: number;
  };
}
