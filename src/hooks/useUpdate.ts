/** 更新检查 Hook */

import { useCallback, useEffect } from 'react';
import { App as AntdApp } from 'antd';
import { useUpdateStore } from '@/stores';
import type { UpdateInfo } from '@/types';

/** 检查更新、下载与安装 */
export function useUpdate(options?: { autoCheck?: boolean }) {
  const { message, modal } = AntdApp.useApp();
  const shouldAutoCheck = options?.autoCheck ?? true;

  const appInfo = useUpdateStore((s) => s.appInfo);
  const settings = useUpdateStore((s) => s.settings);
  const updateInfo = useUpdateStore((s) => s.updateInfo);
  const changelog = useUpdateStore((s) => s.changelog);
  const checking = useUpdateStore((s) => s.checking);
  const downloading = useUpdateStore((s) => s.downloading);
  const progress = useUpdateStore((s) => s.progress);
  const downloadResult = useUpdateStore((s) => s.downloadResult);

  const fetchAppInfo = useUpdateStore((s) => s.fetchAppInfo);
  const fetchSettings = useUpdateStore((s) => s.fetchSettings);
  const fetchConfig = useUpdateStore((s) => s.fetchConfig);
  const saveSettings = useUpdateStore((s) => s.saveSettings);
  const checkUpdate = useUpdateStore((s) => s.checkUpdate);
  const downloadUpdate = useUpdateStore((s) => s.downloadUpdate);
  const installUpdate = useUpdateStore((s) => s.installUpdate);
  const fetchChangelog = useUpdateStore((s) => s.fetchChangelog);
  const skipVersion = useUpdateStore((s) => s.skipVersion);
  const openExternal = useUpdateStore((s) => s.openExternal);

  useEffect(() => {
    if (appInfo === null) void fetchAppInfo();
    void fetchSettings();
    void fetchConfig();
    void fetchChangelog();
    if (shouldAutoCheck) void checkUpdate(true);
    // 仅在首次挂载时执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const check = useCallback(
    async (silent = false): Promise<UpdateInfo | null> => {
      try {
        const info = await checkUpdate(silent);
        if (!silent) {
          if (info.available) {
            message.info(`发现新版本 ${info.latestVersion}`);
          } else if (info.error) {
            message.warning(`检查更新失败：${info.error}`);
          } else {
            message.success('当前已是最新版本');
          }
        }
        return info;
      } catch (e) {
        if (!silent) message.error(e instanceof Error ? e.message : String(e));
        return null;
      }
    },
    [checkUpdate, message],
  );

  const download = useCallback(
    async (url: string, targetDir?: string) => {
      try {
        const result = await downloadUpdate(url, targetDir);
        message.success('更新包下载完成');
        return result;
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
        return null;
      }
    },
    [downloadUpdate, message],
  );

  const install = useCallback(
    async (path: string) => {
      await new Promise<void>((resolve, reject) => {
        modal.confirm({
          title: '安装更新？',
          content: '应用将关闭并启动安装程序，请先保存正在编辑的内容。',
          okText: '立即安装',
          cancelText: '稍后',
          onOk: () => resolve(),
          onCancel: () => reject(new Error('已取消')),
        });
      }).catch(() => {
        throw new Error('已取消');
      });

      try {
        await installUpdate(path);
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
      }
    },
    [installUpdate, modal, message],
  );

  const toggleAutoCheck = useCallback(
    async (enabled: boolean) => {
      await saveSettings({ autoCheck: enabled });
      message.success(enabled ? '已开启自动检查更新' : '已关闭自动检查更新');
    },
    [saveSettings, message],
  );

  return {
    appInfo,
    settings,
    updateInfo,
    changelog,
    checking,
    downloading,
    progress,
    downloadResult,
    check,
    download,
    install,
    skipVersion,
    openExternal,
    toggleAutoCheck,
    refreshChangelog: fetchChangelog,
  };
}

/** 更新源配置（轻量 Hook，供顶栏等处展示） */
export function useUpdateConfig() {
  const config = useUpdateStore((s) => s.config);
  const fetchConfig = useUpdateStore((s) => s.fetchConfig);
  return { config, fetchConfig };
}
