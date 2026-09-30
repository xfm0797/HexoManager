/** 应用根组件：路由、主题与全局配置 */

import { useEffect } from 'react';
import { App as AntdApp, ConfigProvider, Spin, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { RouterProvider, createHashRouter, Navigate } from 'react-router-dom';
import {
  ArticlesPage,
  CategoriesPage,
  ConfigPage,
  DashboardPage,
  DeployPage,
  FilesPage,
  GitPage,
  LogsPage,
  NotFoundPage,
  NotificationsPage,
  PluginsPage,
  PreviewPage,
  SettingsPage,
  SitesPage,
  ThemesPage,
  UpdatesPage,
} from '@/pages';
import { MainLayout } from '@/components';
import { useUiStore } from '@/stores';

// 统一使用中文本地化
dayjs.locale('zh-cn');

/** 路由表：全部挂在主布局下 */
const router = createHashRouter([
  {
    path: '/',
    element: <MainLayout />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'sites', element: <SitesPage /> },
      { path: 'articles', element: <ArticlesPage /> },
      { path: 'categories', element: <CategoriesPage /> },
      { path: 'config', element: <ConfigPage /> },
      { path: 'themes', element: <ThemesPage /> },
      { path: 'plugins', element: <PluginsPage /> },
      { path: 'files', element: <FilesPage /> },
      { path: 'preview', element: <PreviewPage /> },
      { path: 'deploy', element: <DeployPage /> },
      { path: 'git', element: <GitPage /> },
      { path: 'logs', element: <LogsPage /> },
      { path: 'updates', element: <UpdatesPage /> },
      { path: 'notifications', element: <NotificationsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '404', element: <NotFoundPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: '/index.html', element: <Navigate to="/" replace /> },
]);

/** 全局配置与启动逻辑 */
function App() {
  const isDark = useUiStore((s) => s.isDark);
  const bootstrap = useUiStore((s) => s.bootstrap);

  // 应用启动初始化：预览服务清理与更新检查
  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 同步深色类名到 html 根节点，供 CSS 变量使用
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.style.colorScheme = isDark ? 'dark' : 'light';
  }, [isDark]);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#3366ff',
          colorInfo: '#3366ff',
          borderRadius: 6,
          fontSize: 14,
          fontFamily:
            "'PingFang SC', 'Microsoft YaHei', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        },
        components: {
          Layout: {
            headerBg: isDark ? '#141414' : '#ffffff',
            siderBg: isDark ? '#141414' : '#ffffff',
            bodyBg: isDark ? '#0d0d0d' : '#f5f6f8',
          },
          Card: {
            headerBg: 'transparent',
          },
          Table: {
            headerBg: isDark ? '#1f1f1f' : '#fafafa',
          },
        },
      }}
    >
      <AntdApp
        message={{ maxCount: 3, duration: 2.5 }}
        notification={{ placement: 'bottomRight', duration: 4 }}
      >
        <RouterProvider
          router={router}
          fallbackElement={
            <div className="flex h-screen w-screen items-center justify-center">
              <Spin size="large" tip="正在启动 HexoManager…" />
            </div>
          }
        />
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;
