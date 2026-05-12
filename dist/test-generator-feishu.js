/**
 * Phase 5 & 6 测试：草稿生成 + 飞书推送
 *
 * 测试流程：
 * 1. 加载账号画像
 * 2. 获取筛选后的内容
 * 3. 生成推文草稿
 * 4. 推送到飞书
 */
import { DatabaseManager } from './db/index.js';
import { DeepSeekClient } from './ai/deepseek.js';
import { DraftGenerator } from './generator/index.js';
import { FeishuClient } from './feishu/index.js';
import { config, ensureDirectories } from './config.js';
import { logger } from './utils/logger.js';
async function main() {
    logger.info('=== Phase 5 & 6 Test: Draft Generation + Feishu Push ===');
    // 确保目录存在
    ensureDirectories();
    // 初始化组件
    const db = new DatabaseManager(config.dbPath);
    const deepseekClient = new DeepSeekClient(config.deepseek.apiKey, config.deepseek.baseURL);
    const draftGenerator = new DraftGenerator(deepseekClient);
    const feishuClient = new FeishuClient(db);
    try {
        // 1. 加载账号画像
        logger.info('Step 1: Loading account profile...');
        const profile = db.getAccountProfile(config.xAccount.handle);
        if (!profile) {
            throw new Error(`Account profile not found: ${config.xAccount.handle}`);
        }
        // 解析 JSON 字段
        const parsedProfile = {
            id: profile.id,
            accountHandle: profile.account_handle,
            bio: profile.bio || '',
            topics: profile.topics ? JSON.parse(profile.topics) : [],
            writingStyle: profile.writing_style ? JSON.parse(profile.writing_style) : {},
            interests: profile.interests ? JSON.parse(profile.interests) : [],
            audience: profile.audience || '',
            interestVector: profile.interest_vector ? JSON.parse(profile.interest_vector) : [],
            tweetCount: profile.tweet_count || 0,
            sampleTweets: profile.sample_tweets ? JSON.parse(profile.sample_tweets) : [],
            lastUpdated: profile.last_updated ? new Date(profile.last_updated) : undefined,
        };
        logger.info(`Profile loaded: @${parsedProfile.accountHandle}`);
        logger.info(`Writing style: ${parsedProfile.writingStyle.tone}, avg length: ${parsedProfile.writingStyle.avgLength}`);
        // 2. 获取筛选后的内容（模拟）
        logger.info('\nStep 2: Loading filtered contents...');
        // 从数据库获取最近的推荐记录，或者使用测试数据
        const recentRecommendations = db.getRecommendationsByStatus('pending');
        let testContents;
        if (recentRecommendations.length > 0) {
            logger.info(`Found ${recentRecommendations.length} pending recommendations`);
            // 从推荐记录中重建 FilteredContent
            testContents = recentRecommendations.slice(0, 3).map(rec => {
                const content = db.getContentById(rec.content_id);
                if (!content) {
                    throw new Error(`Content ${rec.content_id} not found`);
                }
                return {
                    content: {
                        source: content.source,
                        title: content.title || '',
                        content: content.content,
                        url: content.url || '',
                        author: content.author,
                        publishedAt: new Date(content.published_at || Date.now()),
                        metrics: content.metrics ? JSON.parse(content.metrics) : {},
                        collectedAt: new Date(content.collected_at || Date.now()),
                    },
                    contentId: content.id,
                    embeddingSimilarity: rec.match_score / 10,
                    aiScore: rec.match_score,
                    aiReason: rec.match_reason || '',
                    rank: 1,
                };
            });
        }
        else {
            // 使用测试数据
            logger.info('No pending recommendations found, using test data');
            const recentContents = db.getRecentContent(10);
            if (recentContents.length === 0) {
                throw new Error('No content available in database. Please run aggregator first.');
            }
            testContents = recentContents.slice(0, 3).map((content, index) => ({
                content: {
                    source: content.source,
                    title: content.title || '',
                    content: content.content,
                    url: content.url || '',
                    author: content.author,
                    publishedAt: new Date(content.published_at || Date.now()),
                    metrics: content.metrics ? JSON.parse(content.metrics) : {},
                    collectedAt: new Date(content.collected_at || Date.now()),
                },
                contentId: content.id,
                embeddingSimilarity: 0.85,
                aiScore: 8.5,
                aiReason: '与你的兴趣高度相关，适合分享给你的受众',
                rank: index + 1,
            }));
        }
        logger.info(`Loaded ${testContents.length} contents for testing`);
        // 3. 生成草稿
        logger.info('\nStep 3: Generating drafts...');
        const draftResults = await draftGenerator.generateBatch(testContents, parsedProfile);
        logger.info(`Generated drafts for ${draftResults.length} contents`);
        // 打印草稿预览
        draftResults.forEach((result, index) => {
            logger.info(`\nContent #${index + 1}:`);
            result.drafts.forEach((draft, draftIndex) => {
                logger.info(`  Draft ${draftIndex + 1} (${draft.style}): ${draft.content.substring(0, 50)}...`);
                logger.info(`    Length: ${draft.length}, Reasoning: ${draft.reasoning.substring(0, 50)}...`);
            });
        });
        // 4. 推送到飞书
        logger.info('\nStep 4: Pushing to Feishu...');
        // 初始化飞书客户端
        const defaultReceiverId = config.lark.defaultReceiverId;
        if (!defaultReceiverId) {
            logger.warn('FEISHU_DEFAULT_RECEIVER_ID not set, skipping push');
            logger.info('To enable push, set FEISHU_DEFAULT_RECEIVER_ID in .env file');
            logger.info('You can get your open_id by sending a message to the bot');
        }
        else {
            await feishuClient.initialize(defaultReceiverId);
            // 准备推荐数据
            const recommendations = testContents.map((content, index) => ({
                content,
                drafts: draftResults[index]?.drafts || [],
            }));
            // 推送
            const pushResults = await feishuClient.pushRecommendations(recommendations);
            // 统计结果
            const successCount = pushResults.filter(r => r.success).length;
            logger.info(`\nPush completed: ${successCount}/${pushResults.length} succeeded`);
            pushResults.forEach((result, index) => {
                if (result.success) {
                    logger.info(`  ✓ Content #${index + 1}: message_id=${result.messageId}`);
                }
                else {
                    logger.error(`  ✗ Content #${index + 1}: ${result.error}`);
                }
            });
            // 获取推荐统计
            const stats = feishuClient.getRecommendationStats();
            logger.info('\nRecommendation Stats:');
            logger.info(`  Pending: ${stats.pending}`);
            logger.info(`  Approved: ${stats.approved}`);
            logger.info(`  Rejected: ${stats.rejected}`);
        }
        logger.info('\n=== Test Completed Successfully ===');
    }
    catch (error) {
        logger.error('Test failed:', error);
        throw error;
    }
    finally {
        db.close();
    }
}
// 运行测试
main().catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=test-generator-feishu.js.map