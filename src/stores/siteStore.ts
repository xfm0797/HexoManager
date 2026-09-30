/** 站点状态管理 */

import { create } from 'zustand';
import { siteService } from '@/services';
import type { Site, SiteStats } from '@/types';

interface SiteState {
  /** 站点列表 */
  sites: Site[];
  /** 当前选中的站点 ID */
  currentSiteId: number | null;
  /** 当前站点统计 */
  stats: SiteStats | null;
  /** 加载中 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;

  /** 拉取全部站点 */
  fetchSites: () => Promise<void>;
  /** 切换当前站点 */
  setCurrentSite: (siteId: number | null) => void;
  /** 创建站点 */
  createSite: (
    input: Parameters<typeof siteService.create>[0],
    options?: { silent?: boolean },
  ) => Promise<Site>;
  /** 导入站点 */
  importSite: (path: string) => Promise<Site>;
  /** 更新站点 */
  updateSite: (siteId: number, updates: Parameters<typeof siteService.update>[1]) => Promise<Site>;
  /** 删除站点 */
  deleteSite: (siteId: number, deleteFiles?: boolean) => Promise<void>;
  /** 刷新当前站点统计 */
  fetchStats: (siteId?: number) => Promise<void>;
  /** 按 ID 取站点 */
  getSiteById: (siteId: number | null | undefined) => Site | undefined;
  /** 清除错误 */
  clearError: () => void;
}

export const useSiteStore = create<SiteState>((set, get) => ({
  sites: [],
  currentSiteId: null,
  stats: null,
  loading: false,
  error: null,

  async fetchSites() {
    set({ loading: true, error: null });
    try {
      const sites = await siteService.list();
      const { currentSiteId } = get();

      // 当前站点被删除时回退到第一个；列表为空则清空选择
      const stillExists = sites.some((s) => s.id === currentSiteId);
      const nextCurrent = stillExists ? currentSiteId : (sites[0]?.id ?? null);

      set({ sites, currentSiteId: nextCurrent, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  setCurrentSite(siteId) {
    if (get().currentSiteId === siteId) return;
    set({ currentSiteId: siteId, stats: null });
  },

  async createSite(input, options) {
    const site = await siteService.create(input);
    if (!options?.silent) {
      set((state) => ({
        sites: [...state.sites, site],
        currentSiteId: site.id,
      }));
    }
    return site;
  },

  async importSite(path) {
    const site = await siteService.import(path);
    set((state) => {
      const exists = state.sites.some((s) => s.id === site.id);
      return {
        sites: exists
          ? state.sites.map((s) => (s.id === site.id ? site : s))
          : [...state.sites, site],
        currentSiteId: site.id,
      };
    });
    return site;
  },

  async updateSite(siteId, updates) {
    const site = await siteService.update(siteId, updates);
    set((state) => ({
      sites: state.sites.map((s) => (s.id === siteId ? site : s)),
    }));
    return site;
  },

  async deleteSite(siteId, deleteFiles = false) {
    await siteService.remove(siteId, deleteFiles);
    set((state) => {
      const sites = state.sites.filter((s) => s.id !== siteId);
      return {
        sites,
        currentSiteId:
          state.currentSiteId === siteId ? (sites[0]?.id ?? null) : state.currentSiteId,
        stats: state.currentSiteId === siteId ? null : state.stats,
      };
    });
  },

  async fetchStats(siteId) {
    const target = siteId ?? get().currentSiteId;
    if (target === null || target === undefined) {
      set({ stats: null });
      return;
    }
    try {
      const stats = await siteService.stats(target);
      set({ stats });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  getSiteById(siteId) {
    if (siteId === null || siteId === undefined) return undefined;
    return get().sites.find((s) => s.id === siteId);
  },

  clearError() {
    set({ error: null });
  },
}));

/** 当前站点（派生选择器，避免组件里重复查找） */
export function useCurrentSite(): Site | undefined {
  return useSiteStore((state) => state.sites.find((s) => s.id === state.currentSiteId));
}
