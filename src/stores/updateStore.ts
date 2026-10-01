/** 更新与应用信息状态管理 */

import { create } from 'zustand';
import { updateService } from '@/services';
import type {
  AppInfo,
  Changelog,
  DownloadResult,
  UpdateConfig,
  UpdateInfo,
  UpdateSettings,
} from '@/types';

interface UpdateState {
  /** 应用信息 */
  appInfo: AppInfo | null;
  /** 更新设置 */
  settings: UpdateSettings;
  /** 更新源配置 */
  config: UpdateConfig | null;
  /** 更新检查结果 */
  updateInfo: UpdateInfo | null;
  /** 更新日志 */
  changelog: Changelog[];
  /** 检查中 */
  checking: boolean;
  /** 下载中 */
  downloading: boolean;
  /** 下载进度（0-100） */
  progress: number;
  /** 下载结果 */
  downloadResult: DownloadResult | null;
  /** 错误信息 */
  error: string | null;

  /** 拉取应用信息 */
  fetchAppInfo: () => Promise<void>;
  /** 拉取更新设置 */
  fetchSettings: () => Promise<void>;
  /** 拉取更新源配置 */
  fetchConfig: () => Promise<void>;
  /** 保存更新设置 */
  saveSettings: (patch: Partial<UpdateSettings>) => Promise<void>;
  /** 检查更新 */
  checkUpdate: (silent?: boolean) => Promise<UpdateInfo>;
  /** 下载更新包 */
  downloadUpdate: (url: string, targetDir?: string) => Promise<DownloadResult>;
  /** 安装更新包 */
  installUpdate: (path: string) => Promise<void>;
  /** 拉取更新日志 */
  fetchChangelog: (projectRoot?: string) => Promise<void>;
  /** 忽略某个版本 */
  skipVersion: (version: string) => Promise<void>;
  /** 打开外部链接 */
  openExternal: (url: string) => Promise<void>;
  /** 清除错误 */
  clearError: () => void;
}

const DEFAULT_SETTINGS: UpdateSettings = {
  autoCheck: true,
  lastCheckAt: null,
  lastVersion: null,
  skipVersion: null,
};

export const useUpdateStore = create<UpdateState>((set, get) => ({
  appInfo: null,
  settings: DEFAULT_SETTINGS,
  config: null,
  updateInfo: null,
  changelog: [],
  checking: false,
  downloading: false,
  progress: 0,
  downloadResult: null,
  error: null,

  async fetchAppInfo() {
    try {
      const appInfo = await updateService.appInfo();
      set({ appInfo });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  async fetchSettings() {
    const settings = await updateService.getSettings();
    set({ settings });
  },

  async fetchConfig() {
    try {
      const config = await updateService.config();
      set({ config });
    } catch {
      // 更新源配置获取失败不阻塞界面
      set({ config: null });
    }
  },

  async saveSettings(patch) {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    await updateService.saveSettings(next);
  },

  async checkUpdate(silent = false) {
    if (!silent) set({ checking: true, error: null });
    try {
      const updateInfo = await updateService.check();
      set({
        updateInfo,
        checking: false,
        settings: { ...get().settings, lastCheckAt: new Date().toISOString() },
      });
      return updateInfo;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ checking: false, error: message });
      if (!silent) throw new Error(message);
      return {
        available: false,
        currentVersion: get().appInfo?.version ?? '1.0.0',
        latestVersion: null,
        notes: null,
        pubDate: null,
        downloadUrl: null,
        error: message,
      };
    }
  },

  async downloadUpdate(url, targetDir) {
    set({ downloading: true, progress: 0, error: null });
    try {
      const downloadResult = await updateService.download(url, targetDir);
      set({ downloading: false, progress: 100, downloadResult });
      return downloadResult;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ downloading: false, progress: 0, error: message });
      throw new Error(message);
    }
  },

  async installUpdate(path) {
    await updateService.install(path);
  },

  async fetchChangelog(projectRoot) {
    const changelog = await updateService.changelog(projectRoot);
    set({ changelog });
  },

  async skipVersion(version) {
    await get().saveSettings({ skipVersion: version });
  },

  async openExternal(url) {
    await updateService.openExternal(url);
  },

  clearError() {
    set({ error: null });
  },
}));
