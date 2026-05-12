export interface RetryOptions {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
    shouldRetry?: (error: Error) => boolean;
}
/**
 * 带指数退避的重试工具
 */
export declare function retry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>;
/**
 * 常见的重试策略
 */
export declare const retryStrategies: {
    networkError: (error: Error) => boolean;
    serverError: (error: Error) => boolean;
    rateLimitError: (error: Error) => boolean;
};
//# sourceMappingURL=retry.d.ts.map