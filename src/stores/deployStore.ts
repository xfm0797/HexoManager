/** 部署状态管理 */

import { create } from 'zustand';
import { deployService, gitService, hexoService } from '@/services';
import type {
  CommitLog,
  DeployConfig,
  DeployLog,
  DeployResult,
  DeployTemplate,
  GeneratedFile,
  GenerateConfigInput,
  GitStatus,
} from '@/types';

interface DeployState {
  /** 部署配置 */
  config: DeployConfig | null;
  /** 部署历史 */
  logs: DeployLog[];
  /** 模板清单 */
  templates: DeployTemplate[];
  /** Git 状态 */
  gitStatus: GitStatus | null;
  /** 提交历史 */
  commits: CommitLog[];
  /** 生成预览 */
  preview: GeneratedFile[];
  /** 生成中 */
  generating: boolean;
  /** 部署中 */
  deploying: boolean;
  /** 加载中 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 最近一次部署结果 */
  lastResult: DeployResult | null;

  /** 拉取部署配置 */
  fetchConfig: (siteId: number) => Promise<void>;
  /** 保存部署配置 */
  saveConfig: (siteId: number, patch: Partial<DeployConfig>) => Promise<void>;
  /** 拉取模板清单 */
  fetchTemplates: () => Promise<void>;
  /** 生成预览 */
  previewConfig: (input: GenerateConfigInput) => Promise<GeneratedFile[]>;
  /** 生成并写入配置文件 */
  generateConfig: (input: GenerateConfigInput) => Promise<GeneratedFile[]>;
  /** 检查已存在的配置文件 */
  checkFiles: (input: GenerateConfigInput) => Promise<[string, boolean][]>;
  /** 拉取部署历史 */
  fetchLogs: (siteId: number, limit?: number) => Promise<void>;
  /** 刷新 Git 状态 */
  fetchGitStatus: (siteId: number) => Promise<void>;
  /** 拉取提交历史 */
  fetchCommits: (siteId: number, limit?: number) => Promise<void>;
  /** 一键部署：构建 → 暂存 → 提交 → 推送 */
  deploy: (
    siteId: number,
    message: string,
    options?: { skipBuild?: boolean; onLog?: (line: string) => void },
  ) => Promise<DeployResult>;
  /** 回滚到指定提交 */
  rollback: (siteId: number, commitHash: string) => Promise<string>;
  /** 清除错误 */
  clearError: () => void;
}

export const useDeployStore = create<DeployState>((set, get) => ({
  config: null,
  logs: [],
  templates: [],
  gitStatus: null,
  commits: [],
  preview: [],
  generating: false,
  deploying: false,
  loading: false,
  error: null,
  lastResult: null,

  async fetchConfig(siteId) {
    set({ loading: true, error: null });
    try {
      const config = await deployService.getConfig(siteId);
      set({ config, loading: false });
    } catch (e) {
      set({
        config: null,
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  async saveConfig(siteId, patch) {
    await deployService.save(siteId, patch);
    set((state) => ({
      config: state.config ? { ...state.config, ...patch } : state.config,
    }));
  },

  async fetchTemplates() {
    const templates = await deployService.templates();
    set({ templates });
  },

  async previewConfig(input) {
    set({ generating: true, error: null });
    try {
      const preview = await deployService.preview(input);
      set({ preview, generating: false });
      return preview;
    } catch (e) {
      set({ generating: false, error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  },

  async generateConfig(input) {
    set({ generating: true, error: null });
    try {
      const files = await deployService.generate(input);
      set({ preview: files, generating: false });
      return files;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ generating: false, error: message });
      throw new Error(message);
    }
  },

  async checkFiles(input) {
    return deployService.checkFiles(input);
  },

  async fetchLogs(siteId, limit = 50) {
    const logs = await deployService.logs(siteId, limit);
    set({ logs });
  },

  async fetchGitStatus(siteId) {
    const gitStatus = await gitService.status(siteId);
    set({ gitStatus });
  },

  async fetchCommits(siteId, limit = 50) {
    const commits = await gitService.log(siteId, limit);
    set({ commits });
  },

  async deploy(siteId, message, options) {
    const { onLog } = options ?? {};
    set({ deploying: true, error: null });

    try {
      // 构建（可跳过）
      if (!options?.skipBuild) {
        onLog?.('$ hexo clean && hexo generate');
        const build = await hexoService.build(siteId);
        const buildOutput = build.output || build.error || '';
        buildOutput
          .split('\n')
          .filter(Boolean)
          .forEach((line) => onLog?.(line));

        if (!build.success) {
          throw new Error(build.error ?? '站点构建失败');
        }
      }

      // 部署（暂存 + 提交 + 推送）
      const result = await hexoService.deployGit(siteId, message);
      (result.output ?? '')
        .split('\n')
        .filter(Boolean)
        .forEach((line) => onLog?.(line));

      set({ deploying: false, lastResult: result });
      await Promise.all([
        get().fetchLogs(siteId),
        get().fetchGitStatus(siteId),
        get().fetchCommits(siteId),
      ]);

      if (!result.success) {
        throw new Error(result.error ?? '部署失败');
      }
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ deploying: false, error: msg });
      await get().fetchLogs(siteId);
      throw new Error(msg);
    }
  },

  async rollback(siteId, commitHash) {
    const output = await deployService.rollback(siteId, commitHash);
    await Promise.all([
      get().fetchGitStatus(siteId),
      get().fetchCommits(siteId),
      get().fetchLogs(siteId),
    ]);
    return output;
  },

  clearError() {
    set({ error: null });
  },
}));
