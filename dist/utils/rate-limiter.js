import { logger } from './logger.js';
/**
 * 速率限制器
 */
export class RateLimiter {
    options;
    queue = [];
    activeCount = 0;
    lastExecutionTime = 0;
    constructor(options) {
        this.options = options;
    }
    /**
     * 执行带速率限制的异步函数
     */
    async execute(fn) {
        await this.waitForSlot();
        this.activeCount++;
        try {
            const result = await fn();
            return result;
        }
        finally {
            this.activeCount--;
            this.processQueue();
        }
    }
    /**
     * 等待可用的执行槽位
     */
    async waitForSlot() {
        // 检查并发限制
        if (this.activeCount >= this.options.maxConcurrent) {
            await new Promise((resolve) => {
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
    processQueue() {
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
    getStatus() {
        return {
            active: this.activeCount,
            queued: this.queue.length,
        };
    }
}
//# sourceMappingURL=rate-limiter.js.map