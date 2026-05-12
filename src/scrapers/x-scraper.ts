import { BaseScraper } from './base.js';
import { ContentItem } from '../types/content.js';
import { logger } from '../utils/logger.js';
import puppeteer, { Browser, Page } from 'puppeteer';

interface XTweet {
  text: string;
  author: string;
  url: string;
  likes?: number;
  retweets?: number;
  replies?: number;
}

/**
 * X (Twitter) 爬虫
 * 注意：X 有严格的反爬虫机制，需要谨慎使用
 * 策略：
 * 1. 使用 Puppeteer 模拟真实浏览器
 * 2. 添加随机延迟
 * 3. 限制抓取频率
 */
export class XScraper extends BaseScraper {
  protected source = 'x';
  protected baseUrl = 'https://twitter.com';
  private browser: Browser | null = null;
  private maxTweets = 10; // 限制抓取数量，避免被封

  async scrape(): Promise<ContentItem[]> {
    try {
      logger.info('Starting X (Twitter) scrape...');
      logger.warn('X scraping is rate-limited and may fail due to anti-bot measures');

      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
        ],
      });

      const page = await this.browser.newPage();

      // 设置更真实的浏览器环境
      await page.setUserAgent(this.getRandomUserAgent());
      await page.setViewport({ width: 1920, height: 1080 });

      // 隐藏 webdriver 特征
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });
      });

      // 访问 X Explore 页面（不需要登录）
      const exploreUrl = 'https://twitter.com/explore';
      await page.goto(exploreUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      logger.debug('X Explore page loaded');

      // 随机延迟，模拟人类行为
      await this.randomDelay(2000, 4000);

      // 尝试解析内容
      const tweets = await this.parseTweets(page);

      await this.browser.close();
      this.browser = null;

      if (tweets.length === 0) {
        logger.warn('No tweets collected from X. This may indicate anti-bot detection.');
        return [];
      }

      // 转换为标准格式
      const items = tweets.map((tweet) => this.convertToContentItem(tweet));

      // 验证和去重
      const validItems = items.filter((item) => this.validateItem(item));
      const dedupedItems = this.deduplicateByUrl(validItems);

      logger.info(`X scrape completed: ${dedupedItems.length} items collected`);

      return dedupedItems;
    } catch (error) {
      logger.error('X scrape failed:', error as Error);
      logger.warn('Consider using X API or manual input as fallback');
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      // 不抛出错误，返回空数组，避免阻塞其他爬虫
      return [];
    }
  }

  /**
   * 解析推文
   * 注意：X 的 DOM 结构经常变化，这个实现可能需要更新
   */
  private async parseTweets(page: Page): Promise<XTweet[]> {
    try {
      // 等待内容加载
      await page.waitForSelector('article', { timeout: 10000 });

      return page.evaluate((maxTweets) => {
        const tweets: XTweet[] = [];
        const articles = document.querySelectorAll('article');

        for (let i = 0; i < Math.min(articles.length, maxTweets); i++) {
          const article = articles[i];
          try {
            // 推文文本
            const textElement = article.querySelector('[data-testid="tweetText"]');
            const text = textElement ? textElement.textContent?.trim() || '' : '';

            if (!text) continue;

            // 作者
            const authorElement = article.querySelector('[data-testid="User-Name"] a');
            const author = authorElement ? authorElement.textContent?.trim() || 'Unknown' : 'Unknown';

            // URL（尝试获取推文链接）
            const linkElement = article.querySelector('a[href*="/status/"]');
            const href = linkElement ? linkElement.getAttribute('href') : null;
            const url = href ? `https://twitter.com${href}` : `https://twitter.com/explore`;

            // 互动数据（可能无法获取）
            const likeElement = article.querySelector('[data-testid="like"]');
            const retweetElement = article.querySelector('[data-testid="retweet"]');
            const replyElement = article.querySelector('[data-testid="reply"]');

            tweets.push({
              text,
              author,
              url,
              likes: likeElement ? parseInt(likeElement.textContent || '0', 10) : undefined,
              retweets: retweetElement ? parseInt(retweetElement.textContent || '0', 10) : undefined,
              replies: replyElement ? parseInt(replyElement.textContent || '0', 10) : undefined,
            });
          } catch (error) {
            console.error('Error parsing tweet:', error);
          }
        }

        return tweets;
      }, this.maxTweets);
    } catch (error) {
      logger.error('Failed to parse tweets:', error as Error);
      return [];
    }
  }

  /**
   * 转换为标准格式
   */
  private convertToContentItem(tweet: XTweet): ContentItem {
    return {
      source: 'x',
      title: tweet.text.substring(0, 100) + (tweet.text.length > 100 ? '...' : ''),
      content: this.cleanContent(tweet.text),
      url: tweet.url,
      author: tweet.author,
      publishedAt: new Date(), // X 不提供时间戳（未登录）
      metrics: {
        likes: tweet.likes,
        shares: tweet.retweets,
        comments: tweet.replies,
      },
      collectedAt: new Date(),
    };
  }
}
