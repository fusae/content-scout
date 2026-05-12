import winston from 'winston';
export declare const logger: winston.Logger;
export declare const log: {
    info: (message: string, meta?: Record<string, unknown>) => winston.Logger;
    error: (message: string, error?: Error) => winston.Logger;
    warn: (message: string, meta?: Record<string, unknown>) => winston.Logger;
    debug: (message: string, meta?: Record<string, unknown>) => winston.Logger;
};
//# sourceMappingURL=logger.d.ts.map