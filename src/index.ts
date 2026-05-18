import { config, ensureDirectories } from './config.js';
import { DatabaseManager } from './db/index.js';
import { ContentAggregator } from './aggregator/index.js';
import { ProfileManager } from './profile/index.js';
import { logger } from './utils/logger.js';
import cron from 'node-cron';

async function main() {
  try {
    logger.info('Starting X Content Scout...');

    // 确保必要的目录存在
    ensureDirectories();

    // 初始化数据库
    const db = new DatabaseManager(config.dbPath);
    db.initialize();

    logger.info('Application initialized successfully');
    logger.info(`Database: ${config.dbPath}`);
    logger.info(`Log level: ${config.logLevel}`);
    logger.info(`Account: @${config.account.handle}`);

    // 初始化账号画像管理器
    logger.info('Initializing profile manager...');
    const profileManager = new ProfileManager(
      db,
      config.embedding.apiKey,
      config.account.handle,
      config.deepseek.apiKey || undefined,
      config.deepseek.baseURL,
      config.embedding.baseURL,
      config.embedding.model,
      config.profile.path
    );

    // 检查并初始化账号画像
    let profile = await profileManager.getProfile();
    if (!profile) {
      logger.info('No profile found, initializing from configured profile data...');
      profile = await profileManager.initializeProfile();
      logger.info('Profile initialized successfully');
      logger.info(`Topics: ${profile.topics.join(', ')}`);
      logger.info(`Interests: ${profile.interests.join(', ')}`);
      logger.info(`Vector dimensions: ${profile.interestVector?.length || 0}`);
    } else {
      logger.info('Profile loaded from database');
      logger.info(`Topics: ${profile.topics.join(', ')}`);
      logger.info(`Last updated: ${profile.lastUpdated}`);
    }

    // 创建内容聚合器
    const aggregator = new ContentAggregator(db);

    // 立即运行一次内容聚合
    logger.info('Running initial content aggregation...');
    await aggregator.aggregateAll();

    // 设置定时任务：每小时运行一次内容聚合
    logger.info('Setting up scheduled content aggregation (every hour)...');
    cron.schedule('0 * * * *', async () => {
      logger.info('Running scheduled content aggregation...');
      try {
        await aggregator.aggregateAll();
      } catch (error) {
        logger.error('Scheduled aggregation failed:', error as Error);
      }
    });

    // 设置定时任务：每天凌晨清理过期内容
    logger.info('Setting up scheduled content cleanup (daily at midnight)...');
    cron.schedule('0 0 * * *', async () => {
      logger.info('Running scheduled content cleanup...');
      try {
        await aggregator.cleanupOldContent(7);
      } catch (error) {
        logger.error('Scheduled cleanup failed:', error as Error);
      }
    });

    logger.info('X Content Scout is running. Press Ctrl+C to stop.');

    // 保持进程运行
    process.on('SIGINT', () => {
      logger.info('Shutting down gracefully...');
      db.close();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('Shutting down gracefully...');
      db.close();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Application failed to start', error as Error);
    process.exit(1);
  }
}

main();
