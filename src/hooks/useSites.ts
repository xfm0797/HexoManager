/** 站点相关 Hook */

import { useCallback, useEffect, useMemo } from 'react';
import { App as AntdApp } from 'antd';
import { useSiteStore } from '@/stores';
import type { CreateSiteInput, Site, UpdateSiteInput } from '@/types';

interface UseSitesResult {
  sites: Site[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (input: CreateSiteInput) => Promise<Site>;
  importExisting: (path: string) => Promise<Site>;
  update: (siteId: number, updates: UpdateSiteInput) => Promise<Site>;
  remove: (siteId: number, deleteFiles?: boolean) => Promise<void>;
}

/** 站点列表与增删改 */
export function useSites(): UseSitesResult {
  const { message } = AntdApp.useApp();
  const sites = useSiteStore((s) => s.sites);
  const loading = useSiteStore((s) => s.loading);
  const error = useSiteStore((s) => s.error);
  const fetchSites = useSiteStore((s) => s.fetchSites);
  const createSite = useSiteStore((s) => s.createSite);
  const importSite = useSiteStore((s) => s.importSite);
  const updateSite = useSiteStore((s) => s.updateSite);
  const deleteSite = useSiteStore((s) => s.deleteSite);

  useEffect(() => {
    if (sites.length === 0 && !loading) {
      void fetchSites();
    }
    // 仅在首次挂载时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = useCallback(
    async (input: CreateSiteInput) => {
      const site = await createSite(input);
      message.success(`站点「${site.name}」创建成功`);
      return site;
    },
    [createSite, message],
  );

  const importExisting = useCallback(
    async (path: string) => {
      const site = await importSite(path);
      message.success(`已导入站点「${site.name}」`);
      return site;
    },
    [importSite, message],
  );

  const update = useCallback(
    async (siteId: number, updates: UpdateSiteInput) => {
      const site = await updateSite(siteId, updates);
      message.success('站点信息已更新');
      return site;
    },
    [updateSite, message],
  );

  const remove = useCallback(
    async (siteId: number, deleteFiles = false) => {
      await deleteSite(siteId, deleteFiles);
      message.success(deleteFiles ? '站点及其文件已删除' : '站点已从列表中移除');
    },
    [deleteSite, message],
  );

  return { sites, loading, error, refresh: fetchSites, create, importExisting, update, remove };
}

/** 当前选中站点 */
export function useCurrentSiteInfo(): {
  site: Site | undefined;
  stats: ReturnType<typeof useSiteStore.getState>['stats'];
  loading: boolean;
  refreshStats: () => Promise<void>;
} {
  const site = useSiteStore((s) => s.sites.find((item) => item.id === s.currentSiteId));
  const stats = useSiteStore((s) => s.stats);
  const loading = useSiteStore((s) => s.loading);
  const fetchStats = useSiteStore((s) => s.fetchStats);

  return useMemo(
    () => ({
      site,
      stats,
      loading,
      refreshStats: () => fetchStats(site?.id),
    }),
    [site, stats, loading, fetchStats],
  );
}

/** 切换当前站点（含副作用：清空统计） */
export function useSiteSwitcher(): {
  currentSiteId: number | null;
  switchTo: (siteId: number) => void;
} {
  const currentSiteId = useSiteStore((s) => s.currentSiteId);
  const setCurrentSite = useSiteStore((s) => s.setCurrentSite);
  return { currentSiteId, switchTo: setCurrentSite };
}
