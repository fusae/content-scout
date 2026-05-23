import { createServer, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { config, ensureDirectories, localRuntimeConfig } from '../config.js';
import { DatabaseManager } from '../db/index.js';
import { RuntimeConfigRepository } from '../runtime/config-repository.js';
import { RuntimeJobQueue } from '../runtime/job-queue.js';
import { MultiUserScheduler } from '../runtime/multi-user-scheduler.js';
import { RuntimeTaskRunner } from '../runtime/task-runner.js';
import { RuntimeWorker } from '../runtime/worker.js';
import { sourceNames, UserRuntimeConfig } from '../types/runtime-config.js';
import { logger } from '../utils/logger.js';

type JsonBody = Record<string, unknown>;

class AdminServer {
  private scheduler: MultiUserScheduler;
  private worker: RuntimeWorker;

  constructor(
    private db: DatabaseManager,
    private repository: RuntimeConfigRepository,
    private queue: RuntimeJobQueue
  ) {
    const runner = new RuntimeTaskRunner(db);
    this.scheduler = new MultiUserScheduler(db, repository, queue);
    this.worker = new RuntimeWorker(queue, repository, runner);
  }

  start(port: number): void {
    this.scheduler.reload();
    this.worker.start();

    const server = createServer((req, res) => {
      void this.handle(req, res);
    });

    server.listen(port, () => {
      logger.info(`Admin server listening on http://127.0.0.1:${port}`);
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

      if (userMatch && (method === 'POST' || method === 'PUT')) {
        const body = await this.readJson(req);
        const saved = this.saveUser(userMatch[1], body);
        this.scheduler.reload();
        this.json(res, saved);
        return;
      }

      const credentialMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/credentials\/([^/]+)$/);
      if (credentialMatch && method === 'POST') {
        const body = await this.readJson(req);
        const saved = this.saveCredential(credentialMatch[1], credentialMatch[2], body);
        this.json(res, saved);
        return;
      }

      if (credentialMatch && method === 'DELETE') {
        this.db.deleteRuntimeCredential(credentialMatch[1], `${credentialMatch[2]}_cookie`);
        this.json(res, { ok: true });
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
          ? sourceNames.filter((source) => runtimeConfig.sources[source].enabled)
          : [],
        connections: this.connectionStatus(user.user_id),
      };
    });
  }

  private getUser(userId: string): UserRuntimeConfig {
    const runtimeConfig = this.repository.get(userId);
    if (runtimeConfig) {
      return runtimeConfig;
    }

    return this.defaultConfig(userId);
  }

  private saveUser(userId: string, body: JsonBody): UserRuntimeConfig {
    const runtimeConfig = this.normalizeConfig(userId, body);
    this.repository.save(runtimeConfig);
    return runtimeConfig;
  }

  private saveCredential(userId: string, platform: string, body: JsonBody): UserRuntimeConfig {
    const value = typeof body.value === 'string' ? body.value : '';
    if (!value) {
      throw new Error('Credential value is required');
    }

    const runtimeConfig = this.repository.get(userId) || this.defaultConfig(userId);
    if (platform === 'douyin') {
      runtimeConfig.sources.douyin.cookie = value;
      runtimeConfig.sources.douyin.enabled = true;
    } else if (platform === 'xiaohongshu') {
      runtimeConfig.sources.xiaohongshu.cookie = value;
      runtimeConfig.sources.xiaohongshu.enabled = true;
    } else {
      throw new Error(`Unsupported platform credential: ${platform}`);
    }

    this.repository.save(runtimeConfig);
    return runtimeConfig;
  }

  private normalizeConfig(userId: string, body: JsonBody): UserRuntimeConfig {
    const base = this.repository.get(userId) || this.defaultConfig(userId);
    const incoming = body as Partial<UserRuntimeConfig>;
    return {
      ...base,
      ...incoming,
      userId,
      sources: {
        ...base.sources,
        ...incoming.sources,
      },
      lark: {
        ...base.lark,
        ...incoming.lark,
      },
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

  private connectionStatus(userId: string): Record<string, boolean> {
    const keys = new Set(this.db.getRuntimeCredentials(userId).map((row) => row.credential_key));
    return {
      douyin: keys.has('douyin_cookie'),
      xiaohongshu: keys.has('xiaohongshu_cookie'),
    };
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
  </style>
</head>
<body class="bg-gray-50">
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
        <div class="bg-white rounded-lg shadow-sm border border-gray-200">
          <div class="p-4 border-b border-gray-200">
            <h2 class="text-lg font-semibold text-gray-900">用户列表</h2>
          </div>
          <div class="p-4">
            <div class="mb-4">
              <input
                id="userId"
                type="text"
                placeholder="输入用户 ID"
                value="local"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
              <button
                onclick="loadUser()"
                class="mt-2 w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"
              >
                加载/新建用户
              </button>
            </div>
            <div id="users" class="space-y-2"></div>
          </div>
        </div>
      </div>

      <!-- Main Panel -->
      <div class="lg:col-span-3">
        <!-- Tabs -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200">
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
                <div class="bg-blue-50 rounded-lg p-4">
                  <div class="text-sm text-blue-600 font-medium">已启用平台</div>
                  <div id="enabledSourcesCount" class="text-2xl font-bold text-blue-900 mt-1">0</div>
                </div>
                <div class="bg-green-50 rounded-lg p-4">
                  <div class="text-sm text-green-600 font-medium">定时任务</div>
                  <div id="scheduleStatus" class="text-2xl font-bold text-green-900 mt-1">未设置</div>
                </div>
                <div class="bg-purple-50 rounded-lg p-4">
                  <div class="text-sm text-purple-600 font-medium">平台连接</div>
                  <div id="connectionCount" class="text-2xl font-bold text-purple-900 mt-1">0/2</div>
                </div>
              </div>

              <div class="flex space-x-3 mb-6">
                <button onclick="runUser()" class="flex-1 bg-blue-600 text-white px-4 py-3 rounded-md hover:bg-blue-700 transition font-medium">
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
                      <label class="block text-sm font-medium text-gray-700 mb-2">账号名称</label>
                      <input id="configAccountHandle" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="例如: @myaccount">
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

              <div id="platformsList" class="space-y-3">
                <!-- Platforms will be rendered here by JavaScript -->
              </div>

              <div class="mt-6">
                <button onclick="savePlatformConfig()" class="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition font-medium">
                  保存平台配置
                </button>
              </div>

              <div class="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div class="flex">
                  <div class="flex-shrink-0">
                    <svg class="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
                    </svg>
                  </div>
                  <div class="ml-3">
                    <h3 class="text-sm font-medium text-blue-800">平台说明</h3>
                    <div class="mt-2 text-sm text-blue-700 space-y-1">
                      <p><strong>需要 Cookie：</strong>抖音、小红书需要登录后获取 Cookie</p>
                      <p><strong>免费平台：</strong>HackerNews、GitHub、知乎、Reddit、V2EX 可直接使用</p>
                      <p><strong>需要 Token：</strong>X (Twitter)、ProductHunt 需要申请 API Token</p>
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
                <pre id="logs" class="text-xs text-gray-600 whitespace-pre-wrap font-mono">加载中...</pre>
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

    // Platform definitions
    const platforms = [
      { id: 'x', name: 'X (Twitter)', icon: '𝕏', color: 'bg-black', needsAuth: 'token', description: '需要 API Token' },
      { id: 'hackernews', name: 'Hacker News', icon: 'HN', color: 'bg-orange-500', needsAuth: false, description: '免费使用' },
      { id: 'github', name: 'GitHub Trending', icon: 'GH', color: 'bg-gray-800', needsAuth: false, description: '免费使用' },
      { id: 'zhihu', name: '知乎', icon: '知', color: 'bg-blue-600', needsAuth: false, description: '免费使用' },
      { id: 'producthunt', name: 'Product Hunt', icon: 'PH', color: 'bg-red-500', needsAuth: 'token', description: '需要 API Token' },
      { id: 'reddit', name: 'Reddit', icon: 'RD', color: 'bg-orange-600', needsAuth: false, description: '免费使用' },
      { id: 'v2ex', name: 'V2EX', icon: 'V2', color: 'bg-gray-700', needsAuth: false, description: '免费使用' },
      { id: 'douyin', name: '抖音', icon: '抖', color: 'bg-black', needsAuth: 'cookie', description: '需要 Cookie' },
      { id: 'xiaohongshu', name: '小红书', icon: '小', color: 'bg-red-500', needsAuth: 'cookie', description: '需要 Cookie' }
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
        const response = await fetch(path, {
          headers: {'content-type': 'application/json'},
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
        const container = document.getElementById('users');
        container.innerHTML = users.map(u => \`
          <button
            onclick="selectUser('\${u.userId}')"
            class="w-full text-left px-3 py-2 rounded-md hover:bg-gray-50 border border-gray-200 transition"
          >
            <div class="font-medium text-gray-900">\${u.userId}</div>
            <div class="text-xs text-gray-500 mt-1">\${u.enabledSources.join(', ') || '未配置'}</div>
          </button>
        \`).join('');
      } catch (error) {
        console.error('Failed to load users:', error);
      }
    }

    function selectUser(id) {
      document.getElementById('userId').value = id;
      loadUser();
    }

    // Load user config
    async function loadUser() {
      try {
        const id = document.getElementById('userId').value || 'local';
        currentUserId = id;
        const data = await request(\`/api/users/\${encodeURIComponent(id)}\`);
        currentConfig = data;

        document.getElementById('config').value = JSON.stringify(data, null, 2);
        updateOverview(data);
        updatePlatformStatus(data);
        showToast('配置加载成功');
      } catch (error) {
        console.error('Failed to load user:', error);
      }
    }

    // Update overview
    function updateOverview(config) {
      const enabledSources = Object.keys(config.sources).filter(key => config.sources[key].enabled);
      document.getElementById('enabledSourcesCount').textContent = enabledSources.length;
      document.getElementById('scheduleStatus').textContent = config.schedule?.cronSchedule || '未设置';

      const connections = [config.sources.douyin?.cookie, config.sources.xiaohongshu?.cookie].filter(Boolean).length;
      document.getElementById('connectionCount').textContent = \`\${connections}/2\`;
    }

    // Update platform status
    function updatePlatformStatus(config) {
      const container = document.getElementById('platformsList');
      if (!container) return;

      const html = platforms.map(platform => {
        const isEnabled = config.sources[platform.id]?.enabled || false;
        const hasAuth = platform.needsAuth === 'cookie'
          ? Boolean(config.sources[platform.id]?.cookie)
          : platform.needsAuth === 'token'
          ? Boolean(config.sources[platform.id]?.token)
          : true;

        const statusBadge = !platform.needsAuth || hasAuth
          ? '<span class="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">可用</span>'
          : '<span class="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">需配置</span>';

        const toggleClass = isEnabled ? 'bg-blue-600' : 'bg-gray-200';
        const toggleSpanClass = isEnabled ? 'translate-x-6' : 'translate-x-1';

        let authSection = '';
        if (platform.needsAuth === 'cookie') {
          authSection = \`
            <div class="mt-3 pt-3 border-t border-gray-200">
              <div class="flex space-x-2">
                <input
                  id="\${platform.id}Cookie"
                  type="text"
                  placeholder="粘贴 \${platform.name} Cookie"
                  class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                <button onclick="saveCookie('\${platform.id}')" class="bg-gray-600 text-white px-4 py-2 text-sm rounded-md hover:bg-gray-700 transition">
                  保存
                </button>
              </div>
            </div>
          \`;
        } else if (platform.needsAuth === 'token') {
          authSection = \`
            <div class="mt-3 pt-3 border-t border-gray-200">
              <div class="flex space-x-2">
                <input
                  id="\${platform.id}Token"
                  type="text"
                  placeholder="粘贴 \${platform.name} API Token"
                  class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                <button onclick="saveToken('\${platform.id}')" class="bg-gray-600 text-white px-4 py-2 text-sm rounded-md hover:bg-gray-700 transition">
                  保存
                </button>
              </div>
            </div>
          \`;
        }

        return \`
          <div class="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition">
            <div class="flex items-center justify-between">
              <div class="flex items-center flex-1">
                <div class="w-10 h-10 \${platform.color} rounded-lg flex items-center justify-center text-white font-bold text-sm">
                  \${platform.icon}
                </div>
                <div class="ml-3 flex-1">
                  <h3 class="font-semibold text-gray-900">\${platform.name}</h3>
                  <p class="text-sm text-gray-500">\${platform.description}</p>
                </div>
              </div>
              <div class="flex items-center space-x-3">
                \${statusBadge}
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
            \${authSection}
          </div>
        \`;
      }).join('');

      container.innerHTML = html;
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

    // Save token
    async function saveToken(platform) {
      try {
        const id = currentUserId;
        const input = \`\${platform}Token\`;
        const value = document.getElementById(input).value;

        if (!value) {
          showToast('请输入 Token', 'error');
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
        showToast(\`\${platform} Token 保存成功\`);
      } catch (error) {
        console.error('Failed to save token:', error);
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

      // Profile - need to read from profile file
      // For now, leave empty as profile is in separate file

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
      document.getElementById('configFeishuAppSecret').value = config.lark?.appSecret || '';
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

        // Build config object
        const payload = {
          ...currentConfig,
          userId: document.getElementById('configUserId').value,
          accountHandle: document.getElementById('configAccountHandle').value,
          schedule: {
            cronSchedule: cronSchedule,
            timezone: document.getElementById('configTimezone').value
          },
          lark: {
            appId: document.getElementById('configFeishuAppId').value,
            appSecret: document.getElementById('configFeishuAppSecret').value,
            baseId: document.getElementById('configFeishuBaseId').value,
            defaultReceiverId: document.getElementById('configFeishuReceiverId').value
          }
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

          // Save profile via API (you'll need to add this endpoint)
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
          'douyin': '抖音',
          'xiaohongshu': '小红书'
        };
        showToast(\`\${platformNames[platform] || platform} Cookie 保存成功\`);
      } catch (error) {
        console.error('Failed to save cookie:', error);
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
        document.getElementById('logs').textContent = JSON.stringify(runs, null, 2);
      } catch (error) {
        console.error('Failed to load logs:', error);
      }
    }

    // Initialize
    loadUsers();
    loadUser();
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
  new AdminServer(db, repository, queue).start(port);
}

if (process.argv[1]?.endsWith('admin-server.ts') || process.argv[1]?.endsWith('admin-server.js')) {
  main();
}
