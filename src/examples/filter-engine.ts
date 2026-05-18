/**
 * 过滤引擎使用示例
 * 展示如何集成和使用智能过滤引擎
 */

import { FilterEngine } from '../filter/index.js';
import { EmbeddingClient } from '../ai/embedding.js';
import { DeepSeekClient } from '../ai/deepseek.js';
import { DatabaseManager } from '../db/index.js';
import { ProfileManager } from '../profile/index.js';
import { FilteredContent } from '../filter/types.js';

const accountHandle = process.env.ACCOUNT_HANDLE || process.env.X_ACCOUNT_HANDLE || 'example_creator';

/**
 * 示例 1: 基本使用
 */
async function example1_basicUsage() {
  console.log('=== Example 1: Basic Usage ===\n');

  // 1. 初始化客户端
  const embeddingClient = new EmbeddingClient(process.env.OPENAI_API_KEY!);
  const deepseekClient = new DeepSeekClient(process.env.DEEPSEEK_API_KEY!);
  const db = new DatabaseManager('./data/scout.db');

  // 2. 创建过滤引擎
  const filterEngine = new FilterEngine(embeddingClient, deepseekClient, db);

  // 3. 获取账号画像
  const profileManager = new ProfileManager(
    db,
    process.env.OPENAI_API_KEY!,
    accountHandle
  );
  const profile = await profileManager.getProfile();

  if (!profile) {
    console.log('Profile not found. Please initialize first.');
    return;
  }

  // 4. 执行过滤
  const { contents, stats } = await filterEngine.filter(profile);

  // 5. 显示结果
  console.log(`筛选完成: ${stats.finalOutput} 条推荐`);
  console.log(`耗时: ${stats.totalDuration}ms\n`);

  contents.forEach((item: FilteredContent, index: number) => {
    console.log(`${index + 1}. ${item.content.title}`);
    console.log(`   分数: ${item.aiScore?.toFixed(1)}/10`);
    console.log(`   原因: ${item.aiReason}\n`);
  });

  db.close();
}

/**
 * 示例 2: 自定义选项
 */
async function example2_customOptions() {
  console.log('=== Example 2: Custom Options ===\n');

  const embeddingClient = new EmbeddingClient(process.env.OPENAI_API_KEY!);
  const deepseekClient = new DeepSeekClient(process.env.DEEPSEEK_API_KEY!);
  const db = new DatabaseManager('./data/scout.db');
  const filterEngine = new FilterEngine(embeddingClient, deepseekClient, db);

  const profileManager = new ProfileManager(
    db,
    process.env.OPENAI_API_KEY!,
    accountHandle
  );
  const profile = await profileManager.getProfile();

  if (!profile) {
    console.log('Profile not found.');
    return;
  }

  // 自定义过滤选项
  const { contents, stats } = await filterEngine.filter(profile, {
    topK: 30,              // 初筛保留 30 条
    finalCount: 10,        // 最终返回 10 条
    minAiScore: 6.5,       // 降低分数阈值
    enableTimeBoost: true, // 启用时效性加权
    enableDiversity: true, // 启用多样性控制
    maxPerSource: 3,       // 每个来源最多 3 条
    blacklist: ['广告', '推广', '营销'], // 黑名单
  });

  console.log(`筛选完成: ${stats.finalOutput} 条推荐`);
  console.log(`Pipeline: ${stats.totalInput} → ${stats.afterEmbedding} → ${stats.afterAI} → ${stats.finalOutput}`);

  // 按来源统计
  const sourceCount = new Map<string, number>();
  contents.forEach((item: FilteredContent) => {
    const source = item.content.source;
    sourceCount.set(source, (sourceCount.get(source) || 0) + 1);
  });

  console.log('\n来源分布:');
  sourceCount.forEach((count, source) => {
    console.log(`  ${source}: ${count} 条`);
  });

  db.close();
}

/**
 * 示例 3: 保存推荐到数据库
 */
async function example3_saveRecommendations() {
  console.log('=== Example 3: Save Recommendations ===\n');

  const embeddingClient = new EmbeddingClient(process.env.OPENAI_API_KEY!);
  const deepseekClient = new DeepSeekClient(process.env.DEEPSEEK_API_KEY!);
  const db = new DatabaseManager('./data/scout.db');
  const filterEngine = new FilterEngine(embeddingClient, deepseekClient, db);

  const profileManager = new ProfileManager(
    db,
    process.env.OPENAI_API_KEY!,
    accountHandle
  );
  const profile = await profileManager.getProfile();

  if (!profile) {
    console.log('Profile not found.');
    return;
  }

  // 执行过滤
  const { contents } = await filterEngine.filter(profile);

  // 保存推荐到数据库
  console.log(`保存 ${contents.length} 条推荐到数据库...\n`);

  for (const item of contents) {
    const recId = db.insertRecommendation({
      content_id: item.contentId,
      match_score: item.aiScore || item.embeddingSimilarity * 10,
      match_reason: item.aiReason || `Similarity: ${item.embeddingSimilarity.toFixed(3)}`,
      status: 'pending',
    });

    console.log(`✓ 推荐 ${recId}: ${item.content.title?.slice(0, 50)}...`);
  }

  // 查询待处理的推荐
  const pending = db.getRecommendationsByStatus('pending');
  console.log(`\n当前待处理推荐: ${pending.length} 条`);

  db.close();
}

/**
 * 示例 4: 处理不同场景
 */
async function example4_scenarios() {
  console.log('=== Example 4: Different Scenarios ===\n');

  const embeddingClient = new EmbeddingClient(process.env.OPENAI_API_KEY!);
  const deepseekClient = new DeepSeekClient(process.env.DEEPSEEK_API_KEY!);
  const db = new DatabaseManager('./data/scout.db');
  const filterEngine = new FilterEngine(embeddingClient, deepseekClient, db);

  const profileManager = new ProfileManager(
    db,
    process.env.OPENAI_API_KEY!,
    accountHandle
  );
  const profile = await profileManager.getProfile();

  if (!profile) {
    console.log('Profile not found.');
    return;
  }

  // 场景 1: 只要最新的内容
  console.log('场景 1: 只要最新的内容');
  const { contents: fresh } = await filterEngine.filter(profile, {
    enableTimeBoost: true,
    finalCount: 3,
  });
  console.log(`  结果: ${fresh.length} 条\n`);

  // 场景 2: 追求多样性
  console.log('场景 2: 追求多样性');
  const { contents: diverse } = await filterEngine.filter(profile, {
    enableDiversity: true,
    maxPerSource: 1, // 每个来源只要 1 条
    finalCount: 7,
  });
  console.log(`  结果: ${diverse.length} 条`);
  const sources = new Set(diverse.map((c: FilteredContent) => c.content.source));
  console.log(`  来源数: ${sources.size}\n`);

  // 场景 3: 高质量优先
  console.log('场景 3: 高质量优先');
  const { contents: quality } = await filterEngine.filter(profile, {
    minAiScore: 8.0, // 高分数阈值
    enableTimeBoost: false, // 不考虑时效性
    finalCount: 5,
  });
  console.log(`  结果: ${quality.length} 条`);
  if (quality.length > 0) {
    const avgScore = quality.reduce((sum: number, c: FilteredContent) => sum + (c.aiScore || 0), 0) / quality.length;
    console.log(`  平均分: ${avgScore.toFixed(1)}/10\n`);
  }

  db.close();
}

/**
 * 示例 5: 错误处理
 */
async function example5_errorHandling() {
  console.log('=== Example 5: Error Handling ===\n');

  const embeddingClient = new EmbeddingClient(process.env.OPENAI_API_KEY!);
  const deepseekClient = new DeepSeekClient(process.env.DEEPSEEK_API_KEY!);
  const db = new DatabaseManager('./data/scout.db');
  const filterEngine = new FilterEngine(embeddingClient, deepseekClient, db);

  const profileManager = new ProfileManager(
    db,
    process.env.OPENAI_API_KEY!,
    accountHandle
  );

  try {
    const profile = await profileManager.getProfile();

    if (!profile) {
      throw new Error('Profile not found');
    }

    if (!profile.interestVector || profile.interestVector.length === 0) {
      throw new Error('Profile vector is missing');
    }

    const { contents, stats } = await filterEngine.filter(profile);

    if (contents.length === 0) {
      console.log('⚠️  没有找到合适的推荐内容');
      console.log('   可能原因:');
      console.log('   1. 内容池为空（运行 npm run test:aggregator）');
      console.log('   2. 分数阈值过高（尝试降低 minAiScore）');
      console.log('   3. 黑名单过滤太严格');
    } else {
      console.log(`✓ 成功生成 ${contents.length} 条推荐`);
      console.log(`  耗时: ${stats.totalDuration}ms`);
    }
  } catch (error) {
    console.error('❌ 过滤失败:', error);
    console.log('\n故障排查:');
    console.log('1. 检查 API keys 是否正确');
    console.log('2. 检查数据库是否初始化');
    console.log('3. 检查账号画像是否存在');
    console.log('4. 检查网络连接');
  } finally {
    db.close();
  }
}

// 运行示例
if (import.meta.url === `file://${process.argv[1]}`) {
  const exampleNum = process.argv[2] || '1';

  switch (exampleNum) {
    case '1':
      example1_basicUsage();
      break;
    case '2':
      example2_customOptions();
      break;
    case '3':
      example3_saveRecommendations();
      break;
    case '4':
      example4_scenarios();
      break;
    case '5':
      example5_errorHandling();
      break;
    default:
      console.log('Usage: tsx src/examples/filter-engine.ts [1-5]');
      console.log('  1: Basic Usage');
      console.log('  2: Custom Options');
      console.log('  3: Save Recommendations');
      console.log('  4: Different Scenarios');
      console.log('  5: Error Handling');
  }
}

export {
  example1_basicUsage,
  example2_customOptions,
  example3_saveRecommendations,
  example4_scenarios,
  example5_errorHandling,
};
