import { BaseScraper } from './base.js';
import { ContentItem } from '../types/content.js';
import { logger } from '../utils/logger.js';

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
 * 使用 HTTP 抓取 Trending 页面，避免 Puppeteer 导航超时
 */
export class GitHubTrendingScraper extends BaseScraper {
  protected source = 'github';
  protected baseUrl = 'https://github.com/trending';
  protected healthCheckKeywords = ['Box-row', 'article', 'Trending'];

  protected healthCheckUrl(): string {
    return `${this.baseUrl}?since=daily`;
  }

  async scrape(): Promise<ContentItem[]> {
    try {
      logger.info('Starting GitHub Trending scrape...');

      const html = await this.fetchWithRetry<string>(`${this.baseUrl}?since=daily`);
      const repos = this.parseRepos(html);

      // 转换为标准格式
      const items = repos.map((repo) => this.convertToContentItem(repo));

      // 验证和去重
      const validItems = items.filter((item) => this.validateItem(item));
      const dedupedItems = this.deduplicateByUrl(validItems);

      logger.info(`GitHub Trending scrape completed: ${dedupedItems.length} items collected`);

      return dedupedItems;
    } catch (error) {
      logger.error('GitHub Trending scrape failed:', error as Error);
      throw error;
    }
  }

  /**
   * 解析 GitHub Trending 页面
   */
  private parseRepos(html: string): GitHubRepo[] {
    const repos: GitHubRepo[] = [];
    const articles = html.match(/<article[\s\S]*?<\/article>/g) || [];

    for (const article of articles) {
      const href = article.match(/<h2[\s\S]*?<a[^>]+href="([^"]+)"/)?.[1];
      if (!href) continue;

      const fullName = this.decodeHtml(href.replace(/^\//, '').trim());
      const [author, name] = fullName.split('/');
      if (!author || !name) continue;

      const description = this.cleanContent(
        this.decodeHtml(article.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] || '')
      );
      const language = this.decodeHtml(
        article.match(/itemprop="programmingLanguage"[^>]*>(.*?)<\/span>/)?.[1] || ''
      ).trim() || undefined;
      const starsText = article.match(/href="\/[^"]+\/stargazers"[\s\S]*?<\/svg>\s*([\d,]+)/)?.[1] || '0';
      const todayStarsText = article.match(/([\d,]+)\s+stars today/)?.[1] || '0';

      repos.push({
        name: this.decodeHtml(name.trim()),
        author: this.decodeHtml(author.trim()),
        description,
        url: `https://github.com/${fullName}`,
        stars: parseInt(starsText.replace(/,/g, ''), 10) || 0,
        language,
        todayStars: parseInt(todayStarsText.replace(/,/g, ''), 10) || 0,
      });
    }

    return repos;
  }

  private decodeHtml(text: string): string {
    return text
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
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
