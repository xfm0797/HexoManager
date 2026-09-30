/** 主题与插件管理 Hook */

import { useCallback, useEffect, useState } from 'react';
import { App as AntdApp } from 'antd';
import { useConfigStore } from '@/stores';
import type { Theme } from '@/types';

/** 主题列表与操作 */
export function useThemes(siteId: number | null) {
  const { message, modal } = AntdApp.useApp();

  const themes = useConfigStore((s) => s.themes);
  const themeMarket = useConfigStore((s) => s.themeMarket);
  const loading = useConfigStore((s) => s.loading);

  const fetchThemes = useConfigStore((s) => s.fetchThemes);
  const installTheme = useConfigStore((s) => s.installTheme);
  const switchTheme = useConfigStore((s) => s.switchTheme);
  const uninstallTheme = useConfigStore((s) => s.uninstallTheme);
  const updateTheme = useConfigStore((s) => s.updateTheme);
  const searchThemes = useConfigStore((s) => s.searchThemes);

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (siteId === null) return;
    void fetchThemes(siteId);
  }, [siteId, fetchThemes]);

  const active = themes.find((t) => t.isActive) ?? null;

  const doSwitch = useCallback(
    async (theme: Theme) => {
      if (siteId === null || theme.isActive) return;
      setBusy(true);
      try {
        await switchTheme(siteId, theme.name);
        message.success(`已切换到主题「${theme.name}」`);
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [siteId, switchTheme, message],
  );

  const doInstall = useCallback(
    async (name: string, source?: string) => {
      if (siteId === null) return null;
      setBusy(true);
      try {
        await installTheme(siteId, name, source);
        message.success(`主题「${name}」安装完成`);
        return name;
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [siteId, installTheme, message],
  );

  const doUninstall = useCallback(
    async (theme: Theme) => {
      if (siteId === null) return;

      await new Promise<void>((resolve, reject) => {
        modal.confirm({
          title: `卸载主题「${theme.name}」？`,
          content: '主题目录及其配置将被删除，此操作不可撤销。',
          okText: '卸载',
          okButtonProps: { danger: true },
          cancelText: '取消',
          onOk: () => resolve(),
          onCancel: () => reject(new Error('已取消')),
        });
      }).catch(() => {
        throw new Error('已取消');
      });

      setBusy(true);
      try {
        await uninstallTheme(siteId, theme.name);
        message.success('主题已卸载');
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [siteId, uninstallTheme, modal, message],
  );

  const doUpdate = useCallback(
    async (theme: Theme) => {
      if (siteId === null) return;
      setBusy(true);
      try {
        await updateTheme(siteId, theme.name);
        message.success(`主题「${theme.name}」已更新`);
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [siteId, updateTheme, message],
  );

  return {
    themes,
    active,
    market: themeMarket,
    loading,
    busy,
    switchTheme: doSwitch,
    install: doInstall,
    uninstall: doUninstall,
    update: doUpdate,
    search: searchThemes,
    refresh: () => (siteId === null ? Promise.resolve() : fetchThemes(siteId)),
  };
}

/** 插件列表与操作 */
export function usePlugins(siteId: number | null) {
  const { message } = AntdApp.useApp();

  const plugins = useConfigStore((s) => s.plugins);
  const fetchPlugins = useConfigStore((s) => s.fetchPlugins);
  const installPlugin = useConfigStore((s) => s.installPlugin);
  const uninstallPlugin = useConfigStore((s) => s.uninstallPlugin);
  const togglePlugin = useConfigStore((s) => s.togglePlugin);

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (siteId === null) return;
    void fetchPlugins(siteId);
  }, [siteId, fetchPlugins]);

  const doInstall = useCallback(
    async (name: string) => {
      if (siteId === null) return;
      setBusy(true);
      try {
        await installPlugin(siteId, name);
        message.success(`插件「${name}」安装完成`);
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [siteId, installPlugin, message],
  );

  const doUninstall = useCallback(
    async (name: string) => {
      if (siteId === null) return;
      setBusy(true);
      try {
        await uninstallPlugin(siteId, name);
        message.success(`插件「${name}」已卸载`);
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [siteId, uninstallPlugin, message],
  );

  const doToggle = useCallback(
    async (name: string, enabled: boolean) => {
      if (siteId === null) return;
      try {
        await togglePlugin(siteId, name, enabled);
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
      }
    },
    [siteId, togglePlugin, message],
  );

  return {
    plugins,
    busy,
    install: doInstall,
    uninstall: doUninstall,
    toggle: doToggle,
    refresh: () => (siteId === null ? Promise.resolve() : fetchPlugins(siteId)),
  };
}

/** 主题配置编辑（原始 YAML 模式） */
export function useThemeConfig(siteId: number | null, themeName?: string | null) {
  const { message } = AntdApp.useApp();

  const themeConfig = useConfigStore((s) => s.themeConfig);
  const themeRaw = useConfigStore((s) => s.themeRaw);
  const loading = useConfigStore((s) => s.loading);
  const saving = useConfigStore((s) => s.saving);

  const fetchThemeConfig = useConfigStore((s) => s.fetchThemeConfig);
  const setThemeRaw = useConfigStore((s) => s.setThemeRaw);
  const saveThemeConfig = useConfigStore((s) => s.saveThemeConfig);

  const theme = themeName ?? themeConfig?.themeName ?? null;

  useEffect(() => {
    if (siteId === null) return;
    void fetchThemeConfig(siteId, themeName ?? undefined);
  }, [siteId, themeName, fetchThemeConfig]);

  const save = useCallback(
    async (raw: string) => {
      if (siteId === null || theme === null) return;
      try {
        await saveThemeConfig(siteId, theme, raw);
        message.success('主题配置已保存');
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
      }
    },
    [siteId, theme, saveThemeConfig, message],
  );

  return { themeConfig, raw: themeRaw, loading, saving, setRaw: setThemeRaw, save };
}
