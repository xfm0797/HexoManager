/** 部署与 Git 相关类型定义 */

/** Git 文件状态 */
export interface GitFileStatus {
  path: string;
  worktree: string;
  index: string;
  staged: boolean;
}

/** Git 状态 */
export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  remote: string | null;
  ahead: number;
  behind: number;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: GitFileStatus[];
  clean: boolean;
}

/** 提交记录 */
export interface CommitLog {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

/** Git 配置 */
export interface GitConfig {
  siteId: number;
  remoteUrl: string;
  branch: string;
  autoDeploy: boolean;
  lastCommit: string | null;
  lastCommitMsg: string | null;
  lastPushAt: string | null;
}

/** 环境变量 */
export interface EnvVar {
  key: string;
  value: string;
  secret?: boolean;
}

/** 部署配置 */
export interface DeployConfig {
  siteId: number;
  repoPlatform: string;
  ciPlatforms: string[];
  nodeVersion: string;
  buildCommand: string;
  deployTargets: string[];
  envVars: EnvVar[];
  edgeProvider: string | null;
  edgeDomain: string | null;
  originStrategy: string;
}

/** 生成的配置文件 */
export interface GeneratedFile {
  path: string;
  content: string;
  description: string;
  platform: string;
}

/** 部署配置生成入参 */
export interface GenerateConfigInput {
  sitePath: string;
  siteName?: string;
  domain?: string;
  repoUrl?: string;
  repoPlatform?: string;
  ciPlatforms?: string[];
  nodeVersion?: string;
  buildCommand?: string;
  envVars?: EnvVar[];
  edgeProvider?: string;
  edgeDomain?: string;
  originStrategy?: string;
  writeFiles?: boolean;
}

/** 部署模板 */
export interface DeployTemplate {
  id: string;
  name: string;
  platform: string;
  files: string[];
  description: string;
  officialUrl: string;
}

/** 部署记录 */
export interface DeployLog {
  id: number;
  siteId: number;
  status: string;
  commitMessage: string | null;
  commitHash: string | null;
  branch: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  output: string | null;
  createdAt: string | null;
}

/** 部署结果 */
export interface DeployResult {
  success: boolean;
  commitHash: string | null;
  remote: string | null;
  branch: string | null;
  durationMs: number;
  output: string;
  error: string | null;
}

/** 平台标识 */
export type PlatformId =
  'github' | 'gitee' | 'gitlab' | 'vercel' | 'netlify' | 'cloudflare' | 'edgeone' | 'edge';
