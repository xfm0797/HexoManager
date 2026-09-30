/** 站点配置编辑 Hook：结构化表单 + 原始 YAML 双模式 */

import { createElement, useCallback, useEffect, useMemo } from 'react';
import { App as AntdApp, Modal } from 'antd';
import { useConfigStore } from '@/stores';
import { stringifyYaml } from '@/utils/yaml';

/** 站点 _config.yml 编辑 */
export function useSiteConfig(siteId: number | null) {
  const { message } = AntdApp.useApp();

  const config = useConfigStore((s) => s.config);
  const raw = useConfigStore((s) => s.raw);
  const mode = useConfigStore((s) => s.mode);
  const saving = useConfigStore((s) => s.saving);
  const loading = useConfigStore((s) => s.loading);
  const dirty = useConfigStore((s) => s.dirty);

  const fetchConfig = useConfigStore((s) => s.fetchConfig);
  const setMode = useConfigStore((s) => s.setMode);
  const patchConfig = useConfigStore((s) => s.patchConfig);
  const setRaw = useConfigStore((s) => s.setRaw);
  const saveConfig = useConfigStore((s) => s.saveConfig);
  const diffConfig = useConfigStore((s) => s.diffConfig);
  const restoreConfig = useConfigStore((s) => s.restoreConfig);

  useEffect(() => {
    if (siteId === null) return;
    void fetchConfig(siteId);
  }, [siteId, fetchConfig]);

  const save = useCallback(async () => {
    if (siteId === null) return;
    try {
      await saveConfig(siteId);
      message.success('配置已保存');
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  }, [siteId, saveConfig, message]);

  const showDiff = useCallback(async () => {
    if (siteId === null) return;
    const text = await diffConfig(siteId);
    Modal.info({
      title: '配置差异（Git Diff）',
      width: 760,
      content: createElement(
        'pre',
        {
          className: 'max-h-[60vh] overflow-auto rounded bg-gray-50 p-3 text-xs leading-relaxed',
        },
        text || '当前没有未提交的改动',
      ),
    });
  }, [siteId, diffConfig]);

  const restore = useCallback(async () => {
    if (siteId === null) return;
    try {
      await restoreConfig(siteId);
      message.success('已恢复到备份版本');
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  }, [siteId, restoreConfig, message]);

  /** 表单模式下实时推导 YAML 预览文本 */
  const previewYaml = useMemo(
    () => (mode === 'form' ? stringifyYaml(config) : raw),
    [mode, config, raw],
  );

  return {
    config,
    raw,
    previewYaml,
    mode,
    loading,
    saving,
    dirty,
    setMode,
    patchConfig,
    setRaw,
    save,
    showDiff,
    restore,
    refresh: () => (siteId === null ? Promise.resolve() : fetchConfig(siteId)),
  };
}
