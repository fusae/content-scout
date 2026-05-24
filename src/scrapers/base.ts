import axios, { AxiosInstance } from 'axios';
import { ContentItem } from '../types/content.js';
import { logger } from '../utils/logger.js';
import { retry, retryStrategies } from '../utils/retry.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import crypto from 'crypto';

/**
 * 爬虫基类 - 提供通用功能
 */
export abstract class BaseScraper {
  protected abstract source: string;
  protected abstract baseUrl: string;
  protected rateLimiter: RateLimiter;
  protected axiosInstance: AxiosInstance;

  private userAgents = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  ];

  constructor(rateLimiter: RateLimiter) {
    this.rateLimiter = rateLimiter;
    this.axiosInstance = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': this.getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      },
    });
  }

  /**
   * 抓取内容 - 子类必须实现
   */
  abstract scrape(): Promise<ContentItem[]>;

  /**
   * 带重试的 HTTP 请求
   */
  protected async fetchWithRetry<T = unknown>(url: string): Promise<T> {
    return retry(
      async () => {
        logger.debug(`Fetching: ${url}`);
        const response = await this.axiosInstance.get(url, {
          headers: {
            'User-Agent': this.getRandomUserAgent(),
          },
        });
        return response.data as T;
      },
      {
        maxAttempts: 3,
        initialDelay: 1000,
        shouldRetry: (error: Error) => {
          return (
            retryStrategies.networkError(error) ||
            retryStrategies.serverError(error) ||
            retryStrategies.rateLimitError(error)
          );
        },
      }
    );
  }

  /**
   * 获取随机 User-Agent
   */
  protected getRandomUserAgent(): string {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  /**
   * URL 去重
   */
  protected deduplicateByUrl(items: ContentItem[]): ContentItem[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.url)) {
        return false;
      }
      seen.add(item.url);
      return true;
    });
  }

  /**
   * 标题 + URL 哈希去重
   */
  protected deduplicateByHash(items: ContentItem[]): ContentItem[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      const hash = this.generateHash(item.title + item.url);
      if (seen.has(hash)) {
        return false;
      }
      seen.add(hash);
      return true;
    });
  }

  /**
   * 生成内容哈希
   */
  protected generateHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * 清洗内容文本
   */
  protected cleanContent(text: string): string {
    if (!text) return '';

    return text
      .replace(/\s+/g, ' ') // 多个空白字符替换为单个空格
      .replace(/[\r\n]+/g, '\n') // 规范化换行符
      .replace(/[^\S\n]+/g, ' ') // 移除非换行的多余空白
      .trim();
  }

  /**
   * 清洗 HTML 标签
   */
  protected stripHtml(html: string): string {
    if (!html) return '';
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  /**
   * 验证内容项
   */
  protected validateItem(item: ContentItem): boolean {
    if (!item.title || !item.url || !item.content) {
      logger.warn(`Invalid item from ${this.source}: missing required fields`);
      return false;
    }
    if (item.title.length < 5) {
      logger.warn(`Invalid item from ${this.source}: title too short`);
      return false;
    }
    return true;
  }

  /**
   * 随机延迟（防止被封）
   */
  protected async randomDelay(min: number = 500, max: number = 2000): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  protected async withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((resolve) => {
          timeout = setTimeout(() => resolve(fallback), ms);
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}
