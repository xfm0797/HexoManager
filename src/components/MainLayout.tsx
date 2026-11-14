/** 主布局：侧栏 + 顶栏 + 内容区 */

import { Suspense, useEffect, useState } from 'react';
import { Alert, Layout, Spin } from 'antd';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useArticleStore, useConfigStore, useDeployStore, useSiteStore } from '@/stores';
import { useI18n } from '@/i18n';

const { Content } = Layout;

/** 页面懒加载时的占位（保持侧栏/顶栏可交互，不整屏白屏） */
function PageFallback() {
  return (
    <div className="flex h-full items-center justify-center py-24">
      <Spin />
    </div>
  );
}

/**
 * 数据层失败条。
 *
 * 各 store 的 `error` 此前只能靠各页面自己渲染，页面没写就等于「失败 = 空列表」。
 * 这里统一在内容区顶部展示一次，保证任何加载失败都不会静默消失。
 * 切页后自动重新允许提示（避免上一页的错误一直压在新页面上）。
 */
function DataErrorBar() {
  const { t } = useI18n();
  const location = useLocation();

  const siteError = useSiteStore((s) => s.error);
  const articleError = useArticleStore((s) => s.error);
  const configError = useConfigStore((s) => s.error);
  const deployError = useDeployStore((s) => s.error);

  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    setDismissed(null);
  }, [location.pathname]);

  const message = siteError ?? articleError ?? configError ?? deployError;
  if (!message || dismissed === message) return null;

  return (
    <Alert
      className="mb-4"
      type="error"
      showIcon
      closable
      message={t('数据加载失败')}
      description={message}
      onClose={() => setDismissed(message)}
    />
  );
}

/** 应用主布局 */
export function MainLayout() {
  return (
    <Layout className="h-screen w-screen overflow-hidden">
      <Sidebar />
      <Layout className="flex flex-col overflow-hidden" style={{ background: 'var(--hm-bg)' }}>
        <TopBar />
        <Content className="hm-scroll flex-1 p-5">
          <DataErrorBar />
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  );
}
