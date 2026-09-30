/** Git 操作 Hook */

import { useCallback, useEffect, useState } from 'react';
import { App as AntdApp } from 'antd';
import { gitService } from '@/services';
import { useDeployStore } from '@/stores';
import type { CommitLog, GitStatus } from '@/types';

interface UseGitResult {
  status: GitStatus | null;
  commits: CommitLog[];
  diff: string;
  loading: boolean;
  busy: boolean;
  refresh: () => Promise<void>;
  refreshCommits: () => Promise<void>;
  loadDiff: () => Promise<void>;
  init: () => Promise<void>;
  add: (files?: string[]) => Promise<void>;
  commit: (message: string) => Promise<CommitLog>;
  push: () => Promise<void>;
  pull: () => Promise<void>;
  discard: (files?: string[]) => Promise<void>;
  stash: () => Promise<void>;
  stashPop: () => Promise<void>;
  setRemote: (url: string, branch?: string) => Promise<void>;
}
/** Git 状态与常用操作（跟随当前站点） */
export function useGit(siteId: number | null): UseGitResult {
  const { message } = AntdApp.useApp();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [diff, setDiff] = useState('');

  const status = useDeployStore((s) => s.gitStatus);
  const commits = useDeployStore((s) => s.commits);
  const fetchGitStatus = useDeployStore((s) => s.fetchGitStatus);
  const fetchCommits = useDeployStore((s) => s.fetchCommits);

  const refresh = useCallback(async () => {
    if (siteId === null) return;
    setLoading(true);
    try {
      await fetchGitStatus(siteId);
    } finally {
      setLoading(false);
    }
  }, [siteId, fetchGitStatus]);

  const refreshCommits = useCallback(async () => {
    if (siteId === null) return;
    await fetchCommits(siteId);
  }, [siteId, fetchCommits]);

  useEffect(() => {
    if (siteId === null) return;
    void refresh();
    void refreshCommits();
  }, [siteId, refresh, refreshCommits]);

  /** 统一包裹写操作：置忙、失败提示、结束刷新状态 */
  const run = useCallback(
    async <T>(action: () => Promise<T>, successText?: string): Promise<T> => {
      setBusy(true);
      try {
        const result = await action();
        if (siteId !== null) await fetchGitStatus(siteId);
        if (successText) message.success(successText);
        return result;
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [siteId, fetchGitStatus, message],
  );

  const loadDiff = useCallback(async () => {
    if (siteId === null) {
      setDiff('');
      return;
    }
    const text = await gitService.diff(siteId);
    setDiff(text);
  }, [siteId]);

  const init = useCallback(
    () => run(() => gitService.init(siteId as number).then(() => undefined), 'Git 仓库初始化完成'),
    [run, siteId],
  );
  const add = useCallback(
    (files?: string[]) => run(() => gitService.add(siteId as number, files)),
    [run, siteId],
  );
  const commit = useCallback(
    (msg: string) =>
      run(async () => {
        const log = await gitService.commit(siteId as number, msg);
        await refreshCommits();
        return log;
      }, '提交成功'),
    [run, siteId, refreshCommits],
  );
  const push = useCallback(
    () =>
      run(async () => {
        await gitService.push(siteId as number);
        await refreshCommits();
      }, '推送成功'),
    [run, siteId, refreshCommits],
  );
  const pull = useCallback(
    () => run(() => gitService.pull(siteId as number).then(() => undefined), '拉取成功'),
    [run, siteId],
  );
  const discard = useCallback(
    (files?: string[]) =>
      run(async () => {
        await gitService.discard(siteId as number, files);
        setDiff('');
      }, '已放弃更改'),
    [run, siteId],
  );
  const stash = useCallback(
    () => run(() => gitService.stash(siteId as number).then(() => undefined), '已暂存当前改动'),
    [run, siteId],
  );
  const stashPop = useCallback(
    () => run(() => gitService.stashPop(siteId as number).then(() => undefined), '已恢复暂存改动'),
    [run, siteId],
  );
  const setRemote = useCallback(
    (url: string, branch?: string) =>
      run(async () => {
        await gitService.setRemote(siteId as number, url, branch);
      }, '远程仓库已更新'),
    [run, siteId],
  );

  return {
    status,
    commits,
    diff,
    loading,
    busy,
    refresh,
    refreshCommits,
    loadDiff,
    init,
    add,
    commit,
    push,
    pull,
    discard,
    stash,
    stashPop,
    setRemote,
  };
}
