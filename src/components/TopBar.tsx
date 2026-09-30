/** 顶部栏：站点切换、全局操作、主题切换、通知 */

import { Badge, Button, Dropdown, Empty, List, Popover, Select, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  BellOutlined,
  BulbOutlined,
  CheckOutlined,
  CloudDownloadOutlined,
  CloudServerOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  RocketOutlined,
  SyncOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useSiteStore, useUiStore, useUnreadCount } from '@/stores';
import { formatRelative } from '@/utils/format';
import { SiteStatusBadge } from './StatusBadge';

/** 顶部栏 */
export function TopBar() {
  const navigate = useNavigate();
  const sites = useSiteStore((s) => s.sites);
  const currentSiteId = useSiteStore((s) => s.currentSiteId);
  const setCurrentSite = useSiteStore((s) => s.setCurrentSite);
  const refreshSites = useSiteStore((s) => s.fetchSites);

  const isDark = useUiStore((s) => s.isDark);
  const toggleDark = useUiStore((s) => s.toggleDark);
  const notifications = useUiStore((s) => s.notifications);
  const markAllRead = useUiStore((s) => s.markAllRead);
  const unread = useUnreadCount();

  const currentSite = sites.find((s) => s.id === currentSiteId);

  const quickMenu: MenuProps['items'] = [
    { key: 'dashboard', label: '返回工作台', icon: <CloudServerOutlined /> },
    { key: 'deploy', label: '部署配置', icon: <RocketOutlined /> },
    { key: 'updates', label: '检查更新', icon: <CloudDownloadOutlined /> },
  ];

  const handleQuickAction: MenuProps['onClick'] = ({ key }) => {
    navigate(key === 'dashboard' ? '/' : key === 'deploy' ? '/deploy' : '/updates');
  };

  const notifyIcon = (type: string) => {
    if (type === 'error') return <ExclamationCircleOutlined className="text-red-500" />;
    if (type === 'warning') return <WarningOutlined className="text-orange-500" />;
    if (type === 'success') return <CheckOutlined className="text-green-500" />;
    return <InfoCircleOutlined className="text-brand-500" />;
  };

  const notificationPanel = (
    <div className="w-80">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">通知</span>
        <Button type="link" size="small" onClick={markAllRead} disabled={unread === 0}>
          全部已读
        </Button>
      </div>

      {notifications.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无通知" />
      ) : (
        <List
          size="small"
          dataSource={notifications.slice(0, 8)}
          className="max-h-80 overflow-auto"
          renderItem={(item) => (
            <List.Item className="px-0">
              <div className="flex w-full items-start gap-2">
                <span className="mt-0.5">{notifyIcon(item.type)}</span>
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-sm ${item.read ? 'opacity-60' : 'font-medium'}`}>
                    {item.title}
                  </div>
                  {item.description ? (
                    <div className="truncate text-xs hm-text-secondary">{item.description}</div>
                  ) : null}
                  <div className="text-xs hm-text-secondary opacity-70">
                    {formatRelative(item.createdAt)}
                  </div>
                </div>
                {!item.read ? (
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                ) : null}
              </div>
            </List.Item>
          )}
        />
      )}

      <div className="mt-2 border-t pt-2 text-center" style={{ borderColor: 'var(--hm-border)' }}>
        <Button type="link" size="small" onClick={() => navigate('/notifications')}>
          查看全部
        </Button>
      </div>
    </div>
  );

  return (
    <header
      className="flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4"
      style={{ borderColor: 'var(--hm-border)', background: 'var(--hm-surface)' }}
    >
      {/* 左侧：站点切换 */}
      <div className="flex min-w-0 items-center gap-3">
        <Select
          value={currentSiteId ?? undefined}
          onChange={(value) => setCurrentSite(value)}
          placeholder="选择站点"
          style={{ minWidth: 200, maxWidth: 300 }}
          suffixIcon={<CloudServerOutlined />}
          notFoundContent={
            <div className="py-2 text-center text-xs hm-text-secondary">
              还没有站点
              <Button type="link" size="small" onClick={() => navigate('/sites')}>
                去创建
              </Button>
            </div>
          }
          options={sites.map((site) => ({
            value: site.id,
            label: (
              <span className="flex items-center justify-between gap-3">
                <span className="truncate">{site.name}</span>
                <span className="text-xs hm-text-secondary">{site.articleCount} 篇</span>
              </span>
            ),
          }))}
        />

        {currentSite ? (
          <div className="hidden items-center gap-2 md:flex">
            <SiteStatusBadge status={currentSite.status} />
            {currentSite.domain ? (
              <Tooltip title={currentSite.domain}>
                <span className="max-w-[180px] truncate text-xs hm-text-secondary">
                  {currentSite.domain}
                </span>
              </Tooltip>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* 右侧：操作区 */}
      <div className="flex shrink-0 items-center gap-1">
        <Tooltip title="刷新站点列表">
          <Button type="text" icon={<SyncOutlined />} onClick={() => void refreshSites()} />
        </Tooltip>

        <Dropdown menu={{ items: quickMenu, onClick: handleQuickAction }} trigger={['click']}>
          <Button type="text" icon={<ReloadOutlined />}>
            快捷操作
          </Button>
        </Dropdown>

        <Tooltip title={isDark ? '切换到浅色模式' : '切换到深色模式'}>
          <Button type="text" icon={<BulbOutlined />} onClick={toggleDark} />
        </Tooltip>

        <Popover
          content={notificationPanel}
          trigger="click"
          placement="bottomRight"
          onOpenChange={(open) => {
            if (open && unread > 0) markAllRead();
          }}
        >
          <Button type="text">
            <Badge count={unread} size="small" offset={[2, -2]}>
              <BellOutlined />
            </Badge>
          </Button>
        </Popover>
      </div>
    </header>
  );
}
