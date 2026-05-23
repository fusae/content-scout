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
import { UserRuntimeConfig } from '../types/runtime-config.js';
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

export class RuntimeTaskRunner {
  constructor(private db: DatabaseManager) {}

  async runDaily(configForUser: UserRuntimeConfig): Promise<RuntimeTaskResult> {
    const runLogId = this.db.insertRuntimeRunLog({
      user_id: configForUser.userId,
      job_type: 'daily_run',
      status: 'running',
      message: 'Daily run started',
    });

    try {
      const result = await this.executeDaily(configForUser);
      this.db.finishRuntimeRunLog(runLogId, 'succeeded', {
        message: 'Daily run completed',
        statsJson: JSON.stringify(result),
      });
      return result;
    } catch (error) {
      this.db.finishRuntimeRunLog(runLogId, 'failed', {
        message: 'Daily run failed',
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

  private async executeDaily(configForUser: UserRuntimeConfig): Promise<RuntimeTaskResult> {
    logger.info(`Runtime daily run started: ${configForUser.userId}`);

    const embeddingClient = new EmbeddingClient(
      config.embedding.apiKey,
      config.embedding.baseURL,
      config.embedding.model
    );
    const deepseekClient = new DeepSeekClient(config.deepseek.apiKey, config.deepseek.baseURL);
    const aggregator = new ContentAggregator(this.db, configForUser);
    const profileManager = new ProfileManager(
      this.db,
      config.embedding.apiKey,
      configForUser.accountHandle,
      config.deepseek.apiKey,
      config.deepseek.baseURL,
      config.embedding.baseURL,
      config.embedding.model,
      configForUser.profilePath
    );
    const filterEngine = new FilterEngine(embeddingClient, deepseekClient, this.db);
    const draftClient = config.grokBridge.url
      ? new GrokBridgeClient(
        config.grokBridge.url,
        config.grokBridge.token,
        config.grokBridge.timeoutMs
      )
      : deepseekClient;
    const draftGenerator = new DraftGenerator(
      draftClient,
      config.grokBridge.url ? 'grok-bridge' : 'deepseek-chat'
    );

    const aggregation = await aggregator.aggregateAll();
    let profile = await profileManager.getProfile();
    if (!profile) {
      profile = await profileManager.initializeProfile();
    }

    const filterResult = await filterEngine.filter(profile, {
      topK: 20,
      finalCount: 5,
      minAiScore: 7.0,
    });

    if (filterResult.contents.length === 0) {
      return {
        aggregation: this.formatAggregationStats(aggregation),
        recommendations: 0,
        pushed: 0,
      };
    }

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

    if (!this.canPushToFeishu(configForUser)) {
      logger.warn(`Feishu config incomplete, skip push: ${configForUser.userId}`);
      return {
        aggregation: this.formatAggregationStats(aggregation),
        recommendations: recommendations.length,
        pushed: 0,
      };
    }

    const feishuClient = this.createFeishuClient(configForUser);
    await feishuClient.initialize(configForUser.lark.defaultReceiverId, {
      listenForActions: false,
    });
    const pushResults = await feishuClient.pushRecommendations(recommendations);
    feishuClient.close();

    return {
      aggregation: this.formatAggregationStats(aggregation),
      recommendations: recommendations.length,
      pushed: pushResults.filter((result) => result.success).length,
    };
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

  private formatAggregationStats(stats: Awaited<ReturnType<ContentAggregator['aggregateAll']>>): RuntimeTaskResult['aggregation'] {
    return stats.map((stat) => ({
      source: stat.source,
      itemsCollected: stat.itemsCollected,
      itemsSaved: stat.itemsSaved,
      errors: stat.errors,
    }));
  }
}
