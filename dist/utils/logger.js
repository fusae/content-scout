import winston from 'winston';
import { config } from '../config.js';
const { combine, timestamp, printf, colorize, errors } = winston.format;
// 自定义日志格式
const logFormat = printf(({ level, message, timestamp, stack }) => {
    const msg = stack || message;
    return `${timestamp} [${level}]: ${String(msg)}`;
});
// 创建 logger 实例
export const logger = winston.createLogger({
    level: config.logLevel,
    format: combine(errors({ stack: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
    transports: [
        // 控制台输出
        new winston.transports.Console({
            format: combine(colorize(), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
        }),
        // 文件输出
        new winston.transports.File({
            filename: config.logFile,
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
    ],
});
// 导出便捷方法
export const log = {
    info: (message, meta) => logger.info(message, meta),
    error: (message, error) => logger.error(message, error),
    warn: (message, meta) => logger.warn(message, meta),
    debug: (message, meta) => logger.debug(message, meta),
};
//# sourceMappingURL=logger.js.map