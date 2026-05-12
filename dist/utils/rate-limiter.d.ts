export interface RateLimiterOptions {
    maxConcurrent: number;
    minDelay: number;
}
/**
 * 速率限制器
 */
export declare class RateLimiter {
    private options;
    private queue;
    private activeCount;
    private lastExecutionTime;
    constructor(options: RateLimiterOptions);
    /**
     * 执行带速率限制的异步函数
     */
    execute<T>(fn: () => Promise<T>): Promise<T>;
    /**
     * 等待可用的执行槽位
     */
    private waitForSlot;
    /**
     * 处理队列中的下一个请求
     */
    private processQueue;
    /**
     * 获取当前状态
     */
    getStatus(): {
        active: number;
        queued: number;
    };
}
//# sourceMappingURL=rate-limiter.d.ts.map