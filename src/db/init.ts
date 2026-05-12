import { resolve } from 'path';
import { config, ensureDirectories } from '../config.js';
import { DatabaseManager } from './index.js';
import { logger } from '../utils/logger.js';

/**
 * 数据库初始化脚本
 */
function initDatabase() {
  try {
    logger.info('Initializing database...');

    // 确保目录存在
    ensureDirectories();

    // 创建数据库实例
    const dbPath = resolve(config.dbPath);
    const db = new DatabaseManager(dbPath);

    // 初始化表结构
    db.initialize();

    logger.info('Database initialized successfully');
    logger.info(`Database location: ${dbPath}`);

    // 关闭连接
    db.close();
  } catch (error) {
    logger.error('Failed to initialize database', error);
    process.exit(1);
  }
}

initDatabase();
