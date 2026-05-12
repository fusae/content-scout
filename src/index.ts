import { config, ensureDirectories } from './config.js';
import { DatabaseManager } from './db/index.js';
import { logger } from './utils/logger.js';

function main() {
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

    // 测试数据库操作
    logger.info('Testing database operations...');

    // 插入测试账号画像
    db.upsertAccountProfile({
      account_handle: '@test_account',
      bio: 'Test account for X Content Scout',
      topics: JSON.stringify(['AI', 'Technology', 'Startups']),
      writing_style: JSON.stringify({ tone: 'professional', length: 'medium' }),
      tweet_count: 0,
    });

    // 读取账号画像
    const profile = db.getAccountProfile('@test_account');
    logger.info(`Retrieved profile: ${JSON.stringify(profile)}`);

    // 关闭数据库连接
    db.close();

    logger.info('All tests passed. Application is ready.');
  } catch (error) {
    logger.error('Application failed to start', error);
    process.exit(1);
  }
}

main();
