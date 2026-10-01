/** 更新与应用信息服务层 */

import { call, callSafe } from './invoke';
import type {
  AppInfo,
  AppSetting,
  Changelog,
  DownloadResult,
  UpdateConfig,
  UpdateInfo,
  UpdateSettings,
} from '@/types';

export const updateService = {
  /** 检查更新（不传 manifestUrl 时后端使用默认更新源并依次尝试） */
  check(manifestUrl?: string): Promise<UpdateInfo> {
    return call<UpdateInfo>('check_update', { manifestUrl: manifestUrl ?? null });
  },

  /** 获取更新源配置 */
  config(): Promise<UpdateConfig> {
    return call<UpdateConfig>('get_update_config');
  },

  /** 下载更新包 */
  download(url: string, targetDir?: string): Promise<DownloadResult> {
    return call<DownloadResult>('download_update', { url, targetDir: targetDir ?? null });
  },

  /** 安装更新包 */
  install(path: string): Promise<void> {
    return call<void>('install_update', { path });
  },

  /** 读取更新设置 */
  getSettings(): Promise<UpdateSettings> {
    return callSafe<UpdateSettings>('get_update_settings', undefined, {
      autoCheck: true,
      lastCheckAt: null,
      lastVersion: null,
      skipVersion: null,
    });
  },

  /** 保存更新设置 */
  saveSettings(settings: UpdateSettings): Promise<void> {
    return call<void>('save_update_settings', { settings });
  },

  /** 获取更新日志 */
  changelog(projectRoot?: string): Promise<Changelog[]> {
    return callSafe<Changelog[]>('get_changelog', { projectRoot: projectRoot ?? null }, []);
  },

  /** 获取应用信息 */
  appInfo(): Promise<AppInfo> {
    return call<AppInfo>('get_app_info');
  },

  /** 打开外部链接 */
  openExternal(url: string): Promise<void> {
    return call<void>('open_external', { url });
  },

  /** 读取本地版本号文件 */
  localVersion(projectRoot?: string): Promise<Record<string, unknown>> {
    return callSafe<Record<string, unknown>>(
      'get_local_version',
      { projectRoot: projectRoot ?? null },
      {},
    );
  },

  /** 读取全部应用设置 */
  appSettings(): Promise<AppSetting[]> {
    return callSafe<AppSetting[]>('get_app_settings', undefined, []);
  },

  /** 写入应用设置 */
  setAppSetting(key: string, value: string): Promise<void> {
    return call<void>('set_app_setting', { key, value });
  },
};
