/**
 * 草稿类型定义
 */

/**
 * 草稿长度版本
 */
export type DraftStyle = 'short' | 'medium' | 'long';

/**
 * 单个草稿
 */
export interface Draft {
  content: string; // 草稿内容
  style: DraftStyle; // 长度版本
  reasoning: string; // 生成理由
  length: number; // 字符数
}

/**
 * 草稿生成选项
 */
export interface DraftGenerationOptions {
  maxLength?: number; // 最大字符数，默认 280
  styles?: DraftStyle[]; // 要生成的风格，默认全部
  temperature?: number; // 生成温度，默认 0.7
}

/**
 * 草稿生成结果
 */
export interface DraftGenerationResult {
  drafts: Draft[];
  contentId: number;
  generatedAt: Date;
  model: string; // 使用的模型
}
