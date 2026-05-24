import { createServer, IncomingMessage, ServerResponse } from 'http';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { URL } from 'url';
import { config, ensureDirectories, localRuntimeConfig } from '../config.js';
import { DatabaseManager } from '../db/index.js';
import type { InitialProfileData, SampleTweet } from '../profile/types.js';
import { RuntimeConfigRepository } from '../runtime/config-repository.js';
import { RuntimeJobQueue } from '../runtime/job-queue.js';
import { MultiUserScheduler } from '../runtime/multi-user-scheduler.js';
import { RuntimeTaskRunner } from '../runtime/task-runner.js';
import { RuntimeWorker } from '../runtime/worker.js';
import { sourceNames, UserRuntimeConfig } from '../types/runtime-config.js';
import { logger } from '../utils/logger.js';
import { CookieHelper, isCookiePlatform } from './cookie-helper.js';

type JsonBody = Record<string, unknown>;
type ProfileFormData = {
  bio?: unknown;
  topics?: unknown;
  interests?: unknown;
  style?: unknown;
  audience?: unknown;
  samplePosts?: unknown;
};

class AdminServer {
  private scheduler: MultiUserScheduler;
  private worker: RuntimeWorker;
  private cookieHelper: CookieHelper;
  private adminToken = process.env.ADMIN_TOKEN || '';

  constructor(
    private db: DatabaseManager,
    private repository: RuntimeConfigRepository,
    private queue: RuntimeJobQueue
  ) {
    const runner = new RuntimeTaskRunner(db);
    this.scheduler = new MultiUserScheduler(db, repository, queue);
    this.worker = new RuntimeWorker(queue, repository, runner);
    this.cookieHelper = new CookieHelper();
  }

  start(port: number, host: string): void {
    if (!this.isLoopbackHost(host) && !this.adminToken) {
      throw new Error('ADMIN_TOKEN is required when ADMIN_HOST is not a loopback address');
    }

    this.scheduler.reload();
    this.worker.start();

    const server = createServer((req, res) => {
      void this.handle(req, res);
    });

    server.listen(port, host, () => {
      logger.info(`Admin server listening on http://${host}:${port}`);
    });

    const shutdown = (): void => {
      this.scheduler.stop();
      this.worker.stop();
      this.db.close();
      server.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', 'http://localhost');
    const method = req.method || 'GET';

    try {
      if (!this.isAuthorized(req, url)) {
        this.unauthorized(res);
        return;
      }

      if (method === 'GET' && url.pathname === '/') {
        this.html(res, this.renderDashboard());
        return;
      }

      if (method === 'GET' && url.pathname === '/api/users') {
        this.json(res, this.listUsers());
        return;
      }

      const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
      if (userMatch && method === 'GET') {
        this.json(res, this.getUser(userMatch[1]));
        return;
      }

      if (userMatch && method === 'POST') {
        const body = await this.readJson(req);
        const saved = body.mode === 'create'
          ? this.createUser(userMatch[1])
          : this.saveUser(userMatch[1], body);
        this.scheduler.reload();
        this.json(res, saved);
        return;
      }

      if (userMatch && method === 'PUT') {
        const body = await this.readJson(req);
        const saved = this.saveUser(userMatch[1], body);
        this.scheduler.reload();
        this.json(res, saved);
        return;
      }

      if (userMatch && method === 'DELETE') {
        this.deleteUser(userMatch[1]);
        this.scheduler.reload();
        this.json(res, { ok: true });
        return;
      }

      const credentialMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/credentials\/([^/]+)$/);
      if (credentialMatch && method === 'POST') {
        const body = await this.readJson(req);
        const saved = this.saveCredential(credentialMatch[1], credentialMatch[2], body);
        this.json(res, this.publicConfig(saved));
        return;
      }

      if (credentialMatch && method === 'DELETE') {
        this.db.deleteRuntimeCredential(credentialMatch[1], `${credentialMatch[2]}_cookie`);
        this.json(res, { ok: true });
        return;
      }

      const loginMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/login\/([^/]+)$/);
      if (loginMatch && method === 'POST') {
        const userId = loginMatch[1];
        const platform = loginMatch[2];

        if (!isCookiePlatform(platform)) {
          this.json(res, { error: `Unsupported local login platform: ${platform}` }, 400);
          return;
        }

        try {
          const cookies = await this.cookieHelper.launchLoginWindow(platform, { userId });
          const saved = this.saveCredential(userId, platform, { value: cookies });
          this.json(res, this.publicConfig(saved));
        } catch (error) {
          this.json(res, { error: (error as Error).message }, 500);
        }
        return;
      }

      const runMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/run$/);
      if (runMatch && method === 'POST') {
        const jobId = this.queue.enqueue(runMatch[1], 'daily_run');
        this.json(res, { ok: true, jobId });
        return;
      }

      const testPushMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/test-push$/);
      if (testPushMatch && method === 'POST') {
        const jobId = this.queue.enqueue(testPushMatch[1], 'test_push');
        this.json(res, { ok: true, jobId });
        return;
      }

      const profileMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/profile$/);
      if (profileMatch && method === 'PUT') {
        const body = await this.readJson(req);
        this.json(res, this.saveProfile(profileMatch[1], body));
        return;
      }

      if (profileMatch && method === 'GET') {
        this.json(res, this.getProfile(profileMatch[1]));
        return;
      }

      if (method === 'GET' && url.pathname === '/api/jobs') {
        this.json(res, this.queue.list(Number(url.searchParams.get('limit') || 50)));
        return;
      }

      if (method === 'GET' && url.pathname === '/api/runs') {
        this.json(res, this.db.listRuntimeRunLogs(
          url.searchParams.get('userId') || undefined,
          Number(url.searchParams.get('limit') || 50)
        ));
        return;
      }

      if (method === 'GET' && url.pathname === '/api/status') {
        this.json(res, {
          scheduledUserIds: this.scheduler.getScheduledUserIds(),
          jobs: this.queue.list(10),
          runs: this.db.listRuntimeRunLogs(undefined, 10),
        });
        return;
      }

      this.json(res, { error: 'Not found' }, 404);
    } catch (error) {
      logger.error('Admin request failed', error as Error);
      this.json(res, { error: (error as Error).message }, 500);
    }
  }

  private listUsers(): unknown[] {
    return this.db.listRuntimeUsers().map((user) => {
      const runtimeConfig = this.repository.get(user.user_id);
      return {
        userId: user.user_id,
        accountHandle: user.account_handle,
        schedule: runtimeConfig?.schedule,
        enabledSources: runtimeConfig
          ? this.dashboardSources().filter((source) => runtimeConfig.sources[source].enabled)
          : [],
        connections: this.connectionStatus(user.user_id),
      };
    });
  }

  private getRuntimeConfig(userId: string): UserRuntimeConfig {
    const runtimeConfig = this.repository.get(userId);
    if (runtimeConfig) {
      return this.withLocalAiFallback(userId, runtimeConfig);
    }

    return this.defaultConfig(userId);
  }

  private getUser(userId: string): unknown {
    return this.publicConfig(this.getRuntimeConfig(userId));
  }

  private saveUser(userId: string, body: JsonBody): unknown {
    const runtimeConfig = this.normalizeConfig(userId, body);
    this.repository.save(runtimeConfig);
    return this.publicConfig(runtimeConfig);
  }

  private createUser(userId: string): unknown {
    const runtimeConfig = this.blankConfig(userId);
    this.repository.save(runtimeConfig);
    return this.publicConfig(runtimeConfig);
  }

  private deleteUser(userId: string): void {
    this.db.deleteRuntimeUser(userId);
    const profilePath = resolve('./data/profiles', `${this.safeFileName(userId)}.json`);
    if (existsSync(profilePath)) {
      unlinkSync(profilePath);
    }
  }

  private saveCredential(userId: string, platform: string, body: JsonBody): UserRuntimeConfig {
    const value = typeof body.value === 'string' ? body.value : '';
    if (!value) {
      throw new Error('Credential value is required');
    }

    const runtimeConfig = this.getRuntimeConfig(userId);
    if (platform === 'zhihu') {
      runtimeConfig.sources.zhihu.cookie = value;
      runtimeConfig.sources.zhihu.enabled = true;
    } else if (platform === 'douyin') {
      runtimeConfig.sources.douyin.cookie = value;
      runtimeConfig.sources.douyin.enabled = true;
    } else if (platform === 'xiaohongshu') {
      runtimeConfig.sources.xiaohongshu.cookie = value;
      runtimeConfig.sources.xiaohongshu.enabled = true;
    } else if (platform === 'weibo') {
      runtimeConfig.sources.weibo.cookie = value;
      runtimeConfig.sources.weibo.enabled = true;
    } else {
      throw new Error(`Unsupported platform credential: ${platform}`);
    }

    this.repository.save(runtimeConfig);
    return runtimeConfig;
  }

  private getProfile(userId: string): unknown {
    const runtimeConfig = this.getRuntimeConfig(userId);
    const profilePath = this.resolveProfilePath(runtimeConfig);
    if (!existsSync(profilePath)) {
      return {
        profilePath,
        bio: '',
        topics: [],
        interests: [],
        style: '',
        audience: '',
        samplePosts: []
      };
    }

    const profile = JSON.parse(readFileSync(profilePath, 'utf8')) as InitialProfileData;
    return {
      profilePath,
      bio: profile.bio || '',
      topics: profile.topics || [],
      interests: profile.interests || [],
      style: profile.writingStyle?.tone || '',
      audience: profile.audience || '',
      samplePosts: (profile.sampleTweets || []).map((tweet) => tweet.text)
    };
  }

  private saveProfile(userId: string, body: JsonBody): unknown {
    const runtimeConfig = this.getRuntimeConfig(userId);
    const profilePath = this.resolveProfilePath(runtimeConfig);
    const existing = existsSync(profilePath)
      ? JSON.parse(readFileSync(profilePath, 'utf8')) as Partial<InitialProfileData>
      : {};
    const form = body as ProfileFormData;
    const interests = this.stringArray(form.interests);
    const topics = this.stringArray(form.topics);
    const sampleTexts = this.stringArray(form.samplePosts);
    const sampleTweets: SampleTweet[] = sampleTexts.map((text) => ({ text, likes: 0 }));

    const profile: InitialProfileData = {
      accountHandle: runtimeConfig.accountHandle || existing.accountHandle || userId,
      bio: this.stringValue(form.bio) || existing.bio || '',
      topics: topics.length > 0 ? topics : existing.topics || interests,
      writingStyle: {
        tone: this.stringValue(form.style) || existing.writingStyle?.tone || '',
        avgLength: existing.writingStyle?.avgLength || 280,
        emojiUsage: existing.writingStyle?.emojiUsage || '适中',
        commonEmojis: existing.writingStyle?.commonEmojis || [],
        structure: existing.writingStyle?.structure,
      },
      interests: interests.length > 0 ? interests : existing.interests || [],
      audience: this.stringValue(form.audience) || existing.audience || '',
      tweetCount: existing.tweetCount || sampleTweets.length,
      sampleTweets: sampleTweets.length > 0 ? sampleTweets : existing.sampleTweets || [],
    };

    mkdirSync(dirname(profilePath), { recursive: true });
    writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');

    if (!runtimeConfig.profilePath) {
      this.repository.save({ ...runtimeConfig, profilePath });
    }

    logger.info(`Profile saved for user ${userId}: ${profilePath}`);
    return this.getProfile(userId);
  }

  private normalizeConfig(userId: string, body: JsonBody): UserRuntimeConfig {
    const base = this.repository.get(userId) || this.defaultConfig(userId);
    const incoming = body as Partial<UserRuntimeConfig>;
    const sources = {
      ...base.sources,
      ...incoming.sources,
      zhihu: {
        ...base.sources.zhihu,
        ...incoming.sources?.zhihu,
      },
      douyin: {
        ...base.sources.douyin,
        ...incoming.sources?.douyin,
      },
      xiaohongshu: {
        ...base.sources.xiaohongshu,
        ...incoming.sources?.xiaohongshu,
      },
      reddit: {
        ...base.sources.reddit,
        ...incoming.sources?.reddit,
      },
      weibo: {
        ...base.sources.weibo,
        ...incoming.sources?.weibo,
      },
    };
    const lark = {
      ...base.lark,
      ...incoming.lark,
    };
    if (!incoming.lark?.appSecret) {
      lark.appSecret = base.lark.appSecret;
    }
    const ai = {
      embedding: {
        ...base.ai.embedding,
        ...incoming.ai?.embedding,
      },
      deepseek: {
        ...base.ai.deepseek,
        ...incoming.ai?.deepseek,
      },
    };
    if (!incoming.ai?.embedding?.apiKey) {
      ai.embedding.apiKey = base.ai.embedding.apiKey;
    }
    if (!incoming.ai?.deepseek?.apiKey) {
      ai.deepseek.apiKey = base.ai.deepseek.apiKey;
    }
    if (!incoming.sources?.zhihu?.cookie) {
      sources.zhihu.cookie = base.sources.zhihu.cookie;
    }
    if (!incoming.sources?.douyin?.cookie) {
      sources.douyin.cookie = base.sources.douyin.cookie;
    }
    if (!incoming.sources?.douyin?.tiktokDownloaderToken) {
      sources.douyin.tiktokDownloaderToken = base.sources.douyin.tiktokDownloaderToken;
    }
    if (!incoming.sources?.xiaohongshu?.cookie) {
      sources.xiaohongshu.cookie = base.sources.xiaohongshu.cookie;
    }
    if (!incoming.sources?.weibo?.cookie) {
      sources.weibo.cookie = base.sources.weibo.cookie;
    }

    return {
      ...base,
      ...incoming,
      userId,
      sources,
      lark,
      ai,
      schedule: {
        ...base.schedule,
        ...incoming.schedule,
      },
      rateLimit: {
        ...base.rateLimit,
        ...incoming.rateLimit,
      },
    };
  }

  private defaultConfig(userId: string): UserRuntimeConfig {
    return {
      ...JSON.parse(JSON.stringify(localRuntimeConfig)) as UserRuntimeConfig,
      userId,
    };
  }

  private withLocalAiFallback(userId: string, runtimeConfig: UserRuntimeConfig): UserRuntimeConfig {
    if (userId !== localRuntimeConfig.userId) {
      return runtimeConfig;
    }

    return {
      ...runtimeConfig,
      ai: {
        embedding: {
          apiKey: runtimeConfig.ai.embedding.apiKey || localRuntimeConfig.ai.embedding.apiKey,
          baseURL: runtimeConfig.ai.embedding.baseURL || localRuntimeConfig.ai.embedding.baseURL,
          model: runtimeConfig.ai.embedding.model || localRuntimeConfig.ai.embedding.model,
        },
        deepseek: {
          apiKey: runtimeConfig.ai.deepseek.apiKey || localRuntimeConfig.ai.deepseek.apiKey,
          baseURL: runtimeConfig.ai.deepseek.baseURL || localRuntimeConfig.ai.deepseek.baseURL,
        },
      },
    };
  }

  private blankConfig(userId: string): UserRuntimeConfig {
    const base = this.defaultConfig(userId);
    return {
      userId,
      accountHandle: userId,
      profilePath: '',
      sources: {
        x: { enabled: false },
        hackernews: { enabled: false },
        github: { enabled: false },
        zhihu: { enabled: false, keywords: [], cookie: '' },
        producthunt: { enabled: false },
        reddit: { enabled: false, subreddits: [] },
        v2ex: { enabled: false },
        douyin: {
          enabled: false,
          keywords: [],
          cookie: '',
          tiktokDownloaderApiUrl: '',
          tiktokDownloaderToken: '',
        },
        xiaohongshu: {
          enabled: false,
          keywords: [],
          cookie: '',
          adapter: 'redbook',
          cookieSource: 'chrome',
          chromeProfile: '',
        },
        weibo: { enabled: false, keywords: [], cookie: '' },
      },
      lark: {
        appId: '',
        appSecret: '',
        baseId: '',
        defaultReceiverId: '',
      },
      ai: {
        embedding: {
          apiKey: '',
          baseURL: base.ai.embedding.baseURL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          model: base.ai.embedding.model || 'text-embedding-v4',
        },
        deepseek: {
          apiKey: '',
          baseURL: base.ai.deepseek.baseURL || 'https://api.deepseek.com',
        },
      },
      schedule: base.schedule,
      rateLimit: base.rateLimit,
    };
  }

  private publicConfig(configForUser: UserRuntimeConfig): unknown {
    const clone = JSON.parse(JSON.stringify(configForUser)) as UserRuntimeConfig;
    const status = {
      larkAppSecret: Boolean(configForUser.lark.appSecret),
      zhihuCookie: Boolean(configForUser.sources.zhihu.cookie),
      douyinCookie: Boolean(configForUser.sources.douyin.cookie),
      douyinTikTokDownloaderToken: Boolean(configForUser.sources.douyin.tiktokDownloaderToken),
      xiaohongshuCookie: Boolean(configForUser.sources.xiaohongshu.cookie),
      weiboCookie: Boolean(configForUser.sources.weibo.cookie),
      embeddingApiKey: Boolean(configForUser.ai.embedding.apiKey),
      deepseekApiKey: Boolean(configForUser.ai.deepseek.apiKey),
    };

    clone.lark.appSecret = '';
    clone.ai.embedding.apiKey = '';
    clone.ai.deepseek.apiKey = '';
    clone.sources.zhihu.cookie = '';
    clone.sources.douyin.cookie = '';
    clone.sources.douyin.tiktokDownloaderToken = '';
    clone.sources.xiaohongshu.cookie = '';
    clone.sources.weibo.cookie = '';

    return {
      ...clone,
      credentialStatus: status,
    };
  }

  private resolveProfilePath(runtimeConfig: UserRuntimeConfig): string {
    if (runtimeConfig.profilePath) {
      return resolve(runtimeConfig.profilePath);
    }

    return resolve('./data/profiles', `${this.safeFileName(runtimeConfig.userId)}.json`);
  }

  private safeFileName(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_') || 'local';
  }

  private stringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    }

    if (typeof value === 'string') {
      return value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [];
  }

  private stringValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private isAuthorized(req: IncomingMessage, url: URL): boolean {
    if (!this.adminToken) {
      return true;
    }

    const rawAuthorization = req.headers.authorization;
    const authorization = typeof rawAuthorization === 'string' ? rawAuthorization : '';
    const headerToken = authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : '';
    const adminHeader = req.headers['x-admin-token'];
    const xAdminToken = typeof adminHeader === 'string'
      ? adminHeader
      : Array.isArray(adminHeader) && typeof adminHeader[0] === 'string'
      ? adminHeader[0]
      : '';
    const queryToken = url.searchParams.get('token') || '';

    return [headerToken, xAdminToken, queryToken].includes(this.adminToken);
  }

  private unauthorized(res: ServerResponse): void {
    this.json(res, { error: 'Unauthorized' }, 401);
  }

  private isLoopbackHost(host: string): boolean {
    return ['127.0.0.1', 'localhost', '::1'].includes(host);
  }

  private connectionStatus(userId: string): Record<string, boolean> {
    const keys = new Set(this.db.getRuntimeCredentials(userId).map((row) => row.credential_key));
    return {
      zhihu: keys.has('zhihu_cookie'),
      douyin: keys.has('douyin_cookie'),
      xiaohongshu: keys.has('xiaohongshu_cookie'),
      weibo: keys.has('weibo_cookie'),
    };
  }

  private dashboardSources(): typeof sourceNames {
    return sourceNames.filter((source) => source !== 'x' && source !== 'producthunt') as typeof sourceNames;
  }

  private async readJson(req: IncomingMessage): Promise<JsonBody> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const text = Buffer.concat(chunks).toString('utf8').trim();
    return text ? JSON.parse(text) as JsonBody : {};
  }

  private json(res: ServerResponse, payload: unknown, status: number = 200): void {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload, null, 2));
  }

  private html(res: ServerResponse, payload: string): void {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(payload);
  }

  private renderDashboard(): string {
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Content Scout - 管理后台</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    [x-cloak] { display: none !important; }
    :root {
      color-scheme: light;
      --surface: #ffffff;
      --surface-soft: #f8fafc;
      --line: #dbe3ee;
      --text: #111827;
      --muted: #64748b;
      --accent: #2563eb;
    }
    body {
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background: #f4f7fb;
    }
    input, textarea, select {
      background-color: #fff;
      transition: border-color .16s ease, box-shadow .16s ease, background-color .16s ease;
    }
    input:focus, textarea:focus, select:focus {
      border-color: var(--accent) !important;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, .12) !important;
    }
    .admin-shell {
      background: linear-gradient(180deg, #f8fafc 0%, #eef3f9 100%);
    }
    .admin-card {
      background: var(--surface);
      border: 1px solid var(--line);
      box-shadow: 0 10px 30px rgba(15, 23, 42, .06);
      border-radius: 8px;
    }
    .metric-card {
      border-radius: 8px;
      border: 1px solid rgba(148, 163, 184, .18);
    }
    .btn-primary {
      background: #1d4ed8;
      color: white;
      border-radius: 8px;
      transition: background-color .16s ease, transform .16s ease;
    }
    .btn-primary:hover { background: #1e40af; }
    .btn-primary:active { transform: translateY(1px); }
  </style>
</head>
<body class="admin-shell">
  <!-- Header -->
  <header class="bg-white border-b border-gray-200 sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-16">
        <div class="flex items-center">
          <h1 class="text-xl font-bold text-gray-900">Content Scout</h1>
          <span class="ml-3 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">管理后台</span>
        </div>
        <div class="flex items-center space-x-4">
          <div id="statusIndicator" class="flex items-center">
            <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span class="ml-2 text-sm text-gray-600">运行中</span>
          </div>
        </div>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">

      <!-- Sidebar - User List -->
      <div class="lg:col-span-1">
        <div class="admin-card">
          <div class="p-4 border-b border-gray-200">
            <h2 class="text-lg font-semibold text-gray-900">用户</h2>
          </div>
          <div class="p-4">
            <div class="mb-4">
              <input
                id="userId"
                type="text"
                placeholder="新用户 ID（可选）"
                value="local"
                onkeydown="if(event.key === 'Enter') createUser()"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
              <button
                id="createUserButton"
                onclick="createUser()"
                class="mt-2 w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-blue-300 transition"
              >
                新建用户
              </button>
              <div id="userActionMessage" class="mt-2 text-xs text-gray-500">点击列表切换用户；新建可留空自动生成 ID。</div>
            </div>
            <div id="users" class="space-y-2"></div>
          </div>
        </div>
      </div>

      <!-- Main Panel -->
      <div class="lg:col-span-3">
        <!-- Tabs -->
        <div class="admin-card">
          <div class="border-b border-gray-200">
            <nav class="flex -mb-px">
              <button onclick="switchTab('overview')" id="tab-overview" class="tab-button active px-6 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600">
                概览
              </button>
              <button onclick="switchTab('config')" id="tab-config" class="tab-button px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300">
                配置
              </button>
              <button onclick="switchTab('platforms')" id="tab-platforms" class="tab-button px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300">
                平台连接
              </button>
              <button onclick="switchTab('logs')" id="tab-logs" class="tab-button px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300">
                运行日志
              </button>
            </nav>
          </div>

          <!-- Tab Content -->
          <div class="p-6">

            <!-- Overview Tab -->
            <div id="content-overview" class="tab-content">
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div class="metric-card bg-blue-50 p-4">
                  <div class="text-sm text-blue-600 font-medium">已启用平台</div>
                  <div id="enabledSourcesCount" class="text-2xl font-bold text-blue-900 mt-1">0</div>
                </div>
                <div class="metric-card bg-green-50 p-4">
                  <div class="text-sm text-green-600 font-medium">定时任务</div>
                  <div id="scheduleStatus" class="text-2xl font-bold text-green-900 mt-1">未设置</div>
                </div>
                <div class="metric-card bg-purple-50 p-4">
                  <div class="text-sm text-purple-600 font-medium">平台连接</div>
                  <div id="connectionCount" class="text-2xl font-bold text-purple-900 mt-1">0/2</div>
                </div>
              </div>

              <div class="mb-6">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="text-sm font-semibold text-gray-900">平台健康状态</h3>
                  <span id="lastRunSummary" class="text-xs text-gray-500">等待运行</span>
                </div>
                <div id="platformHealthGrid" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3"></div>
              </div>

              <div class="flex space-x-3 mb-6">
                <button onclick="runUser()" class="flex-1 btn-primary px-4 py-3 font-medium">
                  立即运行
                </button>
                <button onclick="testPush()" class="flex-1 bg-green-600 text-white px-4 py-3 rounded-md hover:bg-green-700 transition font-medium">
                  测试飞书推送
                </button>
              </div>

              <div id="statusBox" class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div class="text-sm font-medium text-gray-700 mb-2">状态信息</div>
                <pre id="status" class="text-xs text-gray-600 whitespace-pre-wrap font-mono"></pre>
              </div>
            </div>

            <!-- Config Tab -->
            <div id="content-config" class="tab-content hidden">
              <div class="space-y-6">

                <!-- Basic Info Section -->
                <div class="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 class="text-lg font-semibold text-gray-900 mb-4">基本信息</h3>
                  <div class="space-y-4">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">用户 ID</label>
                      <input id="configUserId" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="例如: local">
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">X 创作者账号</label>
                      <input id="configAccountHandle" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="例如: @myaccount">
                      <p class="mt-1 text-xs text-gray-500">用于画像和草稿口吻，不用于抓取 X 内容。</p>
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">画像文件路径</label>
                      <input id="configProfilePath" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="留空则使用 data/profiles/{用户ID}.json">
                    </div>
                  </div>
                </div>

                <!-- AI Section -->
                <div class="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 class="text-lg font-semibold text-gray-900 mb-4">模型配置</h3>
                  <div class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Embedding API Key</label>
                        <input id="configEmbeddingApiKey" type="password" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="阿里云百炼 API Key">
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Embedding Base URL</label>
                        <input id="configEmbeddingBaseUrl" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1">
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Embedding Model</label>
                        <input id="configEmbeddingModel" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="text-embedding-v4">
                      </div>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">DeepSeek API Key</label>
                        <input id="configDeepseekApiKey" type="password" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="DeepSeek API Key">
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">DeepSeek Base URL</label>
                        <input id="configDeepseekBaseUrl" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://api.deepseek.com">
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Source Parameters Section -->
                <div class="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 class="text-lg font-semibold text-gray-900 mb-2">搜索关键词</h3>
                  <p class="text-sm text-gray-500 mb-4">仅支持站内搜索的平台需要关键词；Hacker News、GitHub、V2EX 抓热门榜后由模型筛选。</p>
                  <div class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">知乎关键词</label>
                        <input id="configZhihuKeywords" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="逗号分隔">
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">抖音关键词</label>
                        <input id="configDouyinKeywords" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="逗号分隔">
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">小红书关键词</label>
                        <input id="configXiaohongshuKeywords" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="逗号分隔">
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">微博关键词</label>
                        <input id="configWeiboKeywords" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="逗号分隔">
                      </div>
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">Reddit 关注社区</label>
                      <input id="configRedditSubreddits" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="LocalLLaMA, OpenAI, programming">
                    </div>
                  </div>
                </div>

                <!-- Profile Section -->
                <div class="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 class="text-lg font-semibold text-gray-900 mb-4">账号画像</h3>
                  <div class="space-y-4">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">兴趣领域</label>
                      <input id="configInterests" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="用逗号分隔，例如: AI, 编程, 创业">
                      <p class="mt-1 text-xs text-gray-500">描述你感兴趣的话题，用逗号分隔</p>
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">写作风格</label>
                      <textarea id="configStyle" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="例如: 简洁专业，注重技术深度"></textarea>
                      <p class="mt-1 text-xs text-gray-500">描述你的写作风格和语气</p>
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">目标受众</label>
                      <textarea id="configAudience" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="例如: 技术从业者，对 AI 和编程感兴趣"></textarea>
                      <p class="mt-1 text-xs text-gray-500">描述你的目标读者群体</p>
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">示例内容</label>
                      <textarea id="configSamplePosts" rows="6" class="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="粘贴你之前发布的内容示例，每行一条"></textarea>
                      <p class="mt-1 text-xs text-gray-500">提供 3-5 条你之前发布的内容，帮助 AI 学习你的风格</p>
                    </div>
                  </div>
                </div>

                <!-- Schedule Section -->
                <div class="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 class="text-lg font-semibold text-gray-900 mb-4">定时任务</h3>
                  <div class="space-y-4">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">运行时间</label>
                      <select id="configSchedule" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="0 9 * * *">每天早上 9:00</option>
                        <option value="0 12 * * *">每天中午 12:00</option>
                        <option value="0 18 * * *">每天晚上 18:00</option>
                        <option value="0 9,18 * * *">每天 9:00 和 18:00</option>
                        <option value="0 */6 * * *">每 6 小时一次</option>
                        <option value="0 */3 * * *">每 3 小时一次</option>
                        <option value="custom">自定义 Cron 表达式</option>
                      </select>
                    </div>
                    <div id="customCronContainer" class="hidden">
                      <label class="block text-sm font-medium text-gray-700 mb-2">自定义 Cron 表达式</label>
                      <input id="configCustomCron" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="例如: 0 9 * * *">
                      <p class="mt-1 text-xs text-gray-500">格式: 分 时 日 月 周，<a href="https://crontab.guru" target="_blank" class="text-blue-600 hover:underline">参考 Cron 语法</a></p>
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">时区</label>
                      <select id="configTimezone" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="Asia/Shanghai">中国标准时间 (UTC+8)</option>
                        <option value="America/New_York">美国东部时间 (UTC-5)</option>
                        <option value="America/Los_Angeles">美国西部时间 (UTC-8)</option>
                        <option value="Europe/London">英国时间 (UTC+0)</option>
                        <option value="Asia/Tokyo">日本时间 (UTC+9)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <!-- Feishu Section -->
                <div class="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 class="text-lg font-semibold text-gray-900 mb-4">飞书配置</h3>
                  <div class="space-y-4">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">App ID</label>
                      <input id="configFeishuAppId" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="从飞书开放平台获取">
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">App Secret</label>
                      <input id="configFeishuAppSecret" type="password" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="从飞书开放平台获取">
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">Base ID</label>
                      <input id="configFeishuBaseId" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="多维表格的 Base ID">
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">接收人 ID</label>
                      <input id="configFeishuReceiverId" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="接收消息的用户或群组 ID">
                    </div>
                  </div>
                </div>

                <!-- Save Button -->
                <div class="flex items-center justify-between">
                  <button onclick="saveUserFromForm()" class="bg-blue-600 text-white px-8 py-3 rounded-md hover:bg-blue-700 transition font-medium text-lg">
                    保存所有配置
                  </button>
                  <button onclick="toggleAdvancedConfig()" class="text-sm text-gray-600 hover:text-gray-900 underline">
                    切换到高级模式（JSON 编辑）
                  </button>
                </div>

                <!-- Advanced JSON Editor (Hidden by default) -->
                <div id="advancedConfigContainer" class="hidden">
                  <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <p class="text-sm text-yellow-800">⚠️ 高级模式：直接编辑 JSON 配置，请谨慎操作</p>
                  </div>
                  <textarea
                    id="config"
                    class="w-full h-96 px-4 py-3 border border-gray-300 rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="配置将在这里显示..."
                  ></textarea>
                  <div class="mt-4">
                    <button onclick="saveUser()" class="bg-gray-600 text-white px-6 py-2 rounded-md hover:bg-gray-700 transition font-medium">
                      保存 JSON 配置
                    </button>
                  </div>
                </div>

              </div>
            </div>

            <!-- Platforms Tab -->
            <div id="content-platforms" class="tab-content hidden">
              <div class="mb-4">
                <h3 class="text-sm font-medium text-gray-700 mb-2">选择要启用的内容平台</h3>
                <p class="text-sm text-gray-500">点击开关启用或禁用平台，修改后记得保存配置</p>
              </div>

              <div id="platformsList" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                <!-- Platforms will be rendered here by JavaScript -->
              </div>

              <div id="platformCredentialPanel" class="hidden mt-4 border border-gray-200 rounded-lg p-4 bg-gray-50">
                <!-- Selected platform credential controls will be rendered here -->
              </div>

              <div class="mt-6">
                <button onclick="savePlatformConfig()" class="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition font-medium">
                  保存平台配置
                </button>
              </div>

              <div class="mt-6 space-y-4">
                <!-- Cookie 获取教程 -->
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div class="flex">
                    <div class="flex-shrink-0">
                      <svg class="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
                      </svg>
                    </div>
                    <div class="ml-3 flex-1">
                      <h3 class="text-sm font-medium text-blue-800 mb-2">如何获取 Cookie？</h3>
                      <div class="space-y-3">
                        <div>
                          <p class="text-sm font-semibold text-blue-900 mb-1">方法一：使用浏览器开发者工具（推荐）</p>
                          <ol class="list-decimal list-inside space-y-1 text-sm text-blue-700 ml-2">
                            <li>在浏览器中登录对应平台（知乎、抖音、小红书、微博）</li>
                            <li>按 <kbd class="px-1 py-0.5 bg-white rounded text-xs">F12</kbd> 打开开发者工具</li>
                            <li>切换到 <strong>Network（网络）</strong> 标签</li>
                            <li>刷新页面（<kbd class="px-1 py-0.5 bg-white rounded text-xs">F5</kbd>）</li>
                            <li>点击任意请求，在右侧找到 <strong>Request Headers</strong></li>
                            <li>找到 <code class="bg-white px-1 rounded">Cookie:</code> 这一行</li>
                            <li>复制整行 Cookie 值（通常很长），粘贴到上方输入框</li>
                          </ol>
                        </div>
                        <div class="pt-2 border-t border-blue-200">
                          <p class="text-sm font-semibold text-blue-900 mb-1">方法二：使用浏览器扩展（即将支持）</p>
                          <p class="text-sm text-blue-700">安装 Cookie 导出扩展，一键复制当前网站的 Cookie</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 平台说明 -->
                <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h3 class="text-sm font-medium text-gray-800 mb-2">平台说明</h3>
                  <div class="text-sm text-gray-600 space-y-1">
                    <p>🔐 <strong>需要登录：</strong>知乎、抖音、小红书、微博</p>
                    <p>🆓 <strong>免费平台：</strong>HackerNews、GitHub、Reddit、V2EX（无需配置）</p>
                    <p>🔑 <strong>高级配置：</strong>X、Product Hunt 暂不在普通界面配置</p>
                  </div>
                </div>

                <!-- Cookie 安全提示 -->
                <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div class="flex">
                    <div class="flex-shrink-0">
                      <svg class="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                      </svg>
                    </div>
                    <div class="ml-3">
                      <h3 class="text-sm font-medium text-yellow-800">安全提示</h3>
                      <p class="mt-1 text-sm text-yellow-700">Cookie 包含你的登录凭证，请妥善保管。本系统会加密存储 Cookie，但请不要分享给他人。</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Logs Tab -->
            <div id="content-logs" class="tab-content hidden">
              <div class="mb-4">
                <button onclick="loadLogs()" class="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition">
                  刷新日志
                </button>
              </div>
              <div id="logsContainer" class="bg-gray-50 rounded-lg p-4 border border-gray-200 max-h-96 overflow-y-auto">
                <div id="logs" class="space-y-3 text-sm text-gray-700">加载中...</div>
              </div>
            </div>

          </div>
        </div>
      </div>

    </div>
  </div>

  <!-- Toast Notification -->
  <div id="toast" class="fixed bottom-4 right-4 hidden">
    <div class="bg-white rounded-lg shadow-lg border border-gray-200 p-4 max-w-sm">
      <div class="flex items-center">
        <div id="toastIcon" class="flex-shrink-0"></div>
        <div class="ml-3">
          <p id="toastMessage" class="text-sm font-medium text-gray-900"></p>
        </div>
      </div>
    </div>
  </div>

  <script>
    let currentUserId = 'local';
    let currentConfig = null;
    let selectedPlatformId = null;
    let logsRefreshTimer = null;
    let knownUserIds = new Set();
    let latestRunStats = {};
    const tokenFromUrl = new URLSearchParams(window.location.search).get('token');
    if (tokenFromUrl) {
      localStorage.setItem('contentScoutAdminToken', tokenFromUrl);
      window.history.replaceState(null, '', window.location.pathname);
    }
    const adminToken = localStorage.getItem('contentScoutAdminToken') || '';

    // Platform definitions
    const platforms = [
      { id: 'hackernews', name: 'Hacker News', icon: 'HN', color: 'bg-orange-500', needsAuth: false, description: '免费使用' },
      { id: 'github', name: 'GitHub Trending', icon: 'GH', color: 'bg-gray-800', needsAuth: false, description: '免费使用' },
      { id: 'zhihu', name: '知乎', icon: '知', color: 'bg-blue-600', needsAuth: 'cookie', description: '需要登录' },
      { id: 'reddit', name: 'Reddit', icon: 'RD', color: 'bg-orange-600', needsAuth: false, description: '免费使用' },
      { id: 'v2ex', name: 'V2EX', icon: 'V2', color: 'bg-gray-700', needsAuth: false, description: '免费使用' },
      { id: 'douyin', name: '抖音', icon: '抖', color: 'bg-black', needsAuth: 'cookie', description: '需要 Cookie' },
      { id: 'xiaohongshu', name: '小红书', icon: '小', color: 'bg-red-500', needsAuth: 'cookie', description: '需要 Cookie' },
      { id: 'weibo', name: '微博', icon: '微', color: 'bg-yellow-500', needsAuth: 'cookie', description: '需要登录' }
    ];

    // Toast notification
    function showToast(message, type = 'success') {
      const toast = document.getElementById('toast');
      const icon = document.getElementById('toastIcon');
      const msg = document.getElementById('toastMessage');

      msg.textContent = message;

      if (type === 'success') {
        icon.innerHTML = '<svg class="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>';
      } else {
        icon.innerHTML = '<svg class="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>';
      }

      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 3000);
    }

    // Tab switching
    function switchTab(tabName) {
      document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active', 'border-blue-600', 'text-blue-600');
        btn.classList.add('border-transparent', 'text-gray-500');
      });
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
      });

      document.getElementById(\`tab-\${tabName}\`).classList.add('active', 'border-blue-600', 'text-blue-600');
      document.getElementById(\`content-\${tabName}\`).classList.remove('hidden');

      if (tabName === 'logs') {
        loadLogs();
      }
    }

    // API request helper
    async function request(path, options = {}) {
      try {
        const headers = {'content-type': 'application/json'};
        if (adminToken) {
          headers.authorization = \`Bearer \${adminToken}\`;
        }

        const response = await fetch(path, {
          headers,
          ...options
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || response.statusText);
        return data;
      } catch (error) {
        showToast(error.message, 'error');
        throw error;
      }
    }

    // Load users
    async function loadUsers() {
      try {
        const users = await request('/api/users');
        knownUserIds = new Set(users.map(u => u.userId));
        const container = document.getElementById('users');
        if (!users.length) {
          container.innerHTML = '<div class="text-sm text-gray-500 px-1 py-2">暂无用户</div>';
          return users;
        }

        container.innerHTML = users.map(u => {
          const enabledCount = Array.isArray(u.enabledSources) ? u.enabledSources.length : 0;
          const activeClass = u.userId === currentUserId
            ? 'border-blue-500 bg-blue-50 text-blue-900'
            : 'border-gray-200 hover:bg-gray-50 text-gray-900';

          return \`
            <div class="flex items-stretch gap-2">
              <button
                onclick="selectUser('\${encodeURIComponent(u.userId)}')"
                class="min-w-0 flex-1 text-left px-3 py-2 rounded-md border transition \${activeClass}"
              >
                <div class="flex items-center justify-between gap-3">
                  <span class="font-medium truncate">\${escapeHtml(u.userId)}</span>
                  <span class="shrink-0 text-xs text-gray-500">\${enabledCount} 平台</span>
                </div>
              </button>
              <button
                onclick="deleteUser('\${encodeURIComponent(u.userId)}')"
                class="shrink-0 px-2 rounded-md border border-red-200 text-red-600 hover:bg-red-50 text-xs"
                title="删除用户"
                aria-label="删除用户 \${escapeHtml(u.userId)}"
              >
                删除
              </button>
            </div>
          \`;
        }).join('');
        return users;
      } catch (error) {
        console.error('Failed to load users:', error);
        return [];
      }
    }

    function selectUser(encodedId) {
      const id = decodeURIComponent(encodedId);
      document.getElementById('userId').value = id;
      loadUser();
    }

    function readUserId() {
      return document.getElementById('userId').value.trim() || 'local';
    }

    function readInputUserId() {
      return document.getElementById('userId').value.trim();
    }

    function generateUserId() {
      const now = new Date();
      const pad = value => String(value).padStart(2, '0');
      const base = \`user-\${now.getFullYear()}\${pad(now.getMonth() + 1)}\${pad(now.getDate())}-\${pad(now.getHours())}\${pad(now.getMinutes())}\${pad(now.getSeconds())}\`;
      let candidate = base;
      let index = 2;
      while (knownUserIds.has(candidate)) {
        candidate = \`\${base}-\${index}\`;
        index += 1;
      }
      return candidate;
    }

    function setUserActionMessage(message, type = 'info') {
      const element = document.getElementById('userActionMessage');
      if (!element) return;
      element.textContent = message;
      element.className = type === 'error'
        ? 'mt-2 text-xs text-red-600'
        : 'mt-2 text-xs text-gray-500';
    }

    function parseCommaList(value) {
      return String(value || '')
        .split(/[,\\n]/)
        .map(item => item.trim())
        .filter(Boolean);
    }

    // Load user config
    async function loadUser() {
      try {
        const id = readUserId();
        const data = await request(\`/api/users/\${encodeURIComponent(id)}\`);
        await applyLoadedUser(id, data);
        await loadUsers();
        setUserActionMessage(\`已切换到 \${id}\`);
        showToast('配置加载成功');
      } catch (error) {
        console.error('Failed to load user:', error);
      }
    }

    async function createUser() {
      const button = document.getElementById('createUserButton');
      try {
        if (button) {
          button.disabled = true;
          button.textContent = '创建中...';
        }

        await loadUsers();
        const inputId = readInputUserId();
        const id = inputId && !knownUserIds.has(inputId) ? inputId : generateUserId();
        document.getElementById('userId').value = id;
        const saved = await request(\`/api/users/\${encodeURIComponent(id)}\`, {
          method: 'POST',
          body: JSON.stringify({mode: 'create'})
        });
        await applyLoadedUser(id, saved);
        await loadUsers();
        setUserActionMessage(\`已新建用户 \${id}\`);
        showToast('用户已新建');
      } catch (error) {
        setUserActionMessage(error.message, 'error');
        console.error('Failed to create user:', error);
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = '新建用户';
        }
      }
    }

    async function deleteUser(encodedId) {
      const id = decodeURIComponent(encodedId);
      if (!confirm(\`删除用户 \${id}？该用户的配置、登录态和运行记录都会删除。\`)) {
        return;
      }

      try {
        await request(\`/api/users/\${encodeURIComponent(id)}\`, {method: 'DELETE'});
        const users = await loadUsers();
        if (currentUserId === id) {
          if (users.length) {
            document.getElementById('userId').value = users[0].userId;
            await loadUser();
          } else {
            currentUserId = '';
            currentConfig = null;
            document.getElementById('userId').value = '';
            setUserActionMessage('用户已删除，暂无用户');
          }
        }
        showToast('用户已删除');
      } catch (error) {
        setUserActionMessage(error.message, 'error');
        console.error('Failed to delete user:', error);
      }
    }

    async function applyLoadedUser(id, data) {
      currentUserId = id;
      currentConfig = data;
      document.getElementById('userId').value = id;
      document.getElementById('config').value = JSON.stringify(data, null, 2);
      latestRunStats = await loadLatestRunStats(id);
      updateOverview(data);
      updatePlatformStatus(data);
      loadConfigIntoForm(data);

      try {
        const profile = await request(\`/api/users/\${encodeURIComponent(id)}/profile\`);
        document.getElementById('configInterests').value = Array.isArray(profile.interests)
          ? profile.interests.join(', ')
          : profile.interests || '';
        document.getElementById('configStyle').value = profile.style || '';
        document.getElementById('configAudience').value = profile.audience || '';
        document.getElementById('configSamplePosts').value = Array.isArray(profile.samplePosts)
          ? profile.samplePosts.join('\\n')
          : profile.samplePosts || '';
      } catch (error) {
        document.getElementById('configInterests').value = '';
        document.getElementById('configStyle').value = '';
        document.getElementById('configAudience').value = '';
        document.getElementById('configSamplePosts').value = '';
      }
    }

    async function loadLatestRunStats(id) {
      try {
        const runs = await request(\`/api/runs?userId=\${encodeURIComponent(id)}&limit=1\`);
        return parseStats(runs[0]?.stats_json);
      } catch {
        return {};
      }
    }

    // Update overview
    function updateOverview(config) {
      const enabledSources = platforms.filter(platform => config.sources[platform.id]?.enabled);
      document.getElementById('enabledSourcesCount').textContent = enabledSources.length;
      document.getElementById('scheduleStatus').textContent = config.schedule?.cronSchedule || '未设置';

      const connections = [
        config.credentialStatus?.zhihuCookie,
        config.credentialStatus?.douyinCookie,
        config.credentialStatus?.xiaohongshuCookie,
        config.credentialStatus?.weiboCookie
      ].filter(Boolean).length;
      document.getElementById('connectionCount').textContent = \`\${connections}/4\`;
      renderPlatformHealth(config);
      document.getElementById('lastRunSummary').textContent = buildRunSummary(latestRunStats);
    }

    function renderPlatformHealth(config) {
      const container = document.getElementById('platformHealthGrid');
      if (!container) return;

      const aggregation = Array.isArray(latestRunStats.aggregation) ? latestRunStats.aggregation : [];
      const bySource = new Map(aggregation.map(item => [item.source, item]));

      container.innerHTML = platforms.map(platform => {
        const enabled = Boolean(config.sources[platform.id]?.enabled);
        const hasAuth = platform.needsAuth === 'cookie'
          ? Boolean(config.credentialStatus?.[\`\${platform.id}Cookie\`])
          : true;
        const stat = bySource.get(platform.id);
        const health = platformHealth(platform, enabled, hasAuth, stat);

        return \`
          <div class="border \${health.border} \${health.bg} rounded-lg p-3">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="h-2.5 w-2.5 rounded-full \${health.dot}"></span>
                  <span class="font-medium text-gray-900 truncate">\${platform.name}</span>
                </div>
                <div class="mt-1 text-xs \${health.text}">\${health.message}</div>
              </div>
              \${health.action ? \`<button onclick="\${health.action}" class="shrink-0 text-xs font-medium text-blue-700 hover:text-blue-900">处理</button>\` : ''}
            </div>
          </div>
        \`;
      }).join('');
    }

    function platformHealth(platform, enabled, hasAuth, stat) {
      if (!enabled) {
        return {
          dot: 'bg-gray-300',
          bg: 'bg-white',
          border: 'border-gray-200',
          text: 'text-gray-500',
          message: '未启用',
        };
      }

      if (!hasAuth) {
        return {
          dot: 'bg-blue-500',
          bg: 'bg-blue-50',
          border: 'border-blue-100',
          text: 'text-blue-700',
          message: '需要登录后才能抓取',
          action: \`switchTab('platforms'); selectPlatformCredential('\${platform.id}')\`,
        };
      }

      if (!stat) {
        return {
          dot: 'bg-blue-500',
          bg: 'bg-blue-50',
          border: 'border-blue-100',
          text: 'text-blue-700',
          message: '等待首次运行',
        };
      }

      if (Number(stat.errors || 0) > 0) {
        const needsLogin = platform.needsAuth === 'cookie';
        return {
          dot: 'bg-red-500',
          bg: 'bg-red-50',
          border: 'border-red-100',
          text: 'text-red-700',
          message: needsLogin ? '抓取失败，可能需要重新登录' : '抓取失败，稍后会自动重试',
          action: needsLogin ? \`switchTab('platforms'); selectPlatformCredential('\${platform.id}')\` : '',
        };
      }

      if (Number(stat.itemsCollected || 0) === 0) {
        return {
          dot: 'bg-yellow-500',
          bg: 'bg-yellow-50',
          border: 'border-yellow-100',
          text: 'text-yellow-700',
          message: '本次未抓到内容',
        };
      }

      return {
        dot: 'bg-green-500',
        bg: 'bg-green-50',
        border: 'border-green-100',
        text: 'text-green-700',
        message: \`本次抓到 \${Number(stat.itemsCollected || 0)} 条\`,
      };
    }

    function buildRunSummary(stats) {
      if (!stats || !Array.isArray(stats.aggregation)) {
        return '等待运行';
      }

      const collected = stats.aggregation.reduce((sum, item) => sum + Number(item.itemsCollected || 0), 0);
      const selected = stats.filtering?.selected ?? stats.result?.recommendations ?? 0;
      const drafts = stats.drafts?.drafts ?? 0;
      const failed = stats.aggregation.filter(item => Number(item.errors || 0) > 0).map(item => item.source);
      const base = \`抓到 \${collected} 条，筛选 \${selected} 条，草稿 \${drafts} 个\`;
      return failed.length ? \`\${base}；失败：\${failed.join('、')}\` : base;
    }

    // Update platform status
    function updatePlatformStatus(config) {
      const container = document.getElementById('platformsList');
      if (!container) return;

      const html = platforms.map(platform => {
        const isEnabled = config.sources[platform.id]?.enabled || false;
        const hasAuth = platform.needsAuth === 'cookie'
          ? Boolean(config.credentialStatus?.[\`\${platform.id}Cookie\`])
          : true;
        const isSelected = selectedPlatformId === platform.id;

        const statusBadge = !platform.needsAuth || hasAuth
          ? '<span class="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded">可用</span>'
          : '<span class="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">需配置</span>';

        const toggleClass = isEnabled ? 'bg-blue-600' : 'bg-gray-200';
        const toggleSpanClass = isEnabled ? 'translate-x-6' : 'translate-x-1';
        const selectedClass = isSelected ? 'border-blue-500 ring-2 ring-blue-100 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300';

        return \`
          <div class="border \${selectedClass} rounded-lg p-3 transition">
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center min-w-0">
                <div class="w-9 h-9 \${platform.color} rounded-md flex items-center justify-center text-white font-bold text-xs shrink-0">
                  \${platform.icon}
                </div>
                <div class="ml-3 min-w-0">
                  <h3 class="font-semibold text-gray-900 truncate">\${platform.name}</h3>
                  <p class="text-xs text-gray-500 truncate">\${platform.description}</p>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button
                  onclick="togglePlatform('\${platform.id}')"
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition \${toggleClass}"
                  data-platform="\${platform.id}"
                  data-enabled="\${isEnabled}"
                >
                  <span class="inline-block h-4 w-4 transform rounded-full bg-white transition \${toggleSpanClass}"></span>
                </button>
              </div>
            </div>
            <div class="mt-3 flex items-center justify-between gap-2">
              \${statusBadge}
              \${platform.needsAuth === 'cookie' ? \`
                <button onclick="selectPlatformCredential('\${platform.id}')" class="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700">
                  \${hasAuth ? '更新登录' : '配置登录'}
                </button>
              \` : '<span class="text-xs text-gray-400">无需登录</span>'}
            </div>
          </div>
        \`;
      }).join('');

      container.innerHTML = html;
      renderPlatformCredentialPanel(config);
    }

    function selectPlatformCredential(platformId) {
      selectedPlatformId = platformId;
      updatePlatformStatus(currentConfig);
    }

    function renderPlatformCredentialPanel(config) {
      const panel = document.getElementById('platformCredentialPanel');
      const platform = platforms.find(item => item.id === selectedPlatformId);
      if (!panel || !platform || platform.needsAuth !== 'cookie') {
        panel?.classList.add('hidden');
        return;
      }

      const hasAuth = Boolean(config.credentialStatus?.[\`\${platform.id}Cookie\`]);
      panel.classList.remove('hidden');
      panel.innerHTML = \`
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center">
            <div class="w-8 h-8 \${platform.color} rounded-md flex items-center justify-center text-white font-bold text-xs">\${platform.icon}</div>
            <div class="ml-3">
              <h3 class="font-semibold text-gray-900">\${platform.name} 登录配置</h3>
              <p class="text-xs text-gray-500">仅本地部署可用，登录态保存在本机数据目录</p>
            </div>
          </div>
          <span class="px-2 py-1 text-xs font-medium rounded \${hasAuth ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">\${hasAuth ? '已连接' : '未连接'}</span>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-2">
          <input
            id="\${platform.id}Cookie"
            type="text"
            placeholder="粘贴 \${platform.name} Cookie"
            class="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
          <button onclick="saveCookie('\${platform.id}')" class="bg-gray-600 text-white px-4 py-2 text-sm rounded-md hover:bg-gray-700 transition">
            保存 Cookie
          </button>
          <button onclick="launchLogin('\${platform.id}')" class="bg-blue-600 text-white px-4 py-2 text-sm rounded-md hover:bg-blue-700 transition">
            本地辅助登录
          </button>
        </div>
      \`;
    }

    // Toggle platform enabled/disabled
    function togglePlatform(platformId) {
      const button = document.querySelector(\`button[data-platform="\${platformId}"]\`);
      const currentState = button.getAttribute('data-enabled') === 'true';
      const newState = !currentState;

      // Update UI immediately
      button.setAttribute('data-enabled', newState);
      button.className = \`relative inline-flex h-6 w-11 items-center rounded-full transition \${newState ? 'bg-blue-600' : 'bg-gray-200'}\`;
      button.querySelector('span').className = \`inline-block h-4 w-4 transform rounded-full bg-white transition \${newState ? 'translate-x-6' : 'translate-x-1'}\`;

      // Update config
      if (!currentConfig.sources[platformId]) {
        currentConfig.sources[platformId] = {};
      }
      currentConfig.sources[platformId].enabled = newState;
      updatePlatformStatus(currentConfig);
    }

    // Save platform configuration
    async function savePlatformConfig() {
      try {
        const id = currentUserId;
        const data = await request(\`/api/users/\${encodeURIComponent(id)}\`, {
          method: 'PUT',
          body: JSON.stringify(currentConfig)
        });
        currentConfig = data;
        document.getElementById('config').value = JSON.stringify(data, null, 2);
        await loadUsers();
        updateOverview(data);
        showToast('平台配置保存成功');
      } catch (error) {
        console.error('Failed to save platform config:', error);
      }
    }

    // Save user config
    // Toggle advanced config mode
    function toggleAdvancedConfig() {
      const container = document.getElementById('advancedConfigContainer');
      const isHidden = container.classList.contains('hidden');

      if (isHidden) {
        container.classList.remove('hidden');
        // Sync current config to JSON editor
        if (currentConfig) {
          document.getElementById('config').value = JSON.stringify(currentConfig, null, 2);
        }
      } else {
        container.classList.add('hidden');
      }
    }

    // Load config into form fields
    function loadConfigIntoForm(config) {
      // Basic info
      document.getElementById('configUserId').value = config.userId || '';
      document.getElementById('configAccountHandle').value = config.accountHandle || '';
      document.getElementById('configProfilePath').value = config.profilePath || '';

      // AI
      document.getElementById('configEmbeddingBaseUrl').value = config.ai?.embedding?.baseURL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
      document.getElementById('configEmbeddingModel').value = config.ai?.embedding?.model || 'text-embedding-v4';
      document.getElementById('configDeepseekBaseUrl').value = config.ai?.deepseek?.baseURL || 'https://api.deepseek.com';
      const embeddingApiKeyInput = document.getElementById('configEmbeddingApiKey');
      embeddingApiKeyInput.value = '';
      embeddingApiKeyInput.placeholder = config.credentialStatus?.embeddingApiKey
        ? '已配置，留空保持不变'
        : '阿里云百炼 API Key';
      const deepseekApiKeyInput = document.getElementById('configDeepseekApiKey');
      deepseekApiKeyInput.value = '';
      deepseekApiKeyInput.placeholder = config.credentialStatus?.deepseekApiKey
        ? '已配置，留空保持不变'
        : 'DeepSeek API Key';

      // Sources
      document.getElementById('configZhihuKeywords').value = (config.sources?.zhihu?.keywords || []).join(', ');
      document.getElementById('configDouyinKeywords').value = (config.sources?.douyin?.keywords || []).join(', ');
      document.getElementById('configXiaohongshuKeywords').value = (config.sources?.xiaohongshu?.keywords || []).join(', ');
      document.getElementById('configWeiboKeywords').value = (config.sources?.weibo?.keywords || []).join(', ');
      document.getElementById('configRedditSubreddits').value = (config.sources?.reddit?.subreddits || []).join(', ');

      // Schedule
      const cronSchedule = config.schedule?.cronSchedule || '0 9 * * *';
      const scheduleSelect = document.getElementById('configSchedule');
      const standardOptions = ['0 9 * * *', '0 12 * * *', '0 18 * * *', '0 9,18 * * *', '0 */6 * * *', '0 */3 * * *'];

      if (standardOptions.includes(cronSchedule)) {
        scheduleSelect.value = cronSchedule;
        document.getElementById('customCronContainer').classList.add('hidden');
      } else {
        scheduleSelect.value = 'custom';
        document.getElementById('customCronContainer').classList.remove('hidden');
        document.getElementById('configCustomCron').value = cronSchedule;
      }

      document.getElementById('configTimezone').value = config.schedule?.timezone || 'Asia/Shanghai';

      // Feishu
      document.getElementById('configFeishuAppId').value = config.lark?.appId || '';
      const appSecretInput = document.getElementById('configFeishuAppSecret');
      appSecretInput.value = '';
      appSecretInput.placeholder = config.credentialStatus?.larkAppSecret
        ? '已配置，留空保持不变'
        : '从飞书开放平台获取';
      document.getElementById('configFeishuBaseId').value = config.lark?.baseId || '';
      document.getElementById('configFeishuReceiverId').value = config.lark?.defaultReceiverId || '';

      // Also update JSON editor
      document.getElementById('config').value = JSON.stringify(config, null, 2);
    }

    // Save config from form
    async function saveUserFromForm() {
      try {
        const id = currentUserId;

        // Get schedule value
        const scheduleSelect = document.getElementById('configSchedule').value;
        const cronSchedule = scheduleSelect === 'custom'
          ? document.getElementById('configCustomCron').value
          : scheduleSelect;

        const appSecret = document.getElementById('configFeishuAppSecret').value;
        const larkConfig = {
          appId: document.getElementById('configFeishuAppId').value,
          baseId: document.getElementById('configFeishuBaseId').value,
          defaultReceiverId: document.getElementById('configFeishuReceiverId').value
        };
        if (appSecret) {
          larkConfig.appSecret = appSecret;
        }
        const embeddingApiKey = document.getElementById('configEmbeddingApiKey').value;
        const deepseekApiKey = document.getElementById('configDeepseekApiKey').value;
        const aiConfig = {
          embedding: {
            ...currentConfig.ai?.embedding,
            baseURL: document.getElementById('configEmbeddingBaseUrl').value,
            model: document.getElementById('configEmbeddingModel').value
          },
          deepseek: {
            ...currentConfig.ai?.deepseek,
            baseURL: document.getElementById('configDeepseekBaseUrl').value
          }
        };
        if (embeddingApiKey) {
          aiConfig.embedding.apiKey = embeddingApiKey;
        }
        if (deepseekApiKey) {
          aiConfig.deepseek.apiKey = deepseekApiKey;
        }
        const sourcesConfig = {
          ...currentConfig.sources,
          zhihu: {
            ...currentConfig.sources.zhihu,
            keywords: parseCommaList(document.getElementById('configZhihuKeywords').value)
          },
          douyin: {
            ...currentConfig.sources.douyin,
            keywords: parseCommaList(document.getElementById('configDouyinKeywords').value)
          },
          xiaohongshu: {
            ...currentConfig.sources.xiaohongshu,
            keywords: parseCommaList(document.getElementById('configXiaohongshuKeywords').value)
          },
          weibo: {
            ...currentConfig.sources.weibo,
            keywords: parseCommaList(document.getElementById('configWeiboKeywords').value)
          },
          reddit: {
            ...currentConfig.sources.reddit,
            subreddits: parseCommaList(document.getElementById('configRedditSubreddits').value)
          }
        };

        // Build config object
        const payload = {
          ...currentConfig,
          userId: document.getElementById('configUserId').value,
          accountHandle: document.getElementById('configAccountHandle').value || document.getElementById('configUserId').value,
          profilePath: document.getElementById('configProfilePath').value,
          sources: sourcesConfig,
          schedule: {
            cronSchedule: cronSchedule,
            timezone: document.getElementById('configTimezone').value
          },
          lark: larkConfig,
          ai: aiConfig
        };

        // Save profile data separately if provided
        const interests = document.getElementById('configInterests').value;
        const style = document.getElementById('configStyle').value;
        const audience = document.getElementById('configAudience').value;
        const samplePosts = document.getElementById('configSamplePosts').value;

        if (interests || style || audience || samplePosts) {
          const profilePayload = {};
          if (interests) profilePayload.interests = interests.split(',').map(s => s.trim()).filter(Boolean);
          if (style) profilePayload.style = style;
          if (audience) profilePayload.audience = audience;
          if (samplePosts) profilePayload.samplePosts = samplePosts.split('\\n').filter(s => s.trim());

          await request(\`/api/users/\${encodeURIComponent(id)}/profile\`, {
            method: 'PUT',
            body: JSON.stringify(profilePayload)
          });
        }

        const data = await request(\`/api/users/\${encodeURIComponent(id)}\`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });

        currentConfig = data;
        await loadUsers();
        updateOverview(data);
        showToast('配置保存成功');
      } catch (error) {
        console.error('Failed to save user:', error);
        showToast('保存失败: ' + error.message, 'error');
      }
    }

    async function saveUser() {
      try {
        const id = currentUserId;
        const payload = JSON.parse(document.getElementById('config').value);
        const data = await request(\`/api/users/\${encodeURIComponent(id)}\`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        currentConfig = data;
        document.getElementById('config').value = JSON.stringify(data, null, 2);
        await loadUsers();
        updateOverview(data);
        showToast('配置保存成功');
      } catch (error) {
        console.error('Failed to save user:', error);
      }
    }

    // Save cookie
    async function saveCookie(platform) {
      try {
        const id = currentUserId;
        const input = \`\${platform}Cookie\`;
        const value = document.getElementById(input).value;

        if (!value) {
          showToast('请输入 Cookie', 'error');
          return;
        }

        const data = await request(\`/api/users/\${encodeURIComponent(id)}/credentials/\${platform}\`, {
          method: 'POST',
          body: JSON.stringify({value})
        });

        currentConfig = data;
        document.getElementById('config').value = JSON.stringify(data, null, 2);
        document.getElementById(input).value = '';
        await loadUsers();
        updatePlatformStatus(data);

        const platformNames = {
          'zhihu': '知乎',
          'douyin': '抖音',
          'xiaohongshu': '小红书',
          'weibo': '微博'
        };
        showToast(\`\${platformNames[platform] || platform} Cookie 保存成功\`);
      } catch (error) {
        console.error('Failed to save cookie:', error);
      }
    }

    // Launch login window
    async function launchLogin(platform) {
      try {
        const id = currentUserId;
        showToast('正在打开登录窗口，请在浏览器中完成登录...', 'success');

        const data = await request(\`/api/users/\${encodeURIComponent(id)}/login/\${platform}\`, {
          method: 'POST'
        });

        currentConfig = data;
        document.getElementById('config').value = JSON.stringify(data, null, 2);
        await loadUsers();
        updatePlatformStatus(data);

        const platformNames = {
          'zhihu': '知乎',
          'douyin': '抖音',
          'xiaohongshu': '小红书',
          'weibo': '微博'
        };
        showToast(\`\${platformNames[platform] || platform} 登录成功，Cookie 已保存\`);
      } catch (error) {
        console.error('Failed to launch login:', error);
        showToast('登录失败: ' + error.message, 'error');
      }
    }

    // Run user
    async function runUser() {
      try {
        const id = currentUserId;
        document.getElementById('status').textContent = '正在运行...';
        const result = await request(\`/api/users/\${encodeURIComponent(id)}/run\`, {method: 'POST'});
        document.getElementById('status').textContent = JSON.stringify(result, null, 2);
        showToast('任务已提交');
        switchTab('logs');
        setTimeout(loadLogs, 500);
      } catch (error) {
        console.error('Failed to run user:', error);
      }
    }

    // Test push
    async function testPush() {
      try {
        const id = currentUserId;
        document.getElementById('status').textContent = '正在测试...';
        const result = await request(\`/api/users/\${encodeURIComponent(id)}/test-push\`, {method: 'POST'});
        document.getElementById('status').textContent = JSON.stringify(result, null, 2);
        showToast('测试推送已发送');
      } catch (error) {
        console.error('Failed to test push:', error);
      }
    }

    // Load logs
    async function loadLogs() {
      try {
        const runs = await request(\`/api/runs?userId=\${encodeURIComponent(currentUserId)}&limit=20\`);
        document.getElementById('logs').innerHTML = renderRuns(runs);
        if (runs.length) {
          latestRunStats = parseStats(runs[0].stats_json);
          if (currentConfig) {
            updateOverview(currentConfig);
          }
        }
        if (logsRefreshTimer) {
          clearTimeout(logsRefreshTimer);
          logsRefreshTimer = null;
        }
        const logsVisible = !document.getElementById('content-logs').classList.contains('hidden');
        if (logsVisible && runs.some(run => run.status === 'running')) {
          logsRefreshTimer = setTimeout(loadLogs, 3000);
        }
      } catch (error) {
        console.error('Failed to load logs:', error);
      }
    }

    function renderRuns(runs) {
      if (!runs.length) {
        return '<div class="text-gray-500">暂无运行日志</div>';
      }

      return runs.map(run => {
        const stats = parseStats(run.stats_json);
        const stages = Array.isArray(stats.stages) ? stats.stages : [];
        const aggregation = Array.isArray(stats.aggregation) ? stats.aggregation : [];
        return \`
          <div class="bg-white border border-gray-200 rounded-lg p-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="font-semibold text-gray-900">\${escapeHtml(run.job_type)} · \${statusLabel(run.status)}</div>
                <div class="text-xs text-gray-500 mt-1">\${formatTime(run.started_at)}\${run.finished_at ? ' - ' + formatTime(run.finished_at) : ''}</div>
              </div>
              <span class="px-2 py-1 text-xs font-medium rounded \${statusClass(run.status)}">\${statusLabel(run.status)}</span>
            </div>
            <div class="mt-2 text-sm text-gray-700">\${escapeHtml(run.message || '')}</div>
            \${run.error ? \`<div class="mt-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded p-2">\${escapeHtml(run.error)}</div>\` : ''}
            \${aggregation.length ? renderAggregation(aggregation) : ''}
            \${stages.length ? renderStages(stages) : '<div class="mt-3 text-xs text-gray-500">暂无阶段明细</div>'}
          </div>
        \`;
      }).join('');
    }

    function renderAggregation(aggregation) {
      return \`
        <div class="mt-3 overflow-x-auto">
          <table class="min-w-full text-xs">
            <thead>
              <tr class="text-left text-gray-500 border-b border-gray-100">
                <th class="py-1 pr-3">平台</th>
                <th class="py-1 pr-3">抓取</th>
                <th class="py-1 pr-3">入库</th>
                <th class="py-1 pr-3">错误</th>
              </tr>
            </thead>
            <tbody>
              \${aggregation.map(item => \`
                <tr class="border-b border-gray-50">
                  <td class="py-1 pr-3 font-medium text-gray-800">\${escapeHtml(item.source || '')}</td>
                  <td class="py-1 pr-3">\${Number(item.itemsCollected || 0)}</td>
                  <td class="py-1 pr-3">\${Number(item.itemsSaved || 0)}</td>
                  <td class="py-1 pr-3">\${Number(item.errors || 0)}</td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        </div>
      \`;
    }

    function renderStages(stages) {
      return \`
        <div class="mt-3 space-y-2">
          \${stages.map(stage => \`
            <div class="flex gap-3">
              <span class="mt-1.5 h-2 w-2 rounded-full shrink-0 \${stageDotClass(stage.status)}"></span>
              <div class="min-w-0">
                <div class="text-sm">
                  <span class="font-medium text-gray-900">\${escapeHtml(stage.phase || '')}</span>
                  <span class="text-gray-700"> · \${escapeHtml(stage.message || '')}</span>
                </div>
                <div class="text-xs text-gray-500">\${formatTime(stage.at)}\${stage.data ? ' · ' + escapeHtml(formatStageData(stage.data)) : ''}</div>
              </div>
            </div>
          \`).join('')}
        </div>
      \`;
    }

    function parseStats(value) {
      if (!value) return {};
      try {
        return JSON.parse(value);
      } catch {
        return {};
      }
    }

    function formatStageData(data) {
      return Object.entries(data)
        .map(([key, value]) => \`\${key}: \${Array.isArray(value) ? value.join(', ') : value}\`)
        .join('，');
    }

    function statusLabel(status) {
      return {
        running: '运行中',
        succeeded: '成功',
        failed: '失败',
        skipped: '跳过'
      }[status] || status;
    }

    function statusClass(status) {
      return {
        running: 'bg-blue-100 text-blue-800',
        succeeded: 'bg-green-100 text-green-800',
        failed: 'bg-red-100 text-red-800'
      }[status] || 'bg-gray-100 text-gray-700';
    }

    function stageDotClass(status) {
      return {
        running: 'bg-blue-500',
        succeeded: 'bg-green-500',
        failed: 'bg-red-500',
        skipped: 'bg-gray-400'
      }[status] || 'bg-gray-400';
    }

    function formatTime(value) {
      if (!value) return '';
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', function() {
      // Handle schedule dropdown change
      document.getElementById('configSchedule').addEventListener('change', function(e) {
        const customContainer = document.getElementById('customCronContainer');
        if (e.target.value === 'custom') {
          customContainer.classList.remove('hidden');
        } else {
          customContainer.classList.add('hidden');
        }
      });

      // Load initial data
      loadUsers();
      loadUser();
    });
  </script>
</body>
</html>`;
  }
}

function main(): void {
  ensureDirectories();
  const db = new DatabaseManager(config.dbPath);
  db.initialize();
  const repository = new RuntimeConfigRepository(db);
  const queue = new RuntimeJobQueue(db);
  const port = Number(process.env.ADMIN_PORT || 8787);
  const host = process.env.ADMIN_HOST || '127.0.0.1';
  new AdminServer(db, repository, queue).start(port, host);
}

if (process.argv[1]?.endsWith('admin-server.ts') || process.argv[1]?.endsWith('admin-server.js')) {
  main();
}
