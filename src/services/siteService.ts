/** 站点管理服务层 */

import { call, callSafe } from './invoke';
import type { CreateSiteInput, FileTreeNode, Site, SiteStats, UpdateSiteInput } from '@/types';

export const siteService = {
  /** 获取全部站点 */
  list(): Promise<Site[]> {
    return callSafe<Site[]>('get_sites', undefined, []);
  },

  /** 获取单个站点 */
  get(siteId: number): Promise<Site> {
    return call<Site>('get_site', { siteId });
  },

  /** 创建站点 */
  create(input: CreateSiteInput): Promise<Site> {
    return call<Site>('create_site', { input });
  },

  /** 导入已有站点 */
  import(path: string): Promise<Site> {
    return call<Site>('import_site', { path });
  },

  /** 更新站点信息 */
  update(siteId: number, updates: UpdateSiteInput): Promise<Site> {
    return call<Site>('update_site', { siteId, updates });
  },

  /** 删除站点 */
  remove(siteId: number, deleteFiles = false): Promise<void> {
    return call<void>('delete_site', { siteId, deleteFiles });
  },

  /** 复制站点 */
  duplicate(siteId: number, newName: string, newPath: string): Promise<Site> {
    return call<Site>('duplicate_site', { siteId, newName, newPath });
  },

  /** 获取站点统计 */
  stats(siteId: number): Promise<SiteStats> {
    return call<SiteStats>('get_site_stats', { siteId });
  },

  /** 备份站点 */
  backup(siteId: number, backupPath: string): Promise<string> {
    return call<string>('backup_site', { siteId, backupPath });
  },

  /** 获取站点文件树 */
  fileTree(siteId: number, maxDepth = 4): Promise<FileTreeNode> {
    return call<FileTreeNode>('get_site_file_tree', { siteId, maxDepth });
  },
};
