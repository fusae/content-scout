/**
 * 应用配置
 */
export declare const config: {
    readonly dbPath: string;
    readonly logLevel: string;
    readonly logFile: string;
    readonly openai: {
        readonly apiKey: string;
        readonly model: string;
    };
    readonly deepseek: {
        readonly apiKey: string;
        readonly baseURL: string;
    };
    readonly xAccount: {
        readonly handle: string;
    };
    readonly lark: {
        readonly appId: string;
        readonly appSecret: string;
        readonly baseId: string;
        readonly defaultReceiverId: string;
    };
    readonly rateLimit: {
        readonly maxConcurrent: number;
        readonly requestDelayMs: number;
    };
    readonly cronSchedule: string;
};
/**
 * 验证必需的配置项
 */
export declare function validateConfig(): void;
/**
 * 确保必要的目录存在
 */
export declare function ensureDirectories(): void;
//# sourceMappingURL=config.d.ts.map