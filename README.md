# Content Scout

**AI 驱动的内容策划助手** - 自动发现热门话题，智能筛选匹配内容，生成个性化草稿，通过飞书推送建议。

## 这是什么？

Content Scout 是一个自动化内容策划工具，帮助内容创作者：

- 🔍 **自动发现**：每天从 7 个平台（Hacker News、GitHub Trending、知乎、Reddit、V2EX、Product Hunt、X）爬取热门内容
- 🎯 **智能筛选**：基于你的账号画像，用 AI 从 100+ 条内容中筛选出 3-5 条最匹配的
- ✍️ **生成草稿**：为每条内容生成 3 种风格的草稿（观点型、分享型、提问型），模仿你的写作风格
- 📱 **飞书推送**：通过飞书卡片展示推荐内容和草稿，一键复制使用
- 🔄 **持续学习**：根据你的反馈不断优化推荐质量

## 适合谁？

- 内容创作者（X/Twitter、小红书、知乎等平台）
- 需要持续输出内容但缺少选题灵感
- 想要自动化内容策划流程
- 希望保持个人风格的同时提高效率

## 核心特性

### 🤖 AI 驱动的智能匹配
- 使用 Embedding 向量相似度进行初筛
- 使用 DeepSeek V4 进行深度分析和精排
- 多维度评分：话题相关性、受众匹配、时效性、可发挥空间

### 🎨 个性化风格模仿
- 分析你的历史内容风格
- 严格控制字数和语气
- 生成符合个人风格的草稿

### 💰 低成本运行
- 每月 API 费用约 **$0.4**
- 主要使用 DeepSeek V4（便宜且强大）
- Embedding 使用阿里云百炼（OpenAI 兼容）

### ⚡ 全自动运行
- 定时任务每天自动执行
- 10-20 分钟完成全流程
- 无需人工干预

## 快速开始

### 1. 克隆项目

```bash
git clone <your-repo-url>
cd x-content-scout
git checkout codex/public-release
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制模板并编辑：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填写以下**必需配置**：

```bash
# 阿里云百炼 API（用于 Embedding 向量化）
EMBEDDING_API_KEY=your_dashscope_api_key
EMBEDDING_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDING_MODEL=text-embedding-v4

# DeepSeek API（用于内容分析和生成）
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com

# 飞书配置（用于推送通知）
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_DEFAULT_RECEIVER_ID=ou_xxx  # 你的飞书用户 open_id

# 你的账号信息
ACCOUNT_HANDLE=your_handle

# 启用的内容源（可选）
ENABLED_SOURCES=hackernews,github,zhihu,reddit,v2ex
```

**API 申请指南：**

- **阿里云百炼**：访问 [百炼控制台](https://bailian.console.aliyun.com/)，创建 API Key
- **DeepSeek**：访问 [DeepSeek 平台](https://platform.deepseek.com/)，注册并创建 API Key
- **飞书应用**：访问 [飞书开放平台](https://open.feishu.cn/app)，创建企业自建应用，获取 App ID 和 Secret

### 4. 配置账号画像

复制模板并编辑：

```bash
cp config/profile.example.json config/profile.local.json
```

编辑 `config/profile.local.json`，填写你的账号信息：

```json
{
  "accountHandle": "your_handle",
  "bio": "你的账号简介",
  "topics": ["你关注的话题1", "话题2", "话题3"],
  "writingStyle": {
    "tone": "专业/轻松/幽默",
    "avgLength": 120,
    "emojiUsage": "经常/偶尔/很少",
    "structure": "你的内容结构特点"
  },
  "interests": ["兴趣1", "兴趣2"],
  "audience": "你的目标受众描述",
  "samplePosts": [
    {
      "text": "你的历史内容示例1",
      "likes": 10
    },
    {
      "text": "你的历史内容示例2",
      "likes": 15
    }
  ]
}
```

### 5. 初始化数据库

```bash
npm run db:init
```

### 6. 测试运行

```bash
# 测试内容聚合
npm run test:aggregator

# 测试完整工作流
npm run workflow
```

### 7. 启动应用

```bash
# 开发模式（立即执行一次）
npm run dev

# 生产模式（启动定时任务，每天 9:00 自动运行）
npm run build
npm start
```

## 工作流程

```
定时任务（每日 9:00）
  ↓
内容聚合（7 个平台，5-10 分钟）
  ↓
智能过滤（Embedding + AI，2-3 分钟）
  100 条 → 20 条 → 3-5 条
  ↓
草稿生成（3 种风格，3-5 分钟）
  ↓
飞书推送（Interactive Card，< 1 分钟）
  ↓
用户反馈（复制草稿/不感兴趣/查看原文）
  ↓
学习优化（累积 10 次反馈后自动触发）
```

**总耗时**：约 10-20 分钟

## 可用命令

```bash
# 开发
npm run dev              # 开发模式运行（立即执行一次）
npm run build            # 编译 TypeScript
npm start                # 生产模式运行（启动定时任务）

# 测试
npm run test:aggregator  # 测试内容聚合
npm run test:filter      # 测试智能过滤
npm run test:generator   # 测试草稿生成和飞书推送
npm run workflow         # 测试完整工作流

# 数据库
npm run db:init          # 初始化数据库

# 代码质量
npm run lint             # 代码检查
npm run format           # 代码格式化
```

## 项目结构

```
x-content-scout/
├── src/
│   ├── main.ts                  # 主入口
│   ├── config.ts                # 配置管理
│   ├── db/                      # 数据库层
│   │   ├── index.ts             # 数据库访问
│   │   ├── schema.sql           # 数据库 schema
│   │   └── init.ts              # 初始化脚本
│   ├── scrapers/                # 7 个平台爬虫
│   │   ├── hackernews.ts
│   │   ├── github.ts
│   │   ├── zhihu.ts
│   │   ├── reddit.ts
│   │   ├── v2ex.ts
│   │   ├── producthunt.ts
│   │   └── x.ts
│   ├── aggregator/              # 内容聚合器
│   ├── profile/                 # 账号画像引擎
│   ├── filter/                  # 智能过滤引擎
│   ├── generator/               # 内容生成引擎
│   ├── feishu/                  # 飞书推送层
│   ├── feedback/                # 反馈学习层
│   ├── scheduler/               # 定时任务调度
│   ├── ai/                      # AI 客户端
│   └── utils/                   # 工具类
├── config/
│   ├── profile.example.json     # 画像模板
│   └── profile.local.json       # 你的画像（不进入版本控制）
├── data/                        # 数据目录
│   └── scout.db                 # SQLite 数据库
├── logs/                        # 日志目录
└── docs/                        # 文档目录
```

## 数据库表结构

- **account_profile**：存储账号画像和兴趣向量
- **content_pool**：存储收集的内容素材
- **recommendations**：存储内容推荐和匹配结果
- **feedback_log**：存储用户反馈用于学习优化

## 内容源配置

通过 `ENABLED_SOURCES` 环境变量选择启用的内容源：

- **可直接运行**：`hackernews`、`github`、`zhihu`、`reddit`、`v2ex`
- **需要 API Token**：`producthunt`（需配置 `PRODUCTHUNT_API_TOKEN`）
- **成本较高**：`x`（需配置 `X_BEARER_TOKEN`，X API 费用较高）

示例：
```bash
ENABLED_SOURCES=hackernews,github,zhihu,reddit,v2ex
```

要添加新网站，不使用通用爬虫；让你的 coding agent 按 [docs/adding-content-source.md](docs/adding-content-source.md) 新增一个显式 scraper。

## 成本估算

### DeepSeek V4
- 每日：~$0.011
- 每月：~$0.33

### 阿里云百炼 Embedding
- 每日：~$0.002
- 每月：~$0.06

**总成本：每月约 $0.4**

## 常见问题

### Q: 如何获取飞书用户 open_id？
A: 在飞书中，进入"开发者后台" → "通讯录" → 搜索自己，复制 open_id。或者使用飞书 API 的 `/open-apis/contact/v3/users/me` 接口获取。

### Q: 为什么选择阿里云百炼而不是 OpenAI Embedding？
A: 阿里云百炼提供 OpenAI 兼容接口，价格更便宜，且在国内访问更稳定。如果你更喜欢 OpenAI，可以修改 `EMBEDDING_BASE_URL` 为 `https://api.openai.com/v1`。

### Q: 如何调整推荐频率？
A: 修改 `.env` 中的 `CRON_SCHEDULE`。例如：
- `0 9 * * *` - 每天 9:00
- `0 9,18 * * *` - 每天 9:00 和 18:00
- `0 */6 * * *` - 每 6 小时一次

### Q: 如何查看日志？
A: 运行 `tail -f logs/app.log` 查看实时日志。

### Q: 如何手动触发任务？
A: 运行 `npm run workflow` 手动执行完整工作流。

### Q: 爬虫会被封吗？
A: 项目使用了速率限制和重试机制，降低被封风险。如果某个平台频繁失败，可以在 `ENABLED_SOURCES` 中禁用它。

## 技术栈

- **语言**：TypeScript 5.3+ (strict mode)
- **运行时**：Node.js 20+
- **数据库**：SQLite (better-sqlite3)
- **爬虫**：Puppeteer
- **AI 服务**：
  - 阿里云百炼（Embedding）
  - DeepSeek V4（分析和生成）
- **消息推送**：飞书 SDK
- **定时任务**：node-cron
- **日志**：Winston

## 开源约定

- 仓库只保留通用画像样例，真实画像请放在 `config/profile.local.json`
- `.env`、`data/*.db*`、`logs/`、`dist/` 都不会进入版本控制
- 个人隐私信息不会被提交到仓库

## 贡献指南

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License
