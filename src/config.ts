import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

// 加载环境变量
dotenv.config();

/**
 * 应用配置
 */
export const config = {
  // 数据库配置
  dbPath: process.env.DB_PATH || './data/scout.db',

  // 日志配置
  logLevel: process.env.LOG_LEVEL || 'info',
  logFile: process.env.LOG_FILE || './logs/app.log',

  // 私有画像配置
  profile: {
    path: process.env.PROFILE_PATH || '',
  },

  // OpenAI 配置（保留兼容旧配置）
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
  },

  // Embedding 配置（默认使用阿里云百炼 OpenAI 兼容接口）
  embedding: {
    apiKey: process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || '',
    baseURL:
      process.env.EMBEDDING_BASE_URL ||
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: process.env.EMBEDDING_MODEL || 'text-embedding-v4',
  },

  // DeepSeek 配置（可选）
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  },

  // X 账号配置
  xAccount: {
    handle: process.env.X_ACCOUNT_HANDLE || 'example_creator',
  },

  // Reddit 配置：API 审批前使用 RSS 抓取公开 subreddit
  reddit: {
    subreddits: (process.env.REDDIT_SUBREDDITS || 'LocalLLaMA,OpenAI,ChatGPT,artificial,MachineLearning,programming,startups,technology')
      .split(',')
      .map((subreddit) => subreddit.trim().replace(/^r\//i, ''))
      .filter(Boolean),
  },

  // 飞书配置
  lark: {
    appId: process.env.LARK_APP_ID || '',
    appSecret: process.env.LARK_APP_SECRET || '',
    baseId: process.env.LARK_BASE_ID || '',
    defaultReceiverId: process.env.FEISHU_DEFAULT_RECEIVER_ID || '',
  },

  // Turing 单任务模式（用于把推荐转成写作任务）
  turing: {
    baseUrl: process.env.TURING_BASE_URL || '',
    apiToken: process.env.TURING_API_TOKEN || '',
    articleAgent: process.env.TURING_ARTICLE_AGENT || 'opencode',
    articleCwd: process.env.TURING_ARTICLE_CWD || '',
    articleRules:
      process.env.TURING_ARTICLE_RULES ||
      '按当前工作区已有写文工作流执行；完成后在 [RESULT]...[/RESULT] 中返回最终文章路径或结果摘要。',
  },

  // 速率限制配置
  rateLimit: {
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '3', 10),
    requestDelayMs: parseInt(process.env.REQUEST_DELAY_MS || '1000', 10),
  },

  // 定时任务配置
  cronSchedule: process.env.CRON_SCHEDULE || '0 9 * * *',
} as const;

/**
 * 验证必需的配置项
 */
export function validateConfig(): void {
  const errors: string[] = [];

  if (!config.embedding.apiKey) {
    errors.push('EMBEDDING_API_KEY is required');
  }

  if (!config.lark.appId || !config.lark.appSecret) {
    errors.push('LARK_APP_ID and LARK_APP_SECRET are required');
  }

  // LARK_BASE_ID 暂时不做强制校验
  // if (!config.lark.baseId) {
  //   errors.push('LARK_BASE_ID is required');
  // }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * 确保必要的目录存在
 */
export function ensureDirectories(): void {
  const dirs = [
    dirname(resolve(config.dbPath)),
    dirname(resolve(config.logFile)),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}
