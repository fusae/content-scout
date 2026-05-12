import { BaseScraper } from './base.js';
import { ContentItem } from '../types/content.js';
import { logger } from '../utils/logger.js';
import puppeteer, { Browser, Page } from 'puppeteer';

interface GitHubRepo {
  name: string;
  author: string;
  description: string;
  url: string;
  stars: number;
  language?: string;
  todayStars?: number;
}

/**
 * GitHub Trending 爬虫
 * 使用 Puppeteer 抓取（无官方 API）
 */
export class GitHubTrendingScraper extends BaseScraper {
  protected source = 'github';
  protected baseUrl = 'https://github.com/trending';
  private browser: Browser | null = null;

  async scrape(): Promise<ContentItem[]> {
    try {
      logger.info('Starting GitHub Trending scrape...');

      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await this.browser.newPage();
      await page.setUserAgent(this.getRandomUserAgent());

      // 访问 GitHub Trending 页面
      await page.goto(this.baseUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      logger.debug('GitHub Trending page loaded');

      // 解析页面内容
      const repos = await this.parseRepos(page);

      await this.browser.close();
      this.browser = null;

      // 转换为标准格式
      const items = repos.map((repo) => this.convertToContentItem(repo));

      // 验证和去重
      const validItems = items.filter((item) => this.validateItem(item));
      const dedupedItems = this.deduplicateByUrl(validItems);

      logger.info(`GitHub Trending scrape completed: ${dedupedItems.length} items collected`);

      return dedupedItems;
    } catch (error) {
      logger.error('GitHub Trending scrape failed:', error as Error);
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      throw error;
    }
  }

  /**
   * 解析 GitHub Trending 页面
   */
  private async parseRepos(page: Page): Promise<GitHubRepo[]> {
    return page.evaluate(() => {
      const repos: GitHubRepo[] = [];
      const articles = document.querySelectorAll('article.Box-row');

      articles.forEach((article: Element) => {
        try {
          // 仓库名称和链接
          const nameElement = article.querySelector('h2 a');
          if (!nameElement) return;

          const href = nameElement.getAttribute('href');
          if (!href) return;

          const fullName = href.replace(/^\//, '');
          const [author, name] = fullName.split('/');

          // 描述
          const descElement = article.querySelector('p');
          const description = descElement ? descElement.textContent?.trim() || '' : '';

          // Stars
          const starsElement = article.querySelector('svg.octicon-star')?.parentElement;
          const starsText = starsElement?.textContent?.trim().replace(/,/g, '') || '0';
          const stars = parseInt(starsText, 10) || 0;

          // 语言
          const langElement = article.querySelector('[itemprop="programmingLanguage"]');
          const language = langElement ? langElement.textContent?.trim() : undefined;

          // 今日 Stars
          const todayStarsElement = article.querySelector('span.float-sm-right');
          const todayStarsText = todayStarsElement?.textContent?.trim().match(/[\d,]+/)?.[0] || '0';
          const todayStars = parseInt(todayStarsText.replace(/,/g, ''), 10) || 0;

          repos.push({
            name,
            author,
            description,
            url: `https://github.com${href}`,
            stars,
            language,
            todayStars,
          });
        } catch (error) {
          console.error('Error parsing repo:', error);
        }
      });

      return repos;
    });
  }

  /**
   * 转换为标准格式
   */
  private convertToContentItem(repo: GitHubRepo): ContentItem {
    const title = `${repo.author}/${repo.name}`;
    const content = repo.description || title;
    const languageInfo = repo.language ? ` [${repo.language}]` : '';
    const todayInfo = repo.todayStars ? ` (+${repo.todayStars} stars today)` : '';

    return {
      source: 'github',
      title: title + languageInfo,
      content: this.cleanContent(content + todayInfo),
      url: repo.url,
      author: repo.author,
      publishedAt: new Date(), // GitHub Trending 没有发布时间，使用当前时间
      metrics: {
        stars: repo.stars,
      },
      collectedAt: new Date(),
    };
  }
}
