import { config } from '../config.js';
import { Recommendation, ContentPool } from '../db/index.js';

interface CreateTaskResponse {
  id: string;
  status: string;
}

export class TuringClient {
  async createArticleTask(
    recommendation: Recommendation,
    content: ContentPool
  ): Promise<CreateTaskResponse> {
    if (!config.turing.baseUrl) {
      throw new Error('TURING_BASE_URL is not configured');
    }

    if (!config.turing.apiToken) {
      throw new Error('TURING_API_TOKEN is not configured');
    }

    if (!config.turing.articleCwd) {
      throw new Error('TURING_ARTICLE_CWD is not configured');
    }

    const drafts = recommendation.drafts ? JSON.parse(recommendation.drafts) : [];
    const response = await fetch(`${config.turing.baseUrl.replace(/\/$/, '')}/api/tasks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.turing.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent: { adapter: config.turing.articleAgent },
        prompt: '基于这条推荐，执行现有写文工作流并产出一篇中文文章。',
        cwd: config.turing.articleCwd,
        context: {
          rules: config.turing.articleRules,
          text: this.buildArticleContext(recommendation, content, drafts),
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Turing request failed (${response.status}): ${body}`);
    }

    return (await response.json()) as CreateTaskResponse;
  }

  private buildArticleContext(
    recommendation: Recommendation,
    content: ContentPool,
    drafts: unknown[]
  ): string {
    return [
      `标题：${content.title || '无标题'}`,
      `来源：${content.source}`,
      `作者：${content.author || '未知'}`,
      `原文链接：${content.url || '无'}`,
      `推荐理由：${recommendation.match_reason || '无'}`,
      '',
      '原始内容：',
      content.content,
      '',
      '可参考的短帖草稿：',
      JSON.stringify(drafts, null, 2),
    ].join('\n');
  }
}
