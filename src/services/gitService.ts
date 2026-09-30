/** Git 服务层 */

import { call, callSafe } from './invoke';
import type { CommitLog, GitConfig, GitStatus } from '@/types';

export const gitService = {
  /** 初始化仓库 */
  init(siteId: number): Promise<string> {
    return call<string>('git_init', { siteId });
  },

  /** 查看状态 */
  status(siteId: number): Promise<GitStatus> {
    return callSafe<GitStatus>(
      'git_status',
      { siteId },
      {
        isRepo: false,
        branch: null,
        remote: null,
        ahead: 0,
        behind: 0,
        staged: [],
        unstaged: [],
        untracked: [],
        clean: true,
      },
    );
  },

  /** 暂存文件（不传则暂存全部） */
  add(siteId: number, files?: string[]): Promise<void> {
    return call<void>('git_add', { siteId, files });
  },

  /** 提交 */
  commit(siteId: number, message: string): Promise<CommitLog> {
    return call<CommitLog>('git_commit', { siteId, message });
  },

  /** 推送 */
  push(siteId: number): Promise<string> {
    return call<string>('git_push', { siteId });
  },

  /** 拉取 */
  pull(siteId: number): Promise<string> {
    return call<string>('git_pull', { siteId });
  },

  /** 提交历史 */
  log(siteId: number, limit = 50): Promise<CommitLog[]> {
    return callSafe<CommitLog[]>('git_log', { siteId, limit }, []);
  },

  /** 工作区差异 */
  diff(siteId: number): Promise<string> {
    return callSafe<string>('git_diff', { siteId }, '');
  },

  /** 设置远程仓库 */
  setRemote(siteId: number, url: string, branch?: string): Promise<void> {
    return call<void>('git_set_remote', { siteId, url, branch });
  },

  /** 放弃更改 */
  discard(siteId: number, files?: string[]): Promise<void> {
    return call<void>('git_discard_changes', { siteId, files });
  },

  /** 暂存当前改动 */
  stash(siteId: number): Promise<string> {
    return call<string>('git_stash', { siteId });
  },

  /** 恢复暂存 */
  stashPop(siteId: number): Promise<string> {
    return call<string>('git_stash_pop', { siteId });
  },

  /** 获取 Git 配置 */
  getConfig(siteId: number): Promise<GitConfig | null> {
    return callSafe<GitConfig | null>('get_git_config', { siteId }, null);
  },
};
