import { DatabaseManager } from './db/index.js';
import { ContentAggregator } from './aggregator/index.js';
import { logger } from './utils/logger.js';
import { config } from './config.js';

/**
 * 测试内容聚合功能
 */
async function testAggregator() {
  logger.info('Starting content aggregator test...');

  // 初始化数据库
  const db = new DatabaseManager(config.dbPath);
  db.initialize();

  // 创建聚合器
  const aggregator = new ContentAggregator(db);

  try {
    // 测试 P0 平台（核心平台）
    logger.info('=== Testing P0 Platforms (Core) ===');
    await aggregator.aggregateFrom(['hackernews', 'github']);

    // 等待一段时间，避免请求过快
    await sleep(3000);

    // 测试 P1 平台（重要平台）
    logger.info('=== Testing P1 Platforms (Important) ===');
    await aggregator.aggregateFrom(['zhihu', 'producthunt']);

    // 等待一段时间
    await sleep(3000);

    // 测试 P2 平台（补充平台）
    logger.info('=== Testing P2 Platforms (Optional) ===');
    await aggregator.aggregateFrom(['reddit', 'v2ex']);

    // X 平台单独测试（容易失败）
    logger.info('=== Testing X Platform (May Fail) ===');
    await aggregator.aggregateFrom(['x']);

    // 显示数据库中的内容
    logger.info('=== Database Content Summary ===');
    const recentContent = db.getRecentContent(10);
    logger.info(`Total items in database: ${recentContent.length} (showing recent 10)`);

    recentContent.forEach((item, index) => {
      logger.info(`${index + 1}. [${item.source}] ${item.title}`);
      logger.info(`   URL: ${item.url}`);
      logger.info(`   Collected: ${item.collected_at}`);
    });

    // 测试清理功能
    logger.info('=== Testing Cleanup ===');
    const deletedCount = await aggregator.cleanupOldContent(30); // 清理30天前的内容
    logger.info(`Cleanup test completed: ${deletedCount} items would be deleted`);

  } catch (error) {
    logger.error('Test failed:', error as Error);
  } finally {
    db.close();
  }

  logger.info('Content aggregator test completed!');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 运行测试
testAggregator().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
