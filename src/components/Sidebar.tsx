/** 侧栏导航 */

import { useMemo } from 'react';
import { Layout, Menu, Tooltip, Button } from 'antd';
import type { MenuProps } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ApiOutlined,
  BellOutlined,
  BgColorsOutlined,
  BranchesOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  FileTextOutlined,
  FolderOutlined,
  HistoryOutlined,
  InfoCircleOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlayCircleOutlined,
  RocketOutlined,
  SettingOutlined,
  TagsOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { NAV_GROUPS, NAV_ITEMS, APP_META } from '@/constants';
import { useUiStore, useUnreadCount, useSiteStore } from '@/stores';

const { Sider } = Layout;

/** 导航图标映射（避免动态 require） */
const ICON_MAP: Record<string, React.ReactNode> = {
  DashboardOutlined: <DashboardOutlined />,
  CloudServerOutlined: <CloudServerOutlined />,
  FileTextOutlined: <FileTextOutlined />,
  TagsOutlined: <TagsOutlined />,
  SettingOutlined: <SettingOutlined />,
  BgColorsOutlined: <BgColorsOutlined />,
  ApiOutlined: <ApiOutlined />,
  FolderOutlined: <FolderOutlined />,
  PlayCircleOutlined: <PlayCircleOutlined />,
  RocketOutlined: <RocketOutlined />,
  BranchesOutlined: <BranchesOutlined />,
  HistoryOutlined: <HistoryOutlined />,
  InfoCircleOutlined: <InfoCircleOutlined />,
  BellOutlined: <BellOutlined />,
  ToolOutlined: <ToolOutlined />,
};

/** 侧栏：分组导航 + 折叠控制 */
export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const unread = useUnreadCount();
  const currentSiteId = useSiteStore((s) => s.currentSiteId);

  // 当前选中项（匹配最长的路径前缀，保证子路由也能高亮）
  const selectedKey = useMemo(() => {
    const matched = NAV_ITEMS.filter((item) =>
      item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path),
    ).sort((a, b) => b.path.length - a.path.length);
    return matched[0]?.key ?? 'dashboard';
  }, [location.pathname]);

  const items: MenuProps['items'] = useMemo(() => {
    const groups: { group: string; children: MenuProps['items'] }[] = [];
    const order: (keyof typeof NAV_GROUPS)[] = ['main', 'content', 'system'];

    for (const group of order) {
      const groupItems = NAV_ITEMS.filter((item) => item.group === group).map((item) => {
        // 需要站点上下文的菜单项：未选站点时置灰并提示
        const needsSite = [
          'articles',
          'categories',
          'config',
          'themes',
          'plugins',
          'files',
          'preview',
          'deploy',
          'git',
          'logs',
        ].includes(item.key);
        const disabled = needsSite && currentSiteId === null;

        return {
          key: item.key,
          icon: ICON_MAP[item.icon],
          disabled,
          label:
            item.key === 'notifications' && unread > 0 && !collapsed ? (
              <span className="flex items-center justify-between">
                <span>{item.label}</span>
                <span className="ml-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              </span>
            ) : (
              item.label
            ),
        };
      });

      groups.push({ group: NAV_GROUPS[group], children: groupItems });
    }

    return groups.flatMap(({ group, children: groupChildren }) => [
      {
        key: `group-${group}`,
        type: 'group' as const,
        label: collapsed ? null : group,
        children: groupChildren,
      },
    ]);
  }, [collapsed, unread, currentSiteId]);

  const handleClick: MenuProps['onClick'] = ({ key }) => {
    const item = NAV_ITEMS.find((nav) => nav.key === key);
    if (item) {
      if (location.pathname !== item.path) navigate(item.path);
    }
  };

  return (
    <Sider
      width={208}
      collapsedWidth={64}
      collapsed={collapsed}
      theme="light"
      className="shrink-0 border-r"
      style={{ borderColor: 'var(--hm-border)', background: 'var(--hm-sidebar-bg)' }}
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div
          className={`flex h-14 shrink-0 items-center border-b ${
            collapsed ? 'justify-center' : 'gap-2 px-4'
          }`}
          style={{ borderColor: 'var(--hm-border)' }}
        >
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #3366ff, #722ed1)' }}
          >
            H
          </span>
          {!collapsed ? (
            <span className="truncate text-sm font-semibold">{APP_META.name}</span>
          ) : null}
        </div>

        {/* 导航 */}
        <div className="hm-scroll flex-1 py-2">
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            items={items}
            onClick={handleClick}
            style={{ border: 'none', background: 'transparent' }}
            inlineIndent={collapsed ? 8 : 16}
          />
        </div>

        {/* 折叠按钮 */}
        <div className="shrink-0 border-t p-2" style={{ borderColor: 'var(--hm-border)' }}>
          <Tooltip title={collapsed ? '展开侧栏' : '收起侧栏'} placement="right">
            <Button
              type="text"
              block
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={toggleSidebar}
            >
              {collapsed ? null : '收起'}
            </Button>
          </Tooltip>
        </div>
      </div>
    </Sider>
  );
}
