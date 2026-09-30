/** UI 全局状态管理：主题、侧栏、通知、预览服务等 */

import { create } from 'zustand';
import { hexoService, updateService } from '@/services';
import type { AppNotification, MessageType, PreviewServer, ThemeMode } from '@/types';

const THEME_STORAGE_KEY = 'hexo-manager:theme';
const SIDEBAR_STORAGE_KEY = 'hexo-manager:sidebar-collapsed';

/** 读取持久化的主题模式 */
function readStoredTheme(): ThemeMode {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    // localStorage 不可用时回退默认值
  }
  return 'system';
}

/** 读取持久化的侧栏折叠状态 */
function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** 判断当前系统是否为深色 */
function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** 解析最终生效的深色状态 */
function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return systemPrefersDark();
}

interface UiState {
  /** 主题模式 */
  themeMode: ThemeMode;
  /** 是否深色（由 themeMode 解析而来） */
  isDark: boolean;
  /** 侧栏是否折叠 */
  sidebarCollapsed: boolean;
  /** 全局加载遮罩文案（非空时展示） */
  globalLoading: string | null;
  /** 通知列表 */
  notifications: AppNotification[];
  /** 运行中的本地预览服务 */
  servers: PreviewServer[];
  /** 是否已检查过更新 */
  updateChecked: boolean;

  /** 切换主题模式 */
  setThemeMode: (mode: ThemeMode) => void;
  /** 切换明暗（在 light/dark 间切换） */
  toggleDark: () => void;
  /** 切换侧栏折叠 */
  toggleSidebar: () => void;
  /** 设置侧栏折叠 */
  setSidebarCollapsed: (collapsed: boolean) => void;
  /** 设置全局加载遮罩 */
  setGlobalLoading: (text: string | null) => void;

  /** 推送通知 */
  notify: (type: MessageType, title: string, description?: string) => void;
  /** 移除通知 */
  dismissNotification: (id: string) => void;
  /** 标记全部已读 */
  markAllRead: () => void;

  /** 刷新预览服务列表 */
  refreshServers: () => Promise<void>;
  /** 启动预览服务 */
  startServer: (siteId: number, port?: number) => Promise<PreviewServer>;
  /** 停止预览服务 */
  stopServer: (pid: number) => Promise<void>;

  /** 应用启动时的初始化：主题、预览服务清理、更新检查 */
  bootstrap: () => Promise<void>;
}

export const useUiStore = create<UiState>((set, get) => ({
  themeMode: readStoredTheme(),
  isDark: resolveDark(readStoredTheme()),
  sidebarCollapsed: readStoredCollapsed(),
  globalLoading: null,
  notifications: [],
  servers: [],
  updateChecked: false,

  setThemeMode(mode) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // 忽略持久化失败
    }
    set({ themeMode: mode, isDark: resolveDark(mode) });
  },

  toggleDark() {
    get().setThemeMode(get().isDark ? 'light' : 'dark');
  },

  toggleSidebar() {
    const collapsed = !get().sidebarCollapsed;
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      // 忽略持久化失败
    }
    set({ sidebarCollapsed: collapsed });
  },

  setSidebarCollapsed(collapsed) {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      // 忽略持久化失败
    }
    set({ sidebarCollapsed: collapsed });
  },

  setGlobalLoading(text) {
    set({ globalLoading: text });
  },

  notify(type, title, description) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((state) => ({
      notifications: [
        { id, type, title, description, createdAt: Date.now(), read: false },
        ...state.notifications,
      ].slice(0, 50),
    }));
  },

  dismissNotification(id) {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  markAllRead() {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    }));
  },

  async refreshServers() {
    const servers = await hexoService.listServers();
    set({ servers });
  },

  async startServer(siteId, port) {
    const server = await hexoService.startServer(siteId, port);
    set((state) => ({
      servers: [...state.servers.filter((s) => s.pid !== server.pid), server],
    }));
    return server;
  },

  async stopServer(pid) {
    await hexoService.stopServer(pid);
    set((state) => ({ servers: state.servers.filter((s) => s.pid !== pid) }));
  },

  async bootstrap() {
    // 应用启动时清理可能残留的预览服务记录
    await get().refreshServers();

    // 主题跟随系统变化
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      mql.addEventListener('change', () => {
        const { themeMode } = get();
        if (themeMode === 'system') {
          set({ isDark: systemPrefersDark() });
        }
      });
    }

    // 静默检查更新（失败不打扰用户）
    try {
      const settings = await updateService.getSettings();
      if (settings.autoCheck) {
        const info = await updateService.check();
        set({ updateChecked: true });
        if (info.available && info.latestVersion !== settings.skipVersion) {
          get().notify('info', `发现新版本 ${info.latestVersion}`, '前往「关于与更新」查看详情');
        }
      }
    } catch {
      // 无网络或更新源不可用时静默忽略
    }
  },
}));

/** 未读通知数量（派生选择器） */
export function useUnreadCount(): number {
  return useUiStore((state) => state.notifications.filter((n) => !n.read).length);
}
