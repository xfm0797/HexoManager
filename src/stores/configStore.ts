/** 配置与主题状态管理 */

import { create } from 'zustand';
import { configService, fileService, themeService } from '@/services';
import type {
  ConfigTemplate,
  EnvCheck,
  Plugin,
  SiteConfig,
  Theme,
  ThemeConfig,
  ThemeInfo,
} from '@/types';
import { parseYaml, stringifyYaml } from '@/utils/yaml';

/** 配置编辑模式 */
export type ConfigMode = 'form' | 'raw';

interface ConfigState {
  /** 结构化配置 */
  config: SiteConfig;
  /** 原始 YAML 文本 */
  raw: string;
  /** 编辑模式 */
  mode: ConfigMode;
  /** 配置模板 */
  templates: ConfigTemplate[];
  /** 主题列表 */
  themes: Theme[];
  /** 主题市场搜索结果 */
  themeMarket: ThemeInfo[];
  /** 当前主题配置 */
  themeConfig: ThemeConfig | null;
  /** 插件列表 */
  plugins: Plugin[];
  /** Hexo 环境检查结果 */
  env: EnvCheck | null;
  /** 外部 YAML 文本（主题配置原始模式） */
  themeRaw: string;
  /** 主题配置专属错误（与站点配置 error 分离，便于 UI 精准提示） */
  themeError: string | null;
  /** 加载中 */
  loading: boolean;
  /** 保存中 */
  saving: boolean;
  /** 是否存在未保存改动 */
  dirty: boolean;
  /** 错误信息 */
  error: string | null;

  /** 拉取站点配置 */
  fetchConfig: (siteId: number) => Promise<void>;
  /** 切换编辑模式（raw → form 时校验 YAML） */
  setMode: (mode: ConfigMode) => void;
  /** 更新结构化配置（表单编辑） */
  patchConfig: (patch: Partial<SiteConfig>) => void;
  /** 更新原始 YAML 文本 */
  setRaw: (raw: string) => void;
  /** 保存配置 */
  saveConfig: (siteId: number) => Promise<void>;
  /** 查看配置差异 */
  diffConfig: (siteId: number) => Promise<string>;
  /** 恢复最近备份 */
  restoreConfig: (siteId: number) => Promise<void>;
  /** 导出配置到文件 */
  exportConfig: (siteId: number, targetPath: string) => Promise<void>;
  /** 从文件导入配置 */
  importConfig: (siteId: number, sourcePath: string) => Promise<void>;
  /** 拉取配置模板 */
  fetchTemplates: () => Promise<void>;
  /** 应用配置模板 */
  applyTemplate: (templateId: string) => void;

  /** 拉取主题列表 */
  fetchThemes: (siteId: number) => Promise<void>;
  /** 安装主题 */
  installTheme: (siteId: number, name: string, source?: string) => Promise<void>;
  /** 切换主题 */
  switchTheme: (siteId: number, name: string) => Promise<void>;
  /** 卸载主题 */
  uninstallTheme: (siteId: number, name: string) => Promise<void>;
  /** 更新主题 */
  updateTheme: (siteId: number, name: string) => Promise<string>;
  /** 搜索主题市场 */
  searchThemes: (query?: string) => Promise<void>;
  /** 拉取主题配置 */
  fetchThemeConfig: (siteId: number, theme?: string) => Promise<void>;
  /** 更新主题原始文本 */
  setThemeRaw: (raw: string) => void;
  /** 保存主题配置 */
  saveThemeConfig: (siteId: number, theme: string, raw: string) => Promise<void>;

  /** 拉取插件列表 */
  fetchPlugins: (siteId: number) => Promise<void>;
  /** 安装插件 */
  installPlugin: (siteId: number, name: string) => Promise<string>;
  /** 卸载插件 */
  uninstallPlugin: (siteId: number, name: string) => Promise<string>;
  /** 启用/停用插件 */
  togglePlugin: (siteId: number, name: string, enabled: boolean) => Promise<void>;

  /** 检查 Hexo 环境 */
  fetchEnv: (path?: string, siteId?: number) => Promise<void>;

  /** 清除错误 */
  clearError: () => void;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: {},
  raw: '',
  mode: 'form',
  templates: [],
  themes: [],
  themeMarket: [],
  themeConfig: null,
  plugins: [],
  env: null,
  themeRaw: '',
  themeError: null,
  loading: false,
  saving: false,
  dirty: false,
  error: null,

  async fetchConfig(siteId) {
    set({ loading: true, error: null });
    try {
      const [config, raw] = await Promise.all([
        configService.get(siteId),
        configService.getRaw(siteId),
      ]);
      set({ config, raw, loading: false, dirty: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  setMode(mode) {
    const { mode: current, raw, config } = get();
    if (mode === current) return;

    if (mode === 'form') {
      // 从原始文本切回表单：解析并同步
      const { data, error } = parseYaml<SiteConfig>(raw);
      if (error || !data) {
        set({ error: `YAML 解析失败：${error ?? '内容为空'}` });
        return;
      }
      set({ config: data, mode, error: null });
      return;
    }

    // 从表单切到原始：序列化
    set({ raw: stringifyYaml(config), mode, error: null });
  },

  patchConfig(patch) {
    set((state) => ({
      config: { ...state.config, ...patch },
      dirty: true,
    }));
  },

  setRaw(raw) {
    set({ raw, dirty: true });
  },

  async saveConfig(siteId) {
    const { mode, config, raw } = get();
    set({ saving: true, error: null });

    try {
      if (mode === 'raw') {
        // 保存前先校验，避免写坏 _config.yml
        const { error } = parseYaml(raw);
        if (error) {
          set({ saving: false, error: `YAML 格式错误：${error}` });
          throw new Error(`YAML 格式错误：${error}`);
        }
        await configService.save(siteId, { raw });
      } else {
        await configService.save(siteId, { config });
      }
      set({ saving: false, dirty: false });
      // 重新拉取，保证两侧文本一致
      await get().fetchConfig(siteId);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ saving: false, error: message });
      throw new Error(message);
    }
  },

  async diffConfig(siteId) {
    return configService.diff(siteId);
  },

  async restoreConfig(siteId) {
    await configService.restore(siteId);
    await get().fetchConfig(siteId);
  },

  async exportConfig(siteId, targetPath) {
    const payload = await configService.exportConfig(siteId);
    await fileService.write(targetPath, payload);
  },

  async importConfig(siteId, sourcePath) {
    const payload = await fileService.read(sourcePath);
    await configService.importConfig(siteId, payload);
    await get().fetchConfig(siteId);
  },

  async fetchTemplates() {
    const templates = await configService.templates();
    set({ templates });
  },

  applyTemplate(templateId) {
    const template = get().templates.find((t) => t.id === templateId);
    if (!template) return;
    set((state) => ({
      config: { ...template.config, ...state.config },
      dirty: true,
    }));
  },

  async fetchThemes(siteId) {
    const themes = await themeService.list(siteId);
    set({ themes });
  },

  async installTheme(siteId, name, source) {
    await themeService.install(siteId, name, source);
    await get().fetchThemes(siteId);
  },

  async switchTheme(siteId, name) {
    await themeService.switch(siteId, name);
    await Promise.all([get().fetchThemes(siteId), get().fetchConfig(siteId)]);
  },

  async uninstallTheme(siteId, name) {
    await themeService.uninstall(siteId, name);
    await get().fetchThemes(siteId);
  },

  async updateTheme(siteId, name) {
    const output = await themeService.update(siteId, name);
    await get().fetchThemes(siteId);
    return output;
  },

  async searchThemes(query) {
    const themeMarket = await themeService.search(query);
    set({ themeMarket });
  },

  async fetchThemeConfig(siteId, theme) {
    set({ loading: true, themeError: null });
    try {
      const themeConfig = await themeService.getConfig(siteId, theme);
      set({ themeConfig, themeRaw: themeConfig.raw ?? '', loading: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({
        themeConfig: null,
        themeRaw: '',
        loading: false,
        error: msg,
        themeError: msg,
      });
    }
  },

  setThemeRaw(raw) {
    set({ themeRaw: raw, dirty: true });
  },

  async saveThemeConfig(siteId, theme, raw) {
    set({ saving: true, error: null });
    try {
      const { error } = parseYaml(raw);
      if (error) {
        set({ saving: false, error: `YAML 格式错误：${error}` });
        throw new Error(`YAML 格式错误：${error}`);
      }
      await themeService.updateConfig(siteId, theme, { raw });
      set({ saving: false, dirty: false });
      await get().fetchThemeConfig(siteId, theme);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ saving: false, error: message });
      throw new Error(message);
    }
  },

  async fetchPlugins(siteId) {
    const plugins = await configService.plugins(siteId);
    set({ plugins });
  },

  async installPlugin(siteId, name) {
    const output = await configService.installPlugin(siteId, name);
    await get().fetchPlugins(siteId);
    return output;
  },

  async uninstallPlugin(siteId, name) {
    const output = await configService.uninstallPlugin(siteId, name);
    await get().fetchPlugins(siteId);
    return output;
  },

  async togglePlugin(siteId, name, enabled) {
    await configService.togglePlugin(siteId, name, enabled);
    set((state) => ({
      plugins: state.plugins.map((p) => (p.name === name ? { ...p, isActive: enabled } : p)),
    }));
  },

  async fetchEnv(path, siteId) {
    try {
      const env = await (await import('@/services')).hexoService.checkEnv(path, siteId);
      set({ env });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  clearError() {
    set({ error: null });
  },
}));
