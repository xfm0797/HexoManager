/** 配置管理服务层 */

import { call, callSafe } from './invoke';
import type { ConfigTemplate, Plugin, SiteConfig } from '@/types';

export const configService = {
  /** 读取站点配置（结构化） */
  get(siteId: number): Promise<SiteConfig> {
    return callSafe<SiteConfig>('get_site_config', { siteId }, {});
  },

  /** 读取原始 YAML 文本 */
  getRaw(siteId: number): Promise<string> {
    return callSafe<string>('get_site_config_raw', { siteId }, '');
  },

  /** 保存配置（结构化或原始文本） */
  save(siteId: number, payload: { config?: SiteConfig; raw?: string }): Promise<void> {
    return call<void>('save_site_config', {
      siteId,
      config: payload.config ?? null,
      raw: payload.raw ?? null,
    });
  },

  /** 校验配置内容 */
  validate(content: string, configType?: 'yaml' | 'json' | 'toml'): Promise<void> {
    return call<void>('validate_config', { content, configType });
  },

  /** 查看配置差异 */
  diff(siteId: number): Promise<string> {
    return callSafe<string>('diff_site_config', { siteId }, '');
  },

  /** 恢复配置备份 */
  restore(siteId: number): Promise<void> {
    return call<void>('restore_site_config', { siteId });
  },

  /** 导出配置 */
  exportConfig(siteId: number): Promise<string> {
    return call<string>('export_config', { siteId });
  },

  /** 导入配置 */
  importConfig(siteId: number, payload: string): Promise<void> {
    return call<void>('import_config', { siteId, payload });
  },

  /** 配置模板列表 */
  templates(): Promise<ConfigTemplate[]> {
    return callSafe<ConfigTemplate[]>('get_config_templates', undefined, []);
  },

  // ---------- 插件 ----------

  /** 插件列表 */
  plugins(siteId: number): Promise<Plugin[]> {
    return callSafe<Plugin[]>('get_plugins', { siteId }, []);
  },

  /** 安装插件 */
  installPlugin(siteId: number, name: string): Promise<string> {
    return call<string>('install_plugin', { siteId, name });
  },

  /** 卸载插件 */
  uninstallPlugin(siteId: number, name: string): Promise<string> {
    return call<string>('uninstall_plugin', { siteId, name });
  },

  /** 启用/停用插件 */
  togglePlugin(siteId: number, name: string, enabled: boolean): Promise<void> {
    return call<void>('toggle_plugin', { siteId, name, enabled });
  },
};
