/**
 * 完整工作流示例
 *
 * 演示从内容聚合到飞书推送的完整流程：
 * Phase 1: 基础设施 ✓
 * Phase 2: 内容聚合 ✓
 * Phase 3: 账号画像 ✓
 * Phase 4: 智能过滤 ✓
 * Phase 5: 内容生成 ✓
 * Phase 6: 飞书推送 ✓
 */

import { DatabaseManager } from './db/index.js';
import { ContentAggregator } from './aggregator/index.js';
import { ProfileManager } from './profile/index.js';
import { FilterEngine } from './filter/index.js';
import { DraftGenerator } from './generator/index.js';
import { FeishuClient } from './feishu/index.js';
import { EmbeddingClient } from './ai/embedding.js';
import { DeepSeekClient } from './ai/deepseek.js';
import { config, ensureDirectories, validateConfig } from './config.js';
import { logger } from './utils/logger.js';

/**
 * 完整工作流
 */
async function runCompleteWorkflow() {
  logger.info('=== X Content Scout - Complete Workflow ===');
  logger.info(`Account: @${config.xAccount.handle}`);
  logger.info(`Time: ${new Date().toISOString()}`);

  // 验证配置
  try {
    validateConfig();
  } catch (error) {
    logger.error('Configuration validation failed:', error);
    logger.info('Please check your .env file and ensure all required variables are set');
    process.exit(1);
  }

  // 确保目录存在
  ensureDirectories();

  // 初始化组件
  const db = new DatabaseManager(config.dbPath);
  const embeddingClient = new EmbeddingClient(
    config.embedding.apiKey,
    config.embedding.baseURL,
    config.embedding.model
  );
  const deepseekClient = new DeepSeekClient(config.deepseek.apiKey, config.deepseek.baseURL);
  const aggregator = new ContentAggregator(db);
  const profileManager = new ProfileManager(
    db,
    config.embedding.apiKey,
    config.xAccount.handle,
    config.deepseek.apiKey,
    config.deepseek.baseURL,
    config.embedding.baseURL,
    config.embedding.model
  );
  const filterEngine = new FilterEngine(embeddingClient, deepseekClient, db);
  const draftGenerator = new DraftGenerator(deepseekClient);
  const feishuClient = new FeishuClient(db);

  try {
    // Phase 2: 内容聚合
    logger.info('\n=== Phase 2: Content Aggregation ===');
    const aggregationResults = await aggregator.aggregateAll();

    // 计算总计
    const totalCollected = aggregationResults.reduce((sum, stat) => sum + stat.itemsCollected, 0);
    const totalSaved = aggregationResults.reduce((sum, stat) => sum + stat.itemsSaved, 0);
    const totalDuration = aggregationResults.reduce((sum, stat) => sum + stat.duration, 0);

    logger.info('Aggregation Summary:');
    logger.info(`  Total collected: ${totalCollected}`);
    logger.info(`  Total saved: ${totalSaved}`);
    logger.info(`  Duration: ${totalDuration}ms`);

    if (totalSaved === 0) {
      logger.warn('No new content collected. Continuing with recent database content.');
    }

    // Phase 3: 账号画像
    logger.info('\n=== Phase 3: Account Profile ===');
    let profile = await profileManager.getProfile();

    if (!profile) {
      logger.info('Profile not found, initializing from data...');
      profile = await profileManager.initializeProfile();
    }

    logger.info(`Profile loaded: @${profile.accountHandle}`);
    logger.info(`  Topics: ${profile.topics.join(', ')}`);
    logger.info(`  Writing style: ${profile.writingStyle.tone}, avg ${profile.writingStyle.avgLength} chars`);

    // Phase 4: 智能过滤
    logger.info('\n=== Phase 4: Smart Filtering ===');
    const filterResult = await filterEngine.filter(profile, {
      topK: 20,
      finalCount: 5,
      minAiScore: 7.0,
    });

    logger.info('Filter Summary:');
    logger.info(`  Pipeline: ${filterResult.stats.totalInput} → ${filterResult.stats.afterEmbedding} → ${filterResult.stats.afterAI} → ${filterResult.stats.finalOutput}`);
    logger.info(`  Duration: embedding=${filterResult.stats.embeddingDuration}ms, ai=${filterResult.stats.aiDuration}ms`);

    if (filterResult.contents.length === 0) {
      logger.warn('No content passed filtering. Try lowering minAiScore or check content quality.');
      return;
    }

    // Phase 5: 草稿生成
    logger.info('\n=== Phase 5: Draft Generation ===');
    const draftResults = await draftGenerator.generateBatch(filterResult.contents, profile);

    logger.info(`Generated drafts for ${draftResults.length} contents`);
    draftResults.forEach((result, index) => {
      logger.info(`  Content #${index + 1}: ${result.drafts.length} drafts`);
    });

    // Phase 6: 飞书推送
    logger.info('\n=== Phase 6: Feishu Push ===');

    const defaultReceiverId = config.lark.defaultReceiverId;
    if (!defaultReceiverId) {
      logger.warn('FEISHU_DEFAULT_RECEIVER_ID not set, skipping push');
      logger.info('Drafts generated successfully but not pushed to Feishu');
      logger.info('To enable push, set FEISHU_DEFAULT_RECEIVER_ID in .env file');

      // 打印草稿预览
      logger.info('\n=== Draft Preview ===');
      draftResults.forEach((result, index) => {
        const content = filterResult.contents[index];
        logger.info(`\nContent #${index + 1}: ${content.content.title}`);
        result.drafts.forEach((draft, draftIndex) => {
          logger.info(`  Draft ${draftIndex + 1} (${draft.style}):`);
          logger.info(`    ${draft.content}`);
          logger.info(`    Reasoning: ${draft.reasoning}`);
        });
      });
    } else {
      await feishuClient.initialize(defaultReceiverId);

      // 准备推荐数据
      const recommendations = filterResult.contents.map((content, index) => ({
        content,
        drafts: draftResults[index]?.drafts || [],
      }));

      // 推送
      const pushResults = await feishuClient.pushRecommendations(recommendations);

      // 统计结果
      const successCount = pushResults.filter(r => r.success).length;
      logger.info(`Push completed: ${successCount}/${pushResults.length} succeeded`);

      // 获取推荐统计
      const stats = feishuClient.getRecommendationStats();
      logger.info('\nRecommendation Stats:');
      logger.info(`  Pending: ${stats.pending}`);
      logger.info(`  Approved: ${stats.approved}`);
      logger.info(`  Rejected: ${stats.rejected}`);
    }

    logger.info('\n=== Workflow Completed Successfully ===');
    logger.info(`Total time: ${Date.now() - startTime}ms`);

  } catch (error) {
    logger.error('Workflow failed:', error);
    throw error;
  } finally {
    db.close();
  }
}

// 记录开始时间
const startTime = Date.now();

// 运行工作流
runCompleteWorkflow().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
