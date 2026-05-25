import { DatabaseManager } from './db/index.js';
import { ContentAggregator } from './aggregator/index.js';
import { ProfileManager } from './profile/index.js';
import { FilterEngine } from './filter/index.js';
import { DraftGenerator } from './generator/index.js';
import { FeishuClient } from './feishu/index.js';
import { FeedbackLearner } from './feedback/index.js';
import { Scheduler } from './scheduler/index.js';
import { EmbeddingClient } from './ai/embedding.js';
import { DeepSeekClient } from './ai/deepseek.js';
import { logger } from './utils/logger.js';
import { config, localRuntimeConfig } from './config.js';

async function main() {
  logger.info('========== Spark 启动 ==========');
  logger.info(`环境: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`账号: ${localRuntimeConfig.accountHandle}`);

  try {
    // 1. 初始化数据库
    logger.info('初始化数据库...');
    const db = new DatabaseManager(config.dbPath);
    await db.initialize();

    // 2. 初始化 AI 客户端
    logger.info('初始化 AI 客户端...');
    const embeddingClient = new EmbeddingClient(
      config.embedding.apiKey,
      config.embedding.baseURL,
      config.embedding.model
    );
    const deepseekClient = new DeepSeekClient(
      config.deepseek.apiKey,
      config.deepseek.baseURL
    );

    // 3. 初始化核心模块
    logger.info('初始化核心模块...');
    const aggregator = new ContentAggregator(db, localRuntimeConfig);
    const profileManager = new ProfileManager(
      db,
      config.embedding.apiKey,
      localRuntimeConfig.accountHandle,
      config.deepseek.apiKey,
      config.deepseek.baseURL,
      config.embedding.baseURL,
      config.embedding.model,
      localRuntimeConfig.profilePath
    );
    const filterEngine = new FilterEngine(embeddingClient, deepseekClient, db);
    const draftGenerator = new DraftGenerator(deepseekClient, 'deepseek-chat');
    const feishuClient = new FeishuClient(db);
    const feedbackLearner = new FeedbackLearner(db);

    // 4. 检查并初始化账号画像
    logger.info('检查账号画像...');
    let profile = await profileManager.getProfile();
    if (!profile) {
      logger.info('账号画像不存在，开始初始化...');
      await profileManager.initializeProfile();
      profile = await profileManager.getProfile();
      logger.info('账号画像初始化完成');
    } else {
      logger.info('账号画像已存在', {
        topics: profile.topics.length,
        interests: profile.interests.length,
        lastUpdated: profile.lastUpdated
      });
    }

    // 5. 初始化飞书客户端
    logger.info('初始化飞书客户端...');
    await feishuClient.initialize(localRuntimeConfig.lark.defaultReceiverId || undefined);

    // 6. 创建调度器
    logger.info('创建定时任务调度器...');
    const scheduler = new Scheduler(
      aggregator,
      profileManager,
      filterEngine,
      draftGenerator,
      feishuClient,
      feedbackLearner,
      db
    );

    // 7. 启动调度器
    scheduler.start();
    const keepAlive = setInterval(() => undefined, 24 * 60 * 60 * 1000);

    logger.info('========== Spark 启动完成 ==========');
    logger.info('系统正在运行，按 Ctrl+C 退出');

    // 8. 如果是开发模式，立即执行一次任务
    if (process.env.NODE_ENV === 'development') {
      logger.info('开发模式：立即执行一次任务');
      setTimeout(async () => {
        try {
          await scheduler.runManually();
        } catch (error) {
          logger.error('手动执行任务失败', error);
        }
      }, 3000);
    }

    // 9. 优雅退出
    const shutdown = async () => {
      logger.info('收到退出信号，正在关闭...');
      clearInterval(keepAlive);
      scheduler.stop();
      feishuClient.close();
      db.close();
      logger.info('已安全退出');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    logger.error('启动失败', error);
    process.exit(1);
  }
}

// 启动应用
main().catch(error => {
  logger.error('未捕获的错误', error);
  process.exit(1);
});
