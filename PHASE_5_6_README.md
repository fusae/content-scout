# Phase 5 & 6 实施文档

## 概述

Phase 5 和 Phase 6 实现了内容生成引擎和飞书推送层，完成了从内容聚合到推送的完整闭环。

### Phase 5: 内容生成引擎
- 为筛选后的内容生成 3 个不同风格的推文草稿
- 严格模仿用户的写作风格
- 自动控制字数和格式

### Phase 6: 飞书推送层
- 通过飞书机器人推送推荐内容
- 使用交互式卡片展示草稿
- 支持用户反馈和交互

## 目录结构

```
src/
├── generator/
│   ├── index.ts             # DraftGenerator 主类
│   ├── style-analyzer.ts    # 风格分析器
│   └── types.ts             # 草稿类型定义
├── feishu/
│   ├── index.ts             # FeishuClient 主类
│   ├── client.ts            # 飞书 SDK 封装
│   ├── cards.ts             # Interactive Card 构建器
│   ├── handler.ts           # 交互处理器
│   └── types.ts             # 飞书相关类型
├── test-generator-feishu.ts # Phase 5 & 6 测试
└── workflow.ts              # 完整工作流
```

## 环境配置

在 `.env` 文件中添加以下配置：

```bash
# DeepSeek API（用于草稿生成）
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com

# 飞书配置
LARK_APP_ID=cli_xxx
LARK_APP_SECRET=xxx
FEISHU_DEFAULT_RECEIVER_ID=ou_xxx  # 你的 open_id
```

### 获取飞书配置

1. **创建飞书应用**
   - 访问 [飞书开放平台](https://open.feishu.cn/)
   - 创建企业自建应用
   - 获取 App ID 和 App Secret

2. **配置权限**
   - 添加机器人能力
   - 开通以下权限：
     - `im:message`（发送消息）
     - `im:message.group_at_msg`（群聊 @ 消息）
     - `im:message.p2p_msg`（私聊消息）

3. **获取 open_id**
   - 发布应用并添加到群聊或私聊
   - 向机器人发送任意消息
   - 在飞书开放平台的「事件订阅」中查看日志，获取你的 `open_id`

## 使用方法

### 1. 测试草稿生成和飞书推送

```bash
npm run test:generator
```

这个测试会：
- 加载账号画像
- 获取最近的内容
- 生成推文草稿
- 推送到飞书（如果配置了 FEISHU_DEFAULT_RECEIVER_ID）

### 2. 运行完整工作流

```bash
npm run workflow
```

完整工作流包括：
1. 内容聚合（Phase 2）
2. 账号画像加载（Phase 3）
3. 智能过滤（Phase 4）
4. 草稿生成（Phase 5）
5. 飞书推送（Phase 6）

### 3. 在代码中使用

```typescript
import { DraftGenerator } from './generator/index.js';
import { FeishuClient } from './feishu/index.js';
import { DeepSeekClient } from './ai/deepseek.js';
import { DatabaseManager } from './db/index.js';

// 初始化
const db = new DatabaseManager('./data/scout.db');
const deepseekClient = new DeepSeekClient(apiKey, baseURL);
const draftGenerator = new DraftGenerator(deepseekClient);
const feishuClient = new FeishuClient(db);

// 生成草稿
const result = await draftGenerator.generateDrafts(
  filteredContent,
  profile
);

console.log('Generated drafts:', result.drafts);

// 推送到飞书
await feishuClient.initialize(receiverId);
await feishuClient.pushRecommendations([
  { content: filteredContent, drafts: result.drafts }
]);
```

## 核心功能

### DraftGenerator

生成 3 种风格的推文草稿：

1. **观点型（opinion）**：提出见解和评论
2. **分享型（share）**：简洁介绍 + 推荐理由
3. **提问型（question）**：引发讨论的问题

特性：
- 严格模仿账号风格（语气、长度、emoji 使用）
- 自动控制字数（≤280 字符）
- 附带生成理由
- 自动验证和修复

### FeishuClient

飞书推送和交互：

1. **推送推荐**：批量发送交互式卡片
2. **交互处理**：处理用户点击按钮
3. **反馈记录**：记录用户选择和反馈

卡片功能：
- 展示内容摘要和匹配原因
- 显示 3 个草稿及生成理由
- 提供复制、拒绝、查看原文按钮
- 自动替换链接占位符

## 交互流程

1. **用户收到推荐卡片**
   - 查看内容摘要和推荐理由
   - 阅读 3 个不同风格的草稿

2. **用户选择草稿**
   - 点击「复制草稿 1/2/3」按钮
   - 系统记录反馈（accepted）
   - 收到包含实际链接的草稿文本

3. **用户拒绝推荐**
   - 点击「不感兴趣」按钮
   - 系统记录反馈（rejected）
   - 后续推荐会避免类似内容

4. **查看原文**
   - 点击「查看原文」按钮
   - 直接跳转到原始链接

## 数据库扩展

新增方法：
- `getRecommendationById(id)` - 查询推荐记录
- `insertRecommendation(rec)` - 保存推荐
- `updateRecommendationStatus(id, status, feedback)` - 更新状态
- `insertFeedback(feedback)` - 保存用户反馈

## 草稿生成 Prompt

系统会根据账号画像自动构建 prompt：

```
你是一个推文写手，需要模仿特定账号的风格写推文。

账号风格特征：
- 语气：专业/轻松
- 平均长度：98 字符
- Emoji 使用：很少
- 主题：Web3, AI, 产品设计

历史推文样本：
[用户的历史推文]

原始内容：
标题：[内容标题]
摘要：[内容摘要]
来源：[来源链接]

任务：生成 3 个不同风格的推文草稿
1. 观点型：提出你的见解和评论
2. 分享型：简洁介绍 + 推荐理由
3. 提问型：引发讨论的角度

要求：
- 严格模仿账号的语气和风格
- 长度控制在 78-118 字符
- 尽量不使用 emoji，保持专业简洁
- 链接放在推文末尾，用 [链接] 占位
```

## 验收标准

### Phase 5: 内容生成引擎
- ✅ 每条内容生成 3 个草稿
- ✅ 草稿符合 X 字数限制（≤280）
- ✅ 草稿风格与账号画像一致
- ✅ 自动验证和修复超长草稿

### Phase 6: 飞书推送层
- ✅ 飞书机器人能成功推送消息
- ✅ Interactive Card 正确渲染
- ✅ 按钮交互正常工作
- ✅ 反馈正确记录到数据库
- ✅ 链接占位符自动替换

## 故障排查

### 草稿生成失败

1. **检查 DeepSeek API**
   ```bash
   curl https://api.deepseek.com/v1/chat/completions \
     -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"test"}]}'
   ```

2. **检查账号画像**
   - 确保 `sample_tweets` 字段有数据
   - 确保 `writing_style` 字段格式正确

### 飞书推送失败

1. **检查应用权限**
   - 确认已开通消息发送权限
   - 确认应用已发布并添加到对话

2. **检查 open_id**
   - 确认 `FEISHU_DEFAULT_RECEIVER_ID` 格式正确（以 `ou_` 开头）
   - 可以先发送测试消息验证

3. **查看日志**
   ```bash
   tail -f logs/app.log
   ```

## 下一步

1. **定时任务**：配置 cron 定期运行工作流
2. **反馈学习**：根据用户反馈优化推荐算法
3. **多账号支持**：支持管理多个创作者账号
4. **草稿编辑**：允许用户在飞书中直接编辑草稿

## 相关文件

- `src/generator/` - 草稿生成器
- `src/feishu/` - 飞书客户端
- `src/test-generator-feishu.ts` - 测试文件
- `src/workflow.ts` - 完整工作流
