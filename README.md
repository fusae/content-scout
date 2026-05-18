# X Content Scout

面向 X 创作者的内容搜集、筛选、草稿生成和飞书推送助手。

## 项目结构

```
src/
├── index.ts                 # 入口文件
├── config.ts                # 配置管理
├── db/
│   ├── index.ts             # 数据库访问层
│   ├── schema.sql           # 数据库 schema
│   └── init.ts              # 数据库初始化脚本
└── utils/
    ├── logger.ts            # 日志工具
    ├── retry.ts             # 重试工具
    └── rate-limiter.ts      # 限流工具
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量和私有画像

复制模板并填写配置：

```bash
cp .env.example .env
cp config/profile.example.json config/profile.local.json
```

`.env` 至少填写：

```bash
PROFILE_PATH=./config/profile.local.json
EMBEDDING_API_KEY=your_dashscope_api_key
LARK_APP_ID=your_lark_app_id
LARK_APP_SECRET=your_lark_app_secret
X_ACCOUNT_HANDLE=your_x_handle
REDDIT_SUBREDDITS=LocalLLaMA,OpenAI,ChatGPT,artificial,MachineLearning,programming,startups,technology
```

`config/profile.local.json` 用来存放你的账号画像、兴趣和样例内容；它已被 `.gitignore` 排除，不会进入仓库。

### 3. 初始化数据库

```bash
npm run db:init
```

### 4. 运行项目

开发模式：
```bash
npm run dev
```

生产模式：
```bash
npm run build
npm start
```

## 可用命令

- `npm run build` - 编译 TypeScript
- `npm run dev` - 开发模式运行
- `npm start` - 运行编译后的代码
- `npm run db:init` - 初始化数据库
- `npm run lint` - 代码检查
- `npm run format` - 代码格式化

## 数据库表结构

### account_profile (账号画像)
- 存储 X 账号的基本信息和兴趣向量

### content_pool (内容池)
- 存储收集的内容素材

### recommendations (推荐记录)
- 存储内容推荐和匹配结果

### feedback_log (反馈日志)
- 存储用户反馈用于学习优化

## 技术栈

- TypeScript 5.3+
- Node.js 20+
- SQLite (better-sqlite3)
- Winston (日志)
- 阿里云百炼 Embedding
- 飞书 API

## 开源约定

- 仓库只保留通用画像样例，真实画像请放在 `config/profile.local.json`
- `.env`、`data/*.db*`、`logs/`、`dist/` 都不会进入版本控制

## 内容渠道

- 可直接运行：Hacker News、GitHub Trending、知乎日报、Reddit RSS、V2EX
- 需要凭证：Product Hunt（`PRODUCTHUNT_API_TOKEN`）
- 暂不处理：X（`X_BEARER_TOKEN`，API 成本较高）

## Phase 1 完成状态

- ✅ 项目初始化和配置
- ✅ 数据库设计和实现
- ✅ 配置管理系统
- ✅ 日志系统
- ✅ 重试工具（指数退避）
- ✅ 速率限制工具
- ✅ 编译和运行验证
