# X 账号内容策划助手 - 设计文档

**项目名称：** x-content-scout  
**创建日期：** 2026-05-12  
**设计版本：** v1.0

## 一、项目概述

### 1.1 目标

为 X 账号 (@rabbitrun_eth) 提供智能内容策划服务：
- 每日自动发现适合账号定位的热门话题
- 生成符合个人风格的推文草稿
- 通过飞书推送建议，用户手动发布

### 1.2 核心价值

- **智能适配**：AI 分析账号画像，只推荐真正适合的话题
- **风格模仿**：学习历史推文风格，生成高质量草稿
- **效率提升**：从"找话题+写推文"变成"选草稿+发布"
- **持续优化**：反馈闭环，越用越准

### 1.3 与 x-operator 的关系

- **独立系统**：专注话题发现和草稿生成
- **互补定位**：x-operator 负责发布流程，本系统负责内容策划
- **可选集成**：未来可考虑数据互通

## 二、系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     定时任务调度器                            │
│                   (node-cron: 每日 9:00)                     │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                   内容聚合层 (Aggregator)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ X Crawler│  │知乎 Crawler│ │HN API    │  │GitHub API│   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│  │PH API    │  │Reddit API│  │V2EX API  │                 │
│  └──────────┘  └──────────┘  └──────────┘                 │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                账号画像引擎 (Profile Engine)                  │
│  - 历史推文分析 (最近 200 条)                                 │
│  - 互动记录分析 (点赞/转发/回复)                              │
│  - Bio 和定位提取                                            │
│  - DeepSeek 生成账号画像向量                                 │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│              智能过滤引擎 (Filter Engine)                      │
│  Stage 1: Embedding 相似度计算 (OpenAI text-embedding-3)    │
│  Stage 2: DeepSeek 精排 (适配度打分 0-10)                    │
│  输出: Top 3-5 条高适配内容                                   │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│              内容生成引擎 (Generator Engine)                   │
│  - 分析历史推文风格 (语气/结构/emoji/长度)                     │
│  - DeepSeek 生成 2-3 个草稿变体                              │
│  - 每个草稿附带生成理由                                       │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                飞书推送层 (Feishu Layer)                       │
│  - 长连接接收用户反馈                                         │
│  - Interactive Card 展示推荐                                 │
│  - 按钮: [复制草稿] [修改] [不感兴趣] [查看原文]              │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                反馈学习层 (Feedback Loop)                      │
│  - 记录用户选择和修改                                         │
│  - 更新账号画像权重                                           │
│  - 优化推荐策略                                               │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
热点内容 (100-200条)
  → Embedding 向量化
  → 与账号画像计算相似度
  → Top 20 候选
  → DeepSeek 精排打分
  → Top 3-5 推荐
  → 生成 9-15 个草稿
  → 飞书推送
  → 用户反馈
  → 更新画像
```

## 三、数据模型

### 3.1 数据库设计 (SQLite)

```sql
-- 账号画像表
CREATE TABLE account_profile (
  id INTEGER PRIMARY KEY,
  account_handle TEXT NOT NULL,
  bio TEXT,
  topics JSON,              -- ["AI开发", "开发工具", "技术观察"]
  writing_style JSON,       -- {tone, structure, emoji_usage, avg_length}
  interest_vector TEXT,     -- embedding 向量
  last_updated TIMESTAMP,
  tweet_count INTEGER       -- 分析的推文数量
);

-- 内容池表
CREATE TABLE content_pool (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,     -- 'twitter', 'zhihu', 'hackernews', etc.
  title TEXT,
  content TEXT,
  url TEXT UNIQUE,
  author TEXT,
  published_at TIMESTAMP,
  metrics JSON,             -- {likes, comments, shares}
  collected_at TIMESTAMP,
  embedding_vector TEXT     -- 内容的 embedding
);

-- 推荐记录表
CREATE TABLE recommendations (
  id INTEGER PRIMARY KEY,
  content_id INTEGER,
  match_score REAL,         -- 0-10 适配度分数
  match_reason TEXT,        -- AI 生成的匹配原因
  drafts JSON,              -- [{draft, style, reasoning}]
  recommended_at TIMESTAMP,
  status TEXT,              -- 'pending', 'accepted', 'rejected', 'modified'
  user_feedback TEXT,       -- 用户的修改或评论
  FOREIGN KEY (content_id) REFERENCES content_pool(id)
);

-- 反馈学习表
CREATE TABLE feedback_log (
  id INTEGER PRIMARY KEY,
  recommendation_id INTEGER,
  action TEXT,              -- 'accept', 'reject', 'modify', 'view_source'
  modified_draft TEXT,      -- 如果用户修改了草稿
  created_at TIMESTAMP,
  FOREIGN KEY (recommendation_id) REFERENCES recommendations(id)
);
```

## 四、核心模块设计

### 4.1 内容聚合模块 (Aggregator)

**职责：** 从 7 个平台抓取热门内容

**数据源：**
1. **X (Twitter)** - Puppeteer 爬虫
   - 搜索 AI/开发相关关键词
   - 抓取热门推文 (点赞 > 100)
   
2. **知乎** - Puppeteer 爬虫
   - 热榜前 50
   - 特定话题 (人工智能、编程)
   
3. **Hacker News** - 官方 API
   - Top stories
   - Best stories
   
4. **GitHub Trending** - 官方 API
   - Daily trending (All languages)
   - Weekly trending
   
5. **Product Hunt** - 官方 API
   - Today's top products
   
6. **Reddit** - 官方 API
   - r/programming, r/MachineLearning, r/artificial
   - Hot posts
   
7. **V2EX** - API/爬虫
   - 热门主题

**去重策略：**
- URL 完全匹配
- 标题 embedding 相似度 > 0.9

**输出：** 100-200 条去重后的内容

### 4.2 账号画像引擎 (Profile Engine)

**职责：** 建立账号的兴趣模型和写作风格

**分析维度：**

1. **历史推文分析** (最近 200 条)
   - 主题分布
   - 语气特征 (专业/轻松/幽默)
   - 结构模式 (观点型/分享型/提问型)
   - Emoji 使用频率和类型
   - 平均长度

2. **互动记录分析** (最近 500 条)
   - 点赞的推文主题
   - 转发的内容类型
   - 回复的话题偏好

3. **Bio 分析**
   - 账号定位
   - 目标受众

**输出：**
```json
{
  "topics": ["AI开发工具", "LLM应用", "开发者工具", "技术观察"],
  "writingStyle": {
    "tone": "专业但轻松",
    "structure": "观点+案例+总结",
    "emoji": "适度使用，偏向技术类emoji",
    "avgLength": 150
  },
  "interestVector": [0.23, 0.45, ...],  // 768维向量
  "audience": "开发者、AI从业者"
}
```

**更新策略：**
- 首次运行：完整分析 (20分钟)
- 每周增量更新 (分析最近 50 条新推文)

### 4.3 智能过滤引擎 (Filter Engine)

**两阶段过滤：**

**Stage 1: Embedding 快速初筛**
- 计算每条内容的 embedding 向量
- 与账号画像向量计算余弦相似度
- 筛选 Top 20 (相似度 > 0.6)
- 耗时：~30秒

**Stage 2: DeepSeek 精排**
- 输入：账号画像 + 20 条候选内容
- 任务：为每条内容打分 (0-10) 并说明原因
- 评分维度：
  - 话题相关性 (40%)
  - 受众匹配度 (30%)
  - 时效性 (20%)
  - 可发挥空间 (10%)
- 输出：Top 3-5 条 (分数 > 7)
- 耗时：~2分钟

### 4.4 内容生成引擎 (Generator Engine)

**职责：** 为筛选出的内容生成推文草稿

**生成策略：**

为每条内容生成 3 个不同风格的草稿：

1. **观点型**：提出见解和评论
2. **分享型**：简洁介绍 + 推荐理由
3. **提问型**：引发讨论的角度

**风格模仿：**
- 分析历史推文的语气、结构、用词
- 严格控制长度 (±20 字符)
- 自然融入 emoji (如果账号常用)

**质量保证：**
- 长度检查 (不超过 280 字符)
- 链接处理 (放在末尾)
- 每个草稿附带生成理由

### 4.5 飞书推送模块 (Feishu Layer)

**Interactive Card 设计：**

```
┌─────────────────────────────────────────┐
│ 💡 推荐话题 (适配度: 8.5/10)             │
├─────────────────────────────────────────┤
│ **标题：** DeepSeek V3 开源引发热议      │
│ 来源: Hacker News                       │
├─────────────────────────────────────────┤
│ **为什么推荐：**                         │
│ 这个话题与你之前发布的 AI 工具评测内容   │
│ 高度相关，且当前热度很高，适合你的粉丝   │
│ 画像。                                  │
├─────────────────────────────────────────┤
│ **草稿 1 (观点型)：**                    │
│ DeepSeek V3 开源了，性能接近 GPT-4 但    │
│ 成本只有 1/10。这对开发者来说是个好消息， │
│ 终于可以用得起高质量 LLM 了 🚀           │
│                                         │
│ _理由：符合你的技术观察风格，强调实用价值_ │
├─────────────────────────────────────────┤
│ **草稿 2 (分享型)：**                    │
│ 推荐关注 DeepSeek V3，开源的高性能 LLM。  │
│ 如果你在做 AI 应用，这个模型值得试试。    │
│ [链接]                                  │
│                                         │
│ _理由：简洁分享型，适合快速传播_          │
├─────────────────────────────────────────┤
│ **草稿 3 (提问型)：**                    │
│ DeepSeek V3 开源后，大家会考虑从 OpenAI  │
│ 迁移吗？成本降低 90% 但需要自己部署，     │
│ 这个 trade-off 你怎么看？                │
│                                         │
│ _理由：引发讨论，增加互动_                │
├─────────────────────────────────────────┤
│ [📋 复制草稿1] [📋 复制草稿2] [📋 复制草稿3] │
│ [👎 不感兴趣] [🔗 查看原文]               │
└─────────────────────────────────────────┘
```

**交互处理：**
- 点击"复制草稿"：记录选择，回复确认
- 点击"不感兴趣"：记录拒绝，用于学习
- 点击"查看原文"：打开原始链接

### 4.6 反馈学习模块 (Feedback Loop)

**学习策略：**

1. **行为分析**
   - 统计接受/拒绝的话题特征
   - 分析用户偏好的草稿风格
   - 计算接受率

2. **画像更新**
   - 提高接受话题的权重
   - 降低拒绝话题的权重
   - 发现新的兴趣点

3. **触发条件**
   - 每 10 次反馈触发一次学习
   - 每周完整重新分析一次

## 五、工作流程

### 5.1 每日执行流程

```
09:00 定时任务触发
  ↓
09:00-09:10  内容聚合 (并发爬取 7 个平台)
  ↓
09:10-09:12  智能过滤 Stage 1 (Embedding 初筛)
  ↓
09:12-09:14  智能过滤 Stage 2 (DeepSeek 精排)
  ↓
09:14-09:19  内容生成 (为 3-5 条内容生成草稿)
  ↓
09:19-09:20  飞书推送 (发送 Interactive Cards)
  ↓
全天         等待用户反馈 (异步处理)
```

**总耗时：** 约 20 分钟

### 5.2 首次运行流程

```
首次运行
  ↓
账号画像建立 (20分钟)
  - 爬取历史推文 200 条
  - 爬取互动记录 500 条
  - DeepSeek 分析
  - 生成 embedding 向量
  ↓
进入正常流程
```

## 六、技术栈

### 6.1 核心依赖

```json
{
  "dependencies": {
    "typescript": "^5.0.0",
    "puppeteer": "^21.0.0",
    "axios": "^1.6.0",
    "cheerio": "^1.0.0",
    "openai": "^4.0.0",
    "@larksuiteoapi/node-sdk": "^1.29.0",
    "better-sqlite3": "^9.0.0",
    "node-cron": "^3.0.0",
    "dotenv": "^16.0.0",
    "winston": "^3.11.0",
    "date-fns": "^3.0.0"
  }
}
```

### 6.2 AI 服务

- **DeepSeek V3**：账号分析、内容精排、草稿生成
- **OpenAI Embedding**：text-embedding-3-small (向量化)

### 6.3 环境变量

```bash
# DeepSeek API
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com

# OpenAI (仅用于 embedding)
OPENAI_API_KEY=sk-xxx

# 飞书
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_BOT_NAME=内容策划助手

# X 账号
X_ACCOUNT_HANDLE=rabbitrun_eth

# 调度
CRON_SCHEDULE=0 9 * * *

# 数据库
DB_PATH=./data/scout.db

# 日志
LOG_LEVEL=info
```

## 七、成本估算

### 7.1 DeepSeek V3 成本

**定价：**
- 输入：$0.27/M tokens
- 输出：$1.1/M tokens

**每日用量：**
- 账号画像分析（首次）：~$0.016
- 内容过滤精排：~$0.004
- 草稿生成：~$0.007
- 反馈学习（每周）：~$0.002

**总成本：**
- 每日：~$0.011
- 每月：~$0.33

### 7.2 OpenAI Embedding 成本

- text-embedding-3-small: $0.02/M tokens
- 每日 ~100 条内容：~$0.002
- 每月：~$0.06

### 7.3 总成本

**每月约 $0.4**

## 八、项目结构

```
x-content-scout/
├── package.json
├── tsconfig.json
├── .env
├── .gitignore
├── README.md
│
├── src/
│   ├── index.ts                 # 入口文件
│   ├── scheduler.ts             # 定时任务调度
│   │
│   ├── aggregator/              # 内容聚合层
│   │   ├── index.ts
│   │   ├── base.ts              # ContentSource 接口
│   │   ├── twitter.ts           # X 爬虫
│   │   ├── zhihu.ts             # 知乎爬虫
│   │   ├── hackernews.ts        # HN API
│   │   ├── github.ts            # GitHub Trending API
│   │   ├── producthunt.ts       # Product Hunt API
│   │   ├── reddit.ts            # Reddit API
│   │   └── v2ex.ts              # V2EX API
│   │
│   ├── profile/                 # 账号画像引擎
│   │   ├── index.ts
│   │   ├── analyzer.ts          # 推文和互动分析
│   │   └── updater.ts           # 画像更新逻辑
│   │
│   ├── filter/                  # 智能过滤引擎
│   │   ├── index.ts
│   │   ├── embedding.ts         # Embedding 初筛
│   │   └── ranking.ts           # AI 精排
│   │
│   ├── generator/               # 内容生成引擎
│   │   ├── index.ts
│   │   └── style-analyzer.ts    # 风格分析
│   │
│   ├── feishu/                  # 飞书推送层
│   │   ├── index.ts
│   │   ├── client.ts            # 飞书 SDK 封装
│   │   ├── cards.ts             # Interactive Card 模板
│   │   └── handler.ts           # 用户交互处理
│   │
│   ├── feedback/                # 反馈学习层
│   │   ├── index.ts
│   │   └── learner.ts
│   │
│   ├── db/                      # 数据库层
│   │   ├── index.ts
│   │   ├── schema.sql
│   │   └── models.ts            # 数据模型
│   │
│   ├── ai/                      # AI 服务封装
│   │   ├── deepseek.ts          # DeepSeek 客户端
│   │   └── embedding.ts         # OpenAI Embedding
│   │
│   └── utils/
│       ├── logger.ts
│       ├── dedup.ts             # 去重工具
│       └── retry.ts             # 重试逻辑
│
├── data/
│   ├── scout.db                 # SQLite 数据库
│   └── cookies/                 # 爬虫 cookies
│
└── logs/
    ├── app.log
    └── error.log
```

## 九、部署方案

### 9.1 部署步骤

```bash
# 1. 克隆项目
git clone <repo> x-content-scout
cd x-content-scout

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 API keys

# 4. 初始化数据库
npm run db:init

# 5. 首次运行（建立账号画像）
npm run init

# 6. 启动服务
npm start

# 或使用 PM2
pm2 start src/index.ts --name x-scout
```

### 9.2 监控和维护

**日志监控：**
```bash
# 查看运行日志
tail -f logs/app.log

# 查看错误日志
tail -f logs/error.log
```

**定期维护：**
- 每周更新账号画像
- 每月清理过期内容（30天前）
- 每季度检查爬虫是否需要更新

### 9.3 错误处理

**容错策略：**
- 单个爬虫失败不影响整体流程
- DeepSeek API 失败：重试 3 次，指数退避
- 飞书推送失败：重试 2 次
- 关键错误：通过飞书发送告警

## 十、安全和隐私

### 10.1 数据安全

- X cookies 加密存储
- 飞书 token 环境变量管理
- 数据库文件权限限制 (chmod 600)
- 不记录推文完整内容，只存摘要

### 10.2 API 密钥管理

- 所有密钥通过环境变量配置
- .env 文件加入 .gitignore
- 生产环境使用密钥管理服务

## 十一、未来优化方向

### 11.1 短期优化 (1-3个月)

- [ ] 支持多账号管理
- [ ] 添加图片推荐（配图建议）
- [ ] 优化草稿生成质量
- [ ] 增加更多数据源

### 11.2 中期优化 (3-6个月)

- [ ] 发布时间推荐（最佳发布时机）
- [ ] 话题趋势预测
- [ ] A/B 测试不同草稿风格
- [ ] 与 x-operator 数据互通

### 11.3 长期优化 (6-12个月)

- [ ] 自动发布能力
- [ ] 多平台支持（小红书、知乎等）
- [ ] 数据分析面板
- [ ] 团队协作功能

## 十二、风险和挑战

### 12.1 技术风险

- **爬虫稳定性**：平台反爬策略变化
  - 缓解：多数据源冗余，单个失败不影响整体
  
- **API 成本**：用量超预期
  - 缓解：设置每日成本上限，超限暂停

- **AI 质量**：生成内容不符合预期
  - 缓解：持续优化 prompt，收集反馈

### 12.2 产品风险

- **推荐准确度**：初期可能不够精准
  - 缓解：反馈学习机制，2-4周后显著改善

- **用户接受度**：草稿风格可能不符合预期
  - 缓解：提供多个风格选项，用户可修改

## 十三、成功指标

### 13.1 核心指标

- **推荐接受率**：> 40% (用户采纳推荐的比例)
- **草稿采用率**：> 60% (用户直接使用或轻微修改草稿)
- **每日推送数量**：3-5 条
- **系统可用性**：> 95%

### 13.2 质量指标

- **话题相关性**：用户评分 > 7/10
- **草稿质量**：用户评分 > 7/10
- **时效性**：推荐内容发布时间 < 24小时

## 十四、总结

本系统通过 AI 驱动的智能推荐，将 X 账号内容创作从"找话题+写推文"简化为"选草稿+发布"，预计可节省 70% 的内容创作时间，同时保持内容质量和账号风格的一致性。

系统采用独立架构，成本可控（每月 $0.4），技术栈成熟，可快速实施。通过反馈学习机制，系统会持续优化，越用越准。
