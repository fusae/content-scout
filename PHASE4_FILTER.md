# Phase 4: 智能过滤引擎

## 概述

智能过滤引擎从聚合的内容中筛选出最适合账号的推荐内容，采用两阶段过滤策略：

1. **Embedding 初筛**：使用向量相似度快速筛选候选内容（100 → 20）
2. **AI 精排**：使用 DeepSeek 深度评分和排序（20 → 3-5）

## 架构

```
FilterEngine
├── EmbeddingFilter (初筛)
│   ├── 批量向量化
│   ├── 余弦相似度计算
│   └── Top-K 筛选
├── AIRanker (精排)
│   ├── 构建评分 Prompt
│   ├── DeepSeek API 调用
│   └── JSON 结果解析
└── 过滤策略
    ├── 时效性加权
    ├── 多样性控制
    └── 黑名单过滤
```

## 核心组件

### 1. EmbeddingFilter

**功能**：使用向量相似度进行初筛

**特性**：
- 自动为缺失向量的内容生成 embedding
- 批量处理优化（每次最多 100 条）
- 向量缓存到数据库

**算法**：余弦相似度
```typescript
similarity = dot(vecA, vecB) / (norm(vecA) * norm(vecB))
```

### 2. AIRanker

**功能**：使用 DeepSeek 进行深度评分

**评分维度**：
- 话题相关性 (40%)
- 受众匹配度 (30%)
- 时效性 (20%)
- 可发挥空间 (10%)

**输出**：JSON 格式的评分结果
```json
[{
  "id": 1,
  "score": 8.5,
  "reason": "匹配原因",
  "dimensions": {
    "topicRelevance": 9,
    "audienceMatch": 8,
    "timeliness": 8,
    "potential": 9
  }
}]
```

### 3. 过滤策略

#### 时效性加权
- 6小时内：1.0x
- 24小时内：0.8x
- 48小时内：0.5x
- 更早：0.2x

#### 多样性控制
- 每个来源最多保留 N 条（默认 2）
- 确保推荐内容来源多样化

#### 黑名单过滤
- 支持关键词黑名单
- 过滤用户不感兴趣的主题

## 使用方法

### 基本用法

```typescript
import { FilterEngine } from './filter/index.js';
import { EmbeddingClient } from './ai/embedding.js';
import { DeepSeekClient } from './ai/deepseek.js';
import { DatabaseManager } from './db/index.js';

// 初始化
const embeddingClient = new EmbeddingClient(openaiKey);
const deepseekClient = new DeepSeekClient(deepseekKey);
const db = new DatabaseManager(dbPath);
const filterEngine = new FilterEngine(embeddingClient, deepseekClient, db);

// 执行过滤
const { contents, stats } = await filterEngine.filter(profile, {
  topK: 20,              // Embedding 初筛保留数量
  finalCount: 5,         // 最终返回数量
  minAiScore: 7.0,       // AI 最低分数阈值
  enableTimeBoost: true, // 启用时效性加权
  enableDiversity: true, // 启用多样性控制
  maxPerSource: 2,       // 每个来源最多保留数量
  blacklist: ['广告', '推广'], // 黑名单关键词
});

// 查看结果
console.log(`筛选结果: ${stats.finalOutput} 条`);
contents.forEach(item => {
  console.log(`${item.rank}. ${item.content.title}`);
  console.log(`   分数: ${item.aiScore}/10`);
  console.log(`   原因: ${item.aiReason}`);
});
```

### 测试脚本

```bash
# 运行过滤引擎测试
npm run test:filter
```

测试脚本会：
1. 加载账号画像
2. 从数据库获取最近的内容
3. 执行完整的过滤流程
4. 显示推荐结果和统计信息
5. 保存推荐到数据库

## 配置选项

### FilterOptions

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| topK | number | 20 | Embedding 初筛保留数量 |
| finalCount | number | 5 | 最终返回数量 |
| minAiScore | number | 7.0 | AI 最低分数阈值 (0-10) |
| enableTimeBoost | boolean | true | 是否启用时效性加权 |
| enableDiversity | boolean | true | 是否启用多样性控制 |
| maxPerSource | number | 2 | 每个来源最多保留数量 |
| blacklist | string[] | [] | 黑名单关键词列表 |

## 性能优化

### 1. 向量缓存
- 内容向量生成后缓存到数据库
- 避免重复计算

### 2. 批量处理
- Embedding API 批量调用（每次最多 100 条）
- 减少网络请求次数

### 3. 降级策略
- AI 精排失败时，降级到 Embedding 排序
- 无结果时自动降低阈值重试

## 统计信息

FilterStats 包含以下信息：

```typescript
{
  totalInput: 100,        // 输入内容数
  afterEmbedding: 20,     // Embedding 初筛后数量
  afterAI: 8,             // AI 精排后数量
  finalOutput: 5,         // 最终输出数量
  embeddingDuration: 1200, // Embedding 耗时 (ms)
  aiDuration: 3500,       // AI 精排耗时 (ms)
  totalDuration: 4800     // 总耗时 (ms)
}
```

## 数据库扩展

新增方法：

```typescript
// 获取最近 N 小时的内容
getRecentContents(hours: number): ContentPool[]

// 批量获取内容
getContentsByIds(ids: number[]): ContentPool[]

// 更新内容的 embedding 向量
updateContentEmbedding(id: number, vector: string): void
```

## 错误处理

### 1. Embedding 生成失败
- 自动重试（指数退避）
- 记录错误日志

### 2. AI 精排失败
- 降级到 Embedding 排序
- 返回原始候选列表

### 3. JSON 解析失败
- 尝试提取 JSON 数组
- 返回空结果并记录日志

### 4. 无结果处理
- 自动降低阈值重试（7.0 → 6.0）
- 仍无结果则返回空列表

## 日志记录

过滤引擎会记录详细的日志信息：

```
=== Starting Filter Engine ===
Profile: @example_creator
Options: topK=20, finalCount=5, minScore=7.0
Fetched 100 recent contents from database
Starting embedding filter: 100 contents -> top 20
Contents: 80 with vectors, 20 without
Generating embeddings for 20 contents
Embedding filter completed: 20 results (1200ms)
Similarity range: 0.856 - 0.623
Starting AI ranking: 20 candidates, minScore=7.0
AI ranking completed: 8 results (3500ms)
Score range: 8.5 - 7.2
Diversity filter removed 3 items (maxPerSource=2)
=== Filter Engine Completed ===
Pipeline: 100 → 20 → 8 → 5
Duration: embedding=1200ms, ai=3500ms, total=4800ms
```

## 验收标准

- ✅ 初筛能从 100 条筛选到 20 条
- ✅ 精排能从 20 条筛选到 3-5 条
- ✅ 筛选结果与账号画像高度相关
- ✅ 代码通过 TypeScript 编译
- ✅ 日志记录详细（耗时、分数分布）
- ✅ 向量缓存到数据库
- ✅ 批量处理优化
- ✅ 错误处理和降级策略

## 下一步

Phase 5 将实现：
- 发布草稿生成
- 飞书 Base 集成
- 用户反馈收集
- 持续学习优化
