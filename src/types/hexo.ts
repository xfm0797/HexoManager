/** Hexo 环境与预览相关类型定义 */

/** Hexo 环境检查结果 */
export interface EnvCheck {
  nodeInstalled: boolean;
  nodeVersion: string | null;
  npmInstalled: boolean;
  npmVersion: string | null;
  gitInstalled: boolean;
  gitVersion: string | null;
  hexoInstalled: boolean;
  hexoVersion: string | null;
  isHexoSite: boolean;
  hasNodeModules: boolean;
  issues: string[];
  ready: boolean;
}

/** 构建结果 */
export interface BuildResult {
  success: boolean;
  durationMs: number;
  output: string;
  error: string | null;
  filesGenerated: number | null;
}

/** 预览服务 */
export interface PreviewServer {
  pid: number;
  siteId: number;
  port: number;
  url: string;
  startedAt: string;
  running: boolean;
}

/** 进程执行结果 */
export interface ProcessOutput {
  success: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}
