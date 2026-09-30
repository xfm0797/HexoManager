/** 部署 Hook：配置生成、部署执行、部署历史 */

import { useCallback, useEffect, useState } from 'react';
import { App as AntdApp } from 'antd';
import { useDeployStore } from '@/stores';
import type {
  DeployConfig,
  DeployLog,
  DeployResult,
  DeployTemplate,
  GeneratedFile,
  GenerateConfigInput,
} from '@/types';

/** 部署配置生成与预览 */
export function useDeployConfig(siteId: number | null) {
  const { message } = AntdApp.useApp();
  const config = useDeployStore((s) => s.config);
  const templates = useDeployStore((s) => s.templates);
  const preview = useDeployStore((s) => s.preview);
  const generating = useDeployStore((s) => s.generating);
  const loading = useDeployStore((s) => s.loading);

  const fetchConfig = useDeployStore((s) => s.fetchConfig);
  const fetchTemplates = useDeployStore((s) => s.fetchTemplates);
  const saveConfig = useDeployStore((s) => s.saveConfig);
  const previewConfig = useDeployStore((s) => s.previewConfig);
  const generateConfig = useDeployStore((s) => s.generateConfig);
  const checkFiles = useDeployStore((s) => s.checkFiles);

  useEffect(() => {
    if (siteId === null) return;
    void fetchConfig(siteId);
  }, [siteId, fetchConfig]);

  useEffect(() => {
    if (templates.length === 0) void fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(
    async (patch: Partial<DeployConfig>) => {
      if (siteId === null) return;
      await saveConfig(siteId, patch);
      message.success('部署配置已保存');
    },
    [siteId, saveConfig, message],
  );

  const doPreview = useCallback(
    async (input: GenerateConfigInput) => {
      try {
        return await previewConfig(input);
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
        throw e;
      }
    },
    [previewConfig, message],
  );

  const doGenerate = useCallback(
    async (input: GenerateConfigInput) => {
      try {
        const files = await generateConfig(input);
        message.success(`已生成 ${files.length} 个配置文件`);
        return files;
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
        throw e;
      }
    },
    [generateConfig, message],
  );

  return {
    config,
    templates: templates as DeployTemplate[],
    generatedPreview: preview as GeneratedFile[],
    templatesLoading: loading,
    generating,
    save,
    preview: doPreview,
    generate: doGenerate,
    checkFiles,
    refresh: () => (siteId === null ? Promise.resolve() : fetchConfig(siteId)),
  };
}

/** 部署执行与历史 */
export function useDeploy(siteId: number | null) {
  const { message, modal } = AntdApp.useApp();
  const logs = useDeployStore((s) => s.logs);
  const deploying = useDeployStore((s) => s.deploying);
  const lastResult = useDeployStore((s) => s.lastResult);
  const gitStatus = useDeployStore((s) => s.gitStatus);
  const fetchLogs = useDeployStore((s) => s.fetchLogs);
  const deploy = useDeployStore((s) => s.deploy);
  const rollback = useDeployStore((s) => s.rollback);

  const [logLines, setLogLines] = useState<string[]>([]);

  useEffect(() => {
    if (siteId === null) return;
    void fetchLogs(siteId);
  }, [siteId, fetchLogs]);

  const start = useCallback(
    async (commitMessage: string, options?: { skipBuild?: boolean }): Promise<DeployResult> => {
      if (siteId === null) throw new Error('未选择站点');
      setLogLines([]);

      try {
        const result = await deploy(siteId, commitMessage, {
          skipBuild: options?.skipBuild,
          onLog: (line) => setLogLines((prev) => [...prev, line]),
        });
        message.success('部署完成');
        return result;
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
        throw e;
      }
    },
    [siteId, deploy, message],
  );

  const doRollback = useCallback(
    async (commitHash: string) => {
      if (siteId === null) return;

      await new Promise<void>((resolve, reject) => {
        modal.confirm({
          title: '确认回滚？',
          content: `将把工作区重置到提交 ${commitHash.slice(0, 7)}，未提交的改动会丢失。`,
          okText: '确认回滚',
          okButtonProps: { danger: true },
          cancelText: '取消',
          onOk: () => resolve(),
          onCancel: () => reject(new Error('已取消')),
        });
      });

      const output = await rollback(siteId, commitHash);
      message.success('回滚完成');
      return output;
    },
    [siteId, rollback, modal, message],
  );

  return {
    logs: logs as DeployLog[],
    deploying,
    lastResult,
    gitStatus,
    logLines,
    start,
    rollback: doRollback,
    refreshLogs: () => (siteId === null ? Promise.resolve() : fetchLogs(siteId)),
  };
}
