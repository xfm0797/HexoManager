/** 配置相关类型定义 */

/** 站点配置（_config.yml 解析结果，字段为 Hexo 原生命名） */
export interface SiteConfig {
  title?: string;
  subtitle?: string;
  description?: string;
  keywords?: string;
  author?: string;
  language?: string;
  timezone?: string;
  url?: string;
  root?: string;
  permalink?: string;
  permalink_defaults?: unknown;
  source_dir?: string;
  public_dir?: string;
  tag_dir?: string;
  archive_dir?: string;
  category_dir?: string;
  code_dir?: string;
  i18n_dir?: string;
  skip_render?: unknown;
  new_post_name?: string;
  default_layout?: string;
  titlecase?: boolean;
  external_link?: unknown;
  filename_case?: number;
  render_drafts?: boolean;
  post_asset_folder?: boolean;
  relative_link?: boolean;
  future?: boolean;
  highlight?: unknown;
  prismjs?: unknown;
  default_category?: string;
  category_map?: unknown;
  tag_map?: unknown;
  date_format?: string;
  time_format?: string;
  per_page?: number;
  pagination_dir?: string;
  theme?: string;
  deploy?: unknown;
  index_generator?: unknown;
  [key: string]: unknown;
}

/** 配置模板 */
export interface ConfigTemplate {
  id: string;
  name: string;
  description: string;
  config: Record<string, unknown>;
}

/** 配置字段类型（用于自动生成表单） */
export type ConfigFieldType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'text';

/** 配置字段描述 */
export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  description?: string;
  placeholder?: string;
  options?: string[];
}
