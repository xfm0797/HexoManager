/** Front Matter 模板相关类型定义 */

/** Front Matter 模板（全局共享，跨站点复用） */
export interface FrontMatterTemplate {
  id: number;
  /** 模板名 */
  name: string;
  /** 一句话说明，用于选择时的副标题 */
  description: string | null;
  /** 展示用图标（emoji 或图标名） */
  icon: string | null;
  /** 模板字段，键值对形式，值可为任意 YAML 可表达的类型 */
  fields: Record<string, unknown>;
  /** 正文骨架，支持 `{{title}}` / `{{slug}}` / `{{date}}` / `{{datetime}}` 占位符 */
  body: string | null;
  /** 内置模板不可删除（可编辑或另存） */
  isBuiltin: boolean;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
}

/** 模板保存入参（`id` 为空表示新建） */
export interface SaveFrontMatterTemplateInput {
  id?: number;
  name: string;
  description?: string;
  icon?: string;
  fields: Record<string, unknown>;
  body?: string;
  sortOrder?: number;
}

/** 正文处理方式 */
export type TemplateBodyMode = 'none' | 'replace' | 'append';

/** 套用模板入参 */
export interface ApplyTemplateInput {
  articleId: number;
  templateId: number;
  /** 已存在的同名字段是否被模板覆盖（默认只补缺失） */
  overwrite?: boolean;
  /** 正文处理方式，默认 `none`（不动正文） */
  bodyMode?: TemplateBodyMode;
}

/** 套用模板结果 */
export interface ApplyTemplateResult {
  article: import('./article').Article;
  /** 实际写入 front matter 的字段名 */
  appliedFields: string[];
  /** 实际生效的正文处理方式 */
  bodyMode: TemplateBodyMode;
  /** 正文是否真的被改动 */
  bodyChanged: boolean;
}
