/** 主题与插件类型定义 */

/** 已安装主题 */
export interface Theme {
  name: string;
  path: string;
  version: string | null;
  description: string | null;
  author: string | null;
  repo: string | null;
  isActive: boolean;
  hasConfig: boolean;
  installedAt: string | null;
}

/** 可安装主题（市场信息） */
export interface ThemeInfo {
  name: string;
  displayName: string | null;
  description: string | null;
  author: string | null;
  repo: string | null;
  stars: number | null;
  npmName: string | null;
}

/** 主题配置 */
export interface ThemeConfig {
  siteId: number;
  themeName: string;
  config: Record<string, unknown>;
  isActive: boolean;
  raw: string;
}

/** 插件 */
export interface Plugin {
  id: number;
  siteId: number;
  name: string;
  version: string | null;
  isActive: boolean;
  config: string | null;
  createdAt: string | null;
}
