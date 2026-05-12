import { logger } from './logger.js';

export interface RateLimiterOptions {
  maxConcurrent: number;
  minDelay: number; // 最小请求间隔（毫秒）
}

/**
 * 速率限制器
 */
export class RateLimiter {
  private queue: Array<() => void> = [];
  private activeCount = 0;
  private lastExecutionTime = 0;

  constructor(private options: RateLimiterOptions) {}

  /**
   * 执行带速率限制的异步函数
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.waitForSlot();

    this.activeCount++;
    try {
      const result = await fn();
      return result;
    } finally {
      this.activeCount--;
      this.processQueue();
    }
  }

  /**
   * 等待可用的执行槽位
   */
  private async waitForSlot(): Promise<void> {
    // 检查并发限制
    if (this.activeCount >= this.options.maxConcurrent) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }

    // 检查时间间隔限制
    const now = Date.now();
    const timeSinceLastExecution = now - this.lastExecutionTime;
    if (timeSinceLastExecution < this.options.minDelay) {
      const delay = this.options.minDelay - timeSinceLastExecution;
      logger.debug(`Rate limiter: waiting ${delay}ms before next execution`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    this.lastExecutionTime = Date.now();
  }

  /**
   * 处理队列中的下一个请求
   */
  private processQueue(): void {
    if (this.queue.length > 0 && this.activeCount < this.options.maxConcurrent) {
      const resolve = this.queue.shift();
      if (resolve) {
        resolve();
      }
    }
  }

  /**
   * 获取当前状态
   */
  getStatus(): { active: number; queued: number } {
    return {
      active: this.activeCount,
      queued: this.queue.length,
    };
  }
}
