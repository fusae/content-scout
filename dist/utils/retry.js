import { logger } from './logger.js';
const defaultOptions = {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    shouldRetry: () => true,
};
/**
 * 带指数退避的重试工具
 */
export async function retry(fn, options = {}) {
    const opts = { ...defaultOptions, ...options };
    let lastError;
    let delay = opts.initialDelay;
    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt === opts.maxAttempts || !opts.shouldRetry(lastError)) {
                throw lastError;
            }
            logger.warn(`Attempt ${attempt}/${opts.maxAttempts} failed: ${lastError.message}. Retrying in ${delay}ms...`);
            await sleep(delay);
            delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelay);
        }
    }
    throw lastError;
}
/**
 * 睡眠函数
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * 常见的重试策略
 */
export const retryStrategies = {
    // 网络错误重试
    networkError: (error) => {
        const networkErrors = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH'];
        return networkErrors.some((code) => error.message.includes(code));
    },
    // HTTP 5xx 错误重试
    serverError: (error) => {
        return /5\d{2}/.test(error.message);
    },
    // 速率限制重试
    rateLimitError: (error) => {
        return error.message.includes('429') || error.message.toLowerCase().includes('rate limit');
    },
};
//# sourceMappingURL=retry.js.map