/** Hexo 构建与预览服务层 */

import { call, callSafe, listen } from './invoke';
import type { BuildResult, EnvCheck, PreviewServer } from '@/types';

export const hexoService = {
  /** 完整构建（clean + generate） */
  build(siteId: number): Promise<BuildResult> {
    return call<BuildResult>('hexo_build', { siteId });
  },

  /** 清理缓存 */
  clean(siteId: number): Promise<BuildResult> {
    return call<BuildResult>('hexo_clean', { siteId });
  },

  /** 生成静态文件 */
  generate(siteId: number): Promise<BuildResult> {
    return call<BuildResult>('hexo_generate', { siteId });
  },

  /** 启动预览服务 */
  startServer(siteId: number, port?: number): Promise<PreviewServer> {
    return call<PreviewServer>('hexo_server_start', { siteId, port });
  },

  /** 停止预览服务 */
  stopServer(pid: number): Promise<void> {
    return call<void>('hexo_server_stop', { pid });
  },

  /** 列出运行中的预览服务 */
  listServers(): Promise<PreviewServer[]> {
    return callSafe<PreviewServer[]>('hexo_server_list', undefined, []);
  },

  /** `hexo new post` */
  newPost(siteId: number, title: string): Promise<string> {
    return call<string>('hexo_new_post', { siteId, title });
  },

  /** `hexo new draft` */
  newDraft(siteId: number, title: string): Promise<string> {
    return call<string>('hexo_new_draft', { siteId, title });
  },

  /** `hexo publish` */
  publish(siteId: number, slug: string): Promise<string> {
    return call<string>('hexo_publish', { siteId, slug });
  },

  /** `hexo deploy` */
  deploy(siteId: number): Promise<BuildResult> {
    return call<BuildResult>('hexo_deploy', { siteId });
  },

  /** 检查环境 */
  checkEnv(path?: string, siteId?: number): Promise<EnvCheck> {
    return call<EnvCheck>('check_hexo_env', { path, siteId });
  },

  /** 安装 Hexo CLI */
  installHexo(path?: string): Promise<string> {
    return call<string>('install_hexo', { path });
  },

  /** 一键部署（git add + commit + push） */
  deployGit(siteId: number, message: string): Promise<import('@/types').DeployResult> {
    return call<import('@/types').DeployResult>('deploy_site', { siteId, message });
  },

  /** 订阅构建日志事件 */
  onBuildLog(handler: (line: string) => void): Promise<() => void> {
    return listen<string>('deploy:log', (event) => handler(event.payload));
  },
};
