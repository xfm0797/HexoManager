/** 站点相关类型定义 */

/** 站点记录 */
export interface Site {
  id: number;
  name: string;
  description: string | null;
  domain: string | null;
  path: string;
  nodeVersion: string | null;
  theme: string | null;
  status: string | null;
  articleCount: number;
  draftCount: number;
  lastDeployAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** 创建站点入参 */
export interface CreateSiteInput {
  name: string;
  path: string;
  description?: string;
  domain?: string;
  theme?: string;
  nodeVersion?: string;
  repoUrl?: string;
  branch?: string;
}

/** 更新站点入参 */
export interface UpdateSiteInput {
  name?: string;
  description?: string;
  domain?: string;
  theme?: string;
  status?: string;
  nodeVersion?: string;
}

/** 站点统计 */
export interface SiteStats {
  articleCount: number;
  draftCount: number;
  publishedCount: number;
  totalWords: number;
  categories: string[];
  tags: string[];
  lastDeployAt: string | null;
  diskUsage: number;
}

/** 站点状态枚举 */
export type SiteStatus = 'active' | 'archived' | 'error';

/** 文件信息 */
export interface FileInfo {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modifiedAt: string | null;
  extension: string | null;
}

/** 文件树节点 */
export interface FileTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  children: FileTreeNode[];
}
