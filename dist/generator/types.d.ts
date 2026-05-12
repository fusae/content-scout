/**
 * 草稿类型定义
 */
/**
 * 草稿风格
 */
export type DraftStyle = 'opinion' | 'share' | 'question';
/**
 * 单个草稿
 */
export interface Draft {
    content: string;
    style: DraftStyle;
    reasoning: string;
    length: number;
}
/**
 * 草稿生成选项
 */
export interface DraftGenerationOptions {
    maxLength?: number;
    styles?: DraftStyle[];
    temperature?: number;
}
/**
 * 草稿生成结果
 */
export interface DraftGenerationResult {
    drafts: Draft[];
    contentId: number;
    generatedAt: Date;
    model: string;
}
//# sourceMappingURL=types.d.ts.map