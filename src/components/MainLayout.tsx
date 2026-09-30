/** 主布局：侧栏 + 顶栏 + 内容区 */

import { Layout } from 'antd';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const { Content } = Layout;

/** 应用主布局 */
export function MainLayout() {
  return (
    <Layout className="h-screen w-screen overflow-hidden">
      <Sidebar />
      <Layout className="flex flex-col overflow-hidden" style={{ background: 'var(--hm-bg)' }}>
        <TopBar />
        <Content className="hm-scroll flex-1 p-5">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
