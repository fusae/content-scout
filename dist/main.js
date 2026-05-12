import { DatabaseManager } from './db';
import { ContentAggregator } from './aggregator';
import { ProfileManager } from './profile';
import { FilterEngine } from './filter';
import { DraftGenerator } from './generator';
import { FeishuClient } from './feishu';
import { FeedbackLearner } from './feedback';
import { Scheduler } from './scheduler';
import { EmbeddingClient } from './ai/embedding';
import { DeepSeekClient } from './ai/deepseek';
import { logger } from './utils/logger';
import { config } from './config';
async function main() {
    logger.info('========== X Content Scout 启动 ==========');
    logger.info(`环境: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`账号: ${config.xAccount.handle}`);
    try {
        // 1. 初始化数据库
        logger.info('初始化数据库...');
        const db = new DatabaseManager(config.dbPath);
        await db.initialize();
        // 2. 初始化 AI 客户端
        logger.info('初始化 AI 客户端...');
        const embeddingClient = new EmbeddingClient(config.embedding.apiKey, config.embedding.baseURL, config.embedding.model);
        const deepseekClient = new DeepSeekClient(config.deepseek.apiKey, config.deepseek.baseURL);
        // 3. 初始化核心模块
        logger.info('初始化核心模块...');
        const aggregator = new ContentAggregator(db);
        const profileManager = new ProfileManager(db, config.embedding.apiKey, config.xAccount.handle, config.deepseek.apiKey, config.deepseek.baseURL, config.embedding.baseURL, config.embedding.model);
        const filterEngine = new FilterEngine(embeddingClient, deepseekClient, db);
        const draftGenerator = new DraftGenerator(deepseekClient);
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
        }
        else {
            logger.info('账号画像已存在', {
                topics: profile.topics.length,
                interests: profile.interests.length,
                lastUpdated: profile.lastUpdated
            });
        }
        // 5. 初始化飞书客户端
        logger.info('初始化飞书客户端...');
        await feishuClient.initialize();
        // 6. 创建调度器
        logger.info('创建定时任务调度器...');
        const scheduler = new Scheduler(aggregator, profileManager, filterEngine, draftGenerator, feishuClient, feedbackLearner, db);
        // 7. 启动调度器
        scheduler.start();
        logger.info('========== X Content Scout 启动完成 ==========');
        logger.info('系统正在运行，按 Ctrl+C 退出');
        // 8. 如果是开发模式，立即执行一次任务
        if (process.env.NODE_ENV === 'development') {
            logger.info('开发模式：立即执行一次任务');
            setTimeout(async () => {
                try {
                    await scheduler.runManually();
                }
                catch (error) {
                    logger.error('手动执行任务失败', error);
                }
            }, 3000);
        }
        // 9. 优雅退出
        process.on('SIGINT', async () => {
            logger.info('收到退出信号，正在关闭...');
            scheduler.stop();
            db.close();
            logger.info('已安全退出');
            process.exit(0);
        });
    }
    catch (error) {
        logger.error('启动失败', error);
        process.exit(1);
    }
}
// 启动应用
main().catch(error => {
    logger.error('未捕获的错误', error);
    process.exit(1);
});
//# sourceMappingURL=main.js.map