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

  // OpenAI 配置
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
  },

  // DeepSeek 配置（可选）
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  },

  // X 账号配置
  xAccount: {
    handle: process.env.X_ACCOUNT_HANDLE || 'rabbitrun_eth',
  },

  // 飞书配置
  lark: {
    appId: process.env.LARK_APP_ID || '',
    appSecret: process.env.LARK_APP_SECRET || '',
    baseId: process.env.LARK_BASE_ID || '',
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

  if (!config.openai.apiKey) {
    errors.push('OPENAI_API_KEY is required');
  }

  if (!config.lark.appId || !config.lark.appSecret) {
    errors.push('LARK_APP_ID and LARK_APP_SECRET are required');
  }

  if (!config.lark.baseId) {
    errors.push('LARK_BASE_ID is required');
  }

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
