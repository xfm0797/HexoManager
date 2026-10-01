/** 更新与应用信息类型定义 */

/** 更新信息 */
export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string | null;
  notes: string | null;
  pubDate: string | null;
  downloadUrl: string | null;
  error: string | null;
}

/** 更新设置 */
export interface UpdateSettings {
  autoCheck: boolean;
  lastCheckAt: string | null;
  lastVersion: string | null;
  skipVersion: string | null;
}

/** 更新日志条目 */
export interface Changelog {
  version: string;
  date: string;
  changes: string[];
}

/** 技术栈条目 */
export interface TechItem {
  name: string;
  version: string;
  layer: string;
  url: string;
}

/** 应用信息 */
export interface AppInfo {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  repository: string;
  homepage: string;
  tauriVersion: string;
  buildDate: string;
  techStack: TechItem[];
}

/** 应用设置项 */
export interface AppSetting {
  key: string;
  value: string;
}

/** 下载结果 */
export interface DownloadResult {
  path: string;
  size: number;
  success: boolean;
}

/** 更新源配置（由后端 get_update_config 返回） */
export interface UpdateConfig {
  currentVersion: string;
  /** 默认更新源列表（按优先级排列） */
  endpoints: string[];
  os: string;
  arch: string;
}
