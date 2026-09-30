/** 主题管理服务层 */

import { call, callSafe } from './invoke';
import type { Theme, ThemeConfig, ThemeInfo } from '@/types';

export const themeService = {
  /** 已安装主题列表 */
  list(siteId: number): Promise<Theme[]> {
    return callSafe<Theme[]>('get_themes', { siteId }, []);
  },

  /** 安装主题 */
  install(siteId: number, name: string, source?: string): Promise<Theme> {
    return call<Theme>('install_theme', { siteId, name, source });
  },

  /** 切换主题 */
  switch(siteId: number, name: string): Promise<void> {
    return call<void>('switch_theme', { siteId, name });
  },

  /** 获取主题配置 */
  getConfig(siteId: number, theme?: string): Promise<ThemeConfig> {
    return call<ThemeConfig>('get_theme_config', { siteId, theme });
  },

  /** 更新主题配置 */
  updateConfig(
    siteId: number,
    theme: string,
    payload: { config?: Record<string, unknown>; raw?: string },
  ): Promise<void> {
    return call<void>('update_theme_config', {
      siteId,
      theme,
      config: payload.config ?? null,
      raw: payload.raw ?? null,
    });
  },

  /** 搜索主题 */
  search(query?: string): Promise<ThemeInfo[]> {
    return callSafe<ThemeInfo[]>('search_themes', { query }, []);
  },

  /** 卸载主题 */
  uninstall(siteId: number, name: string): Promise<void> {
    return call<void>('uninstall_theme', { siteId, name });
  },

  /** 更新主题 */
  update(siteId: number, name: string): Promise<string> {
    return call<string>('update_theme', { siteId, name });
  },

  /** 获取主题演示链接 */
  previewUrl(siteId: number, name: string): Promise<string> {
    return call<string>('get_theme_preview_url', { siteId, name });
  },
};
