import { ContentAggregator } from '../aggregator/index.js';
import { DatabaseManager } from '../db/index.js';
import { EmbeddingClient } from '../ai/embedding.js';
import { DeepSeekClient } from '../ai/deepseek.js';
import { GrokBridgeClient } from '../ai/grok-bridge.js';
import { FeishuClient } from '../feishu/index.js';
import { FilterEngine } from '../filter/index.js';
import { DraftGenerator } from '../generator/index.js';
import { ProfileManager } from '../profile/index.js';
import { config } from '../config.js';
import { sourceNames, UserRuntimeConfig } from '../types/runtime-config.js';
import { logger } from '../utils/logger.js';

export interface RuntimeTaskResult {
  aggregation: Array<{
    source: string;
    itemsCollected: number;
    itemsSaved: number;
    errors: number;
  }>;
  recommendations: number;
  pushed: number;
}

interface RuntimeTaskStage {
  at: string;
  phase: string;
  status: 'running' | 'succeeded' | 'failed' | 'skipped';
  message: string;
  data?: Record<string, unknown>;
}

interface RuntimeTaskProgress {
  stages: RuntimeTaskStage[];
  aggregation: RuntimeTaskResult['aggregation'];
  filtering?: {
    selected: number;
    finalCount: number;
    minAiScore: number;
  };
  drafts?: {
    contents: number;
    batches: number;
    validRecommendations: number;
    drafts: number;
  };
  push?: {
    attempted: number;
    succeeded: number;
    failed: number;
    skipped?: boolean;
  };
  result?: RuntimeTaskResult;
}

export class RuntimeTaskRunner {
  constructor(private db: DatabaseManager) {}

  async runDaily(configForUser: UserRuntimeConfig): Promise<RuntimeTaskResult> {
    const progress: RuntimeTaskProgress = {
      stages: [],
      aggregation: [],
    };
    const runLogId = this.db.insertRuntimeRunLog({
      user_id: configForUser.userId,
      job_type: 'daily_run',
      status: 'running',
      message: '准备运行',
      stats_json: JSON.stringify(progress),
    });
    this.logStage(runLogId, progress, '准备', 'running', '初始化运行环境');

    try {
      const result = await this.executeDaily(configForUser, runLogId, progress);
      progress.result = result;
      this.logStage(runLogId, progress, '完成', 'succeeded', '本次运行完成', {
        recommendations: result.recommendations,
        pushed: result.pushed,
      });
      this.db.finishRuntimeRunLog(runLogId, 'succeeded', {
        message: '运行完成',
        statsJson: JSON.stringify(progress),
      });
      return result;
    } catch (error) {
      this.logStage(runLogId, progress, '失败', 'failed', (error as Error).message);
      this.db.finishRuntimeRunLog(runLogId, 'failed', {
        message: '运行失败',
        statsJson: JSON.stringify(progress),
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async sendTestPush(configForUser: UserRuntimeConfig): Promise<void> {
    const runLogId = this.db.insertRuntimeRunLog({
      user_id: configForUser.userId,
      job_type: 'test_push',
      status: 'running',
      message: 'Test push started',
    });

    try {
      const feishuClient = this.createFeishuClient(configForUser);
      await feishuClient.initialize(configForUser.lark.defaultReceiverId, {
        listenForActions: false,
      });
      await feishuClient.sendText('X Content Scout 测试推送成功');
      feishuClient.close();

      this.db.finishRuntimeRunLog(runLogId, 'succeeded', {
        message: 'Test push completed',
      });
    } catch (error) {
      this.db.finishRuntimeRunLog(runLogId, 'failed', {
        message: 'Test push failed',
        error: (error as Error).message,
      });
      throw error;
    }
  }

  private async executeDaily(
    configForUser: UserRuntimeConfig,
    runLogId: number,
    progress: RuntimeTaskProgress
  ): Promise<RuntimeTaskResult> {
    logger.info(`Runtime daily run started: ${configForUser.userId}`);

    this.logStage(runLogId, progress, '初始化', 'running', '创建模型、爬虫、筛选器和推送客户端');
    const aiConfig = this.resolveAiConfig(configForUser);
    const embeddingClient = new EmbeddingClient(
      aiConfig.embedding.apiKey,
      aiConfig.embedding.baseURL,
      aiConfig.embedding.model
    );
    const deepseekClient = new DeepSeekClient(aiConfig.deepseek.apiKey, aiConfig.deepseek.baseURL);
    const profileManager = new ProfileManager(
      this.db,
      aiConfig.embedding.apiKey,
      configForUser.accountHandle,
      aiConfig.deepseek.apiKey,
      aiConfig.deepseek.baseURL,
      aiConfig.embedding.baseURL,
      aiConfig.embedding.model,
      configForUser.profilePath
    );
    const filterEngine = new FilterEngine(embeddingClient, deepseekClient, this.db);
    const draftClient = aiConfig.grokBridge.url
      ? new GrokBridgeClient(
        aiConfig.grokBridge.url,
        aiConfig.grokBridge.token,
        aiConfig.grokBridge.timeoutMs
      )
      : deepseekClient;
    const draftGenerator = new DraftGenerator(
      draftClient,
      aiConfig.grokBridge.url ? 'grok-bridge' : 'deepseek-chat'
    );

    this.logStage(runLogId, progress, '抓取', 'running', '开始抓取所有已启用平台', {
      sources: sourceNames.filter((source) => configForUser.sources[source].enabled),
    });
    const aggregator = new ContentAggregator(this.db, configForUser, (event) => {
      const stat = {
        source: event.stats.source,
        itemsCollected: event.stats.itemsCollected,
        itemsSaved: event.stats.itemsSaved,
        errors: event.stats.errors,
      };
      progress.aggregation = [
        ...progress.aggregation.filter((item) => item.source !== stat.source),
        stat,
      ];
      this.logStage(runLogId, progress, '抓取', event.stats.errors ? 'failed' : 'succeeded', `${event.source} 抓取完成`, {
        collected: event.stats.itemsCollected,
        duplicates: event.stats.itemsDeduped,
        saved: event.stats.itemsSaved,
        errors: event.stats.errors,
        durationMs: event.stats.duration,
      });
    });
    const aggregation = await aggregator.aggregateAll();
    progress.aggregation = this.formatAggregationStats(aggregation);
    const totalCollected = aggregation.reduce((sum, stat) => sum + stat.itemsCollected, 0);
    const totalDeduped = aggregation.reduce((sum, stat) => sum + stat.itemsDeduped, 0);
    const totalSaved = aggregation.reduce((sum, stat) => sum + stat.itemsSaved, 0);
    this.logStage(runLogId, progress, '清洗合并', 'succeeded', '平台内容已去重并入库', {
      collected: totalCollected,
      duplicates: totalDeduped,
      saved: totalSaved,
    });

    this.logStage(runLogId, progress, '画像', 'running', '读取或初始化账号画像');
    let profile = await profileManager.getProfile();
    if (!profile) {
      profile = await profileManager.initializeProfile();
    }

    this.logStage(runLogId, progress, '筛选', 'running', '开始向量匹配和 AI 排序', {
      topK: 20,
      finalCount: 5,
      minAiScore: 7.0,
    });
    const filterResult = await filterEngine.filter(profile, {
      topK: 20,
      finalCount: 5,
      minAiScore: 7.0,
    });
    progress.filtering = {
      selected: filterResult.contents.length,
      finalCount: 5,
      minAiScore: 7.0,
    };
    this.logStage(runLogId, progress, '筛选', 'succeeded', `筛选出 ${filterResult.contents.length} 条推荐候选`, {
      selected: filterResult.contents.length,
    });

    if (filterResult.contents.length === 0) {
      this.logStage(runLogId, progress, '生成草稿', 'skipped', '没有候选内容，跳过草稿生成');
      return {
        aggregation: this.formatAggregationStats(aggregation),
        recommendations: 0,
        pushed: 0,
      };
    }

    this.logStage(runLogId, progress, '生成草稿', 'running', `开始为 ${filterResult.contents.length} 条内容生成草稿`);
    const draftResults = await draftGenerator.generateBatch(filterResult.contents, profile);
    const contentById = new Map(
      filterResult.contents.map((content) => [content.contentId, content])
    );
    const recommendations = draftResults
      .map((draftResult) => {
        const content = contentById.get(draftResult.contentId);
        if (!content || draftResult.drafts.length === 0) {
          return null;
        }

        return {
          content,
          drafts: draftResult.drafts,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    progress.drafts = {
      contents: filterResult.contents.length,
      batches: draftResults.length,
      validRecommendations: recommendations.length,
      drafts: draftResults.reduce((sum, result) => sum + result.drafts.length, 0),
    };
    this.logStage(runLogId, progress, '生成草稿', 'succeeded', `生成 ${progress.drafts.drafts} 条草稿，形成 ${recommendations.length} 条推荐`, progress.drafts);

    if (!this.canPushToFeishu(configForUser)) {
      logger.warn(`Feishu config incomplete, skip push: ${configForUser.userId}`);
      progress.push = {
        attempted: recommendations.length,
        succeeded: 0,
        failed: 0,
        skipped: true,
      };
      this.logStage(runLogId, progress, '推送', 'skipped', '飞书配置不完整，跳过推送');
      return {
        aggregation: this.formatAggregationStats(aggregation),
        recommendations: recommendations.length,
        pushed: 0,
      };
    }

    this.logStage(runLogId, progress, '推送', 'running', `开始推送 ${recommendations.length} 条推荐到飞书`);
    const feishuClient = this.createFeishuClient(configForUser);
    await feishuClient.initialize(configForUser.lark.defaultReceiverId, {
      listenForActions: false,
    });
    const pushResults = await feishuClient.pushRecommendations(recommendations);
    feishuClient.close();
    const pushed = pushResults.filter((result) => result.success).length;
    progress.push = {
      attempted: recommendations.length,
      succeeded: pushed,
      failed: pushResults.length - pushed,
    };
    this.logStage(runLogId, progress, '推送', progress.push.failed > 0 ? 'failed' : 'succeeded', `飞书推送成功 ${pushed}/${recommendations.length}`, progress.push);

    return {
      aggregation: this.formatAggregationStats(aggregation),
      recommendations: recommendations.length,
      pushed,
    };
  }

  private logStage(
    runLogId: number,
    progress: RuntimeTaskProgress,
    phase: string,
    status: RuntimeTaskStage['status'],
    message: string,
    data?: Record<string, unknown>
  ): void {
    progress.stages.push({
      at: new Date().toISOString(),
      phase,
      status,
      message,
      data,
    });
    this.db.updateRuntimeRunLog(runLogId, {
      message,
      statsJson: JSON.stringify(progress),
    });
  }

  private canPushToFeishu(configForUser: UserRuntimeConfig): boolean {
    return Boolean(
      configForUser.lark.appId &&
      configForUser.lark.appSecret &&
      configForUser.lark.defaultReceiverId
    );
  }

  private createFeishuClient(configForUser: UserRuntimeConfig): FeishuClient {
    return new FeishuClient(this.db, {
      appId: configForUser.lark.appId,
      appSecret: configForUser.lark.appSecret,
    });
  }

  private resolveAiConfig(configForUser: UserRuntimeConfig): UserRuntimeConfig['ai'] {
    const allowEnvFallback = configForUser.userId === (process.env.USER_ID || 'local');
    const fallback = allowEnvFallback
      ? {
        embedding: config.embedding,
        deepseek: config.deepseek,
        grokBridge: config.grokBridge,
      }
      : {
        embedding: { apiKey: '', baseURL: '', model: '' },
        deepseek: { apiKey: '', baseURL: '' },
        grokBridge: { url: '', token: '', timeoutMs: 180000 },
      };

    return {
      embedding: {
        apiKey: configForUser.ai.embedding.apiKey || fallback.embedding.apiKey,
        baseURL: configForUser.ai.embedding.baseURL || fallback.embedding.baseURL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        model: configForUser.ai.embedding.model || fallback.embedding.model || 'text-embedding-v4',
      },
      deepseek: {
        apiKey: configForUser.ai.deepseek.apiKey || fallback.deepseek.apiKey,
        baseURL: configForUser.ai.deepseek.baseURL || fallback.deepseek.baseURL || 'https://api.deepseek.com',
      },
      grokBridge: {
        url: configForUser.ai.grokBridge.url || fallback.grokBridge.url || '',
        token: configForUser.ai.grokBridge.token || fallback.grokBridge.token || '',
        timeoutMs: configForUser.ai.grokBridge.timeoutMs || fallback.grokBridge.timeoutMs || 180000,
      },
    };
  }

  private formatAggregationStats(stats: Awaited<ReturnType<ContentAggregator['aggregateAll']>>): RuntimeTaskResult['aggregation'] {
    return stats.map((stat) => ({
      source: stat.source,
      itemsCollected: stat.itemsCollected,
      itemsSaved: stat.itemsSaved,
      errors: stat.errors,
    }));
  }
}
