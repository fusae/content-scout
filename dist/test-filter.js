import { config } from 'dotenv';
import { DatabaseManager } from './db/index.js';
import { EmbeddingClient } from './ai/embedding.js';
import { DeepSeekClient } from './ai/deepseek.js';
import { FilterEngine } from './filter/index.js';
import { ProfileManager } from './profile/index.js';
import { logger } from './utils/logger.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// 加载环境变量
config();
async function testFilterEngine() {
    logger.info('=== Testing Filter Engine ===');
    // 1. 初始化组件
    const dbPath = join(__dirname, '../data/scout.db');
    const db = new DatabaseManager(dbPath);
    const openaiKey = process.env.OPENAI_API_KEY;
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (!openaiKey || !deepseekKey) {
        logger.error('Missing API keys. Please set OPENAI_API_KEY and DEEPSEEK_API_KEY');
        process.exit(1);
    }
    const embeddingClient = new EmbeddingClient(openaiKey);
    const deepseekClient = new DeepSeekClient(deepseekKey);
    const filterEngine = new FilterEngine(embeddingClient, deepseekClient, db);
    // 2. 获取或创建账号画像
    const accountHandle = 'rabbitrun_eth';
    let profile = await getOrCreateProfile(db, accountHandle);
    if (!profile) {
        logger.error('Failed to get or create profile');
        process.exit(1);
    }
    logger.info(`Profile loaded: @${profile.accountHandle}`);
    logger.info(`Topics: ${profile.topics.join(', ')}`);
    logger.info(`Interests: ${profile.interests.join(', ')}`);
    // 3. 检查内容池
    const recentContents = db.getRecentContent(100);
    logger.info(`Content pool: ${recentContents.length} items`);
    if (recentContents.length === 0) {
        logger.warn('No content in database. Please run aggregator first.');
        logger.info('Run: npm run test:aggregator');
        process.exit(0);
    }
    // 4. 执行过滤
    logger.info('\n--- Starting Filter Process ---');
    const { contents, stats } = await filterEngine.filter(profile, {
        topK: 20,
        finalCount: 5,
        minAiScore: 7.0,
        enableTimeBoost: true,
        enableDiversity: true,
        maxPerSource: 2,
    });
    // 5. 显示结果
    logger.info('\n=== Filter Results ===');
    logger.info(`Pipeline: ${stats.totalInput} → ${stats.afterEmbedding} → ${stats.afterAI} → ${stats.finalOutput}`);
    logger.info(`Duration: embedding=${stats.embeddingDuration}ms, ai=${stats.aiDuration}ms, total=${stats.totalDuration}ms`);
    if (contents.length === 0) {
        logger.warn('No recommendations generated');
    }
    else {
        logger.info(`\n--- Top ${contents.length} Recommendations ---`);
        contents.forEach((item, index) => {
            logger.info(`\n${index + 1}. [${item.content.source}] ${item.content.title || '无标题'}`);
            logger.info(`   URL: ${item.content.url}`);
            logger.info(`   Embedding Similarity: ${item.embeddingSimilarity.toFixed(3)}`);
            if (item.aiScore) {
                logger.info(`   AI Score: ${item.aiScore.toFixed(1)}/10`);
            }
            if (item.aiReason) {
                logger.info(`   Reason: ${item.aiReason}`);
            }
            if (item.dimensions) {
                logger.info(`   Dimensions: topic=${item.dimensions.topicRelevance}, audience=${item.dimensions.audienceMatch}, time=${item.dimensions.timeliness}, potential=${item.dimensions.potential}`);
            }
            logger.info(`   Content: ${item.content.content.slice(0, 150)}...`);
        });
    }
    // 6. 保存推荐到数据库
    if (contents.length > 0) {
        logger.info('\n--- Saving Recommendations ---');
        for (const item of contents) {
            const recId = db.insertRecommendation({
                content_id: item.contentId,
                match_score: item.aiScore || item.embeddingSimilarity * 10,
                match_reason: item.aiReason || `Embedding similarity: ${item.embeddingSimilarity.toFixed(3)}`,
                status: 'pending',
            });
            logger.info(`Saved recommendation ${recId} for content ${item.contentId}`);
        }
    }
    db.close();
    logger.info('\n=== Test Completed ===');
}
/**
 * 获取或创建账号画像
 */
async function getOrCreateProfile(db, accountHandle) {
    // 尝试从数据库加载
    const dbProfile = db.getAccountProfile(accountHandle);
    if (dbProfile && dbProfile.interest_vector) {
        logger.info('Profile loaded from database');
        return {
            accountHandle: dbProfile.account_handle,
            bio: dbProfile.bio || '',
            topics: dbProfile.topics ? JSON.parse(dbProfile.topics) : [],
            writingStyle: dbProfile.writing_style ? JSON.parse(dbProfile.writing_style) : {},
            interests: dbProfile.interests ? JSON.parse(dbProfile.interests) : [],
            audience: dbProfile.audience || '',
            interestVector: dbProfile.interest_vector ? JSON.parse(dbProfile.interest_vector) : [],
            tweetCount: dbProfile.tweet_count || 0,
        };
    }
    // 从初始数据创建
    logger.info('Creating profile from initial data');
    // 获取 OpenAI API key
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
        logger.error('OPENAI_API_KEY not found');
        return null;
    }
    const profileManager = new ProfileManager(db, openaiKey, accountHandle);
    try {
        const profile = await profileManager.initializeProfile();
        logger.info('Profile created and saved to database');
        return profile;
    }
    catch (error) {
        logger.error('Failed to create profile:', error);
        return null;
    }
}
// 运行测试
testFilterEngine().catch(error => {
    logger.error('Test failed:', error);
    process.exit(1);
});
//# sourceMappingURL=test-filter.js.map