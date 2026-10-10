/** Hexo 构建、预览与环境检测 Hook */

import { useCallback, useEffect, useState } from 'react';
import { App as AntdApp } from 'antd';
import { hexoService } from '@/services';
import { useUiStore } from '@/stores';
import { t } from '@/i18n';
import type { BuildResult, EnvCheck, PreviewServer } from '@/types';
/** 构建 / 清理 / 生成 */
export function useHexoBuild(siteId: number | null) {
  const { message } = AntdApp.useApp();
  const [building, setBuilding] = useState(false);
  const [action, setAction] = useState<'build' | 'clean' | 'generate' | 'deploy' | null>(null);
  const [lastResult, setLastResult] = useState<BuildResult | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);

  const run = useCallback(
    async (
      kind: 'build' | 'clean' | 'generate' | 'deploy',
      successText: string,
    ): Promise<BuildResult | null> => {
      if (siteId === null) {
        message.warning(t('请先选择站点'));
        return null;
      }

      setBuilding(true);
      setAction(kind);
      setLogLines([`$ hexo ${kind}`]);

      try {
        const result =
          kind === 'build'
            ? await hexoService.build(siteId)
            : kind === 'clean'
              ? await hexoService.clean(siteId)
              : kind === 'generate'
                ? await hexoService.generate(siteId)
                : await hexoService.deploy(siteId);

        const output = result.output || result.error || '';
        setLogLines((prev) => [
          ...prev,
          ...output.split('\n').filter((line) => line.trim() !== ''),
        ]);
        setLastResult(result);

        if (result.success) {
          message.success(
            t('{text}（耗时 {seconds}s）', {
              text: successText,
              seconds: (result.durationMs / 1000).toFixed(1),
            }),
          );
        } else {
          message.error(result.error ?? t('{text}失败', { text: successText }));
        }
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setLogLines((prev) => [...prev, t('[错误] {msg}', { msg })]);
        message.error(msg);
        return null;
      } finally {
        setBuilding(false);
        setAction(null);
      }
    },
    [siteId, message],
  );

  return {
    building,
    action,
    lastResult,
    logLines,
    build: () => run('build', t('构建完成')),
    clean: () => run('clean', t('清理完成')),
    generate: () => run('generate', t('生成完成')),
    deploy: () => run('deploy', t('部署完成')),
  };
}

/** 本地预览服务 */
export function useHexoServer(siteId: number | null) {
  const { message } = AntdApp.useApp();
  const servers = useUiStore((s) => s.servers);
  const refreshServers = useUiStore((s) => s.refreshServers);
  const startServer = useUiStore((s) => s.startServer);
  const stopServer = useUiStore((s) => s.stopServer);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    void refreshServers();
  }, [refreshServers]);

  const current = servers.find((s) => s.siteId === siteId) ?? null;

  const start = useCallback(
    async (port?: number): Promise<PreviewServer | null> => {
      if (siteId === null) {
        message.warning(t('请先选择站点'));
        return null;
      }
      setStarting(true);
      try {
        const server = await startServer(siteId, port);
        message.success(t('预览服务已启动：{url}', { url: server.url }));
        return server;
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setStarting(false);
      }
    },
    [siteId, startServer, message],
  );

  const stop = useCallback(
    async (pid?: number) => {
      const target = pid ?? current?.pid;
      if (target === undefined) return;
      try {
        await stopServer(target);
        message.success(t('预览服务已停止'));
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
      }
    },
    [current, stopServer, message],
  );

  return { servers, current, starting, start, stop, refresh: refreshServers };
}

/** Hexo 环境检测 */
export function useHexoEnv(path?: string, siteId?: number) {
  const [env, setEnv] = useState<EnvCheck | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await hexoService.checkEnv(path, siteId);
      setEnv(result);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, [path, siteId]);

  useEffect(() => {
    if (path === undefined && siteId === undefined) return;
    void check();
  }, [check, path, siteId]);

  const install = useCallback(
    async (targetPath?: string) => {
      setLoading(true);
      try {
        const output = await hexoService.installHexo(targetPath ?? path);
        await check();
        return output;
      } finally {
        setLoading(false);
      }
    },
    [check, path],
  );

  return { env, loading, error, check, install };
}
