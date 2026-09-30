/** 消息中心：应用通知、预览服务与后台任务状态 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Col,
  Empty,
  List,
  Popconfirm,
  Row,
  Segmented,
  Space,
  Tag,
  Tooltip,
} from 'antd';
import {
  BellOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  StopOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { EmptyState, PageContainer, StatusDot } from '@/components';
import { useUiStore, useUnreadCount } from '@/stores';
import type { AppNotification, MessageType } from '@/types';
import { formatRelative } from '@/utils/format';
import { openWithSystem } from '@/utils/desktop';

type Filter = 'all' | 'unread';

/** 按消息类型映射展示配置 */
const TYPE_META: Record<MessageType, { label: string; color: string; icon: React.ReactNode }> = {
  success: { label: '成功', color: '#52c41a', icon: <CheckCircleOutlined /> },
  error: { label: '错误', color: '#ff4d4f', icon: <CloseCircleOutlined /> },
  warning: { label: '警告', color: '#faad14', icon: <WarningOutlined /> },
  info: { label: '提示', color: '#1677ff', icon: <InfoCircleOutlined /> },
};

/** 消息中心页面 */
export function NotificationsPage() {
  const { message, modal } = AntdApp.useApp();

  const notifications = useUiStore((s) => s.notifications);
  const dismissNotification = useUiStore((s) => s.dismissNotification);
  const markAllRead = useUiStore((s) => s.markAllRead);
  const notify = useUiStore((s) => s.notify);
  const servers = useUiStore((s) => s.servers);
  const refreshServers = useUiStore((s) => s.refreshServers);
  const stopServer = useUiStore((s) => s.stopServer);
  const unreadCount = useUnreadCount();

  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void refreshServers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(
    () => (filter === 'unread' ? notifications.filter((n) => !n.read) : notifications),
    [notifications, filter],
  );

  const counts = useMemo(() => {
    const base: Record<MessageType, number> = { success: 0, error: 0, warning: 0, info: 0 };
    notifications.forEach((n) => {
      base[n.type] = (base[n.type] ?? 0) + 1;
    });
    return base;
  }, [notifications]);

  const handleRefreshServers = async () => {
    setRefreshing(true);
    try {
      await refreshServers();
      message.success('预览服务列表已刷新');
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  };

  const handleStop = (pid: number, port: number) => {
    modal.confirm({
      title: '停止该预览服务？',
      content: `将终止端口 ${port} 上的 Hexo 预览进程（PID ${pid}）。`,
      okText: '停止',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await stopServer(pid);
          notify('info', '预览服务已停止', `端口 ${port} 已释放`);
          message.success('预览服务已停止');
        } catch (e) {
          message.error(e instanceof Error ? e.message : String(e));
        }
      },
    });
  };

  const renderItem = (item: AppNotification) => {
    const meta = TYPE_META[item.type] ?? TYPE_META.info;

    return (
      <List.Item
        className="px-4"
        actions={[
          <Tooltip key="dismiss" title="删除该消息">
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              onClick={() => dismissNotification(item.id)}
            />
          </Tooltip>,
        ]}
      >
        <div className="flex w-full items-start gap-3">
          <span
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
            style={{ background: meta.color, opacity: item.read ? 0.5 : 1 }}
          >
            {meta.icon}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`text-sm ${item.read ? '' : 'font-medium'}`}>{item.title}</span>
              {!item.read ? <StatusDot color={meta.color} pulse /> : null}
            </div>
            {item.description ? (
              <div className="mt-0.5 text-xs hm-text-secondary">{item.description}</div>
            ) : null}
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] hm-text-secondary">
              <Tag className="m-0" color={meta.color} style={{ fontSize: 10, lineHeight: '16px' }}>
                {meta.label}
              </Tag>
              <span>{formatRelative(item.createdAt)}</span>
            </div>
          </div>
        </div>
      </List.Item>
    );
  };

  return (
    <PageContainer
      title="消息中心"
      description="应用运行期间的通知、后台任务与预览服务状态"
      card={false}
      flush
      badge={
        unreadCount > 0 ? (
          <Tag color="red" className="m-0">
            {unreadCount} 条未读
          </Tag>
        ) : (
          <Tag color="green" className="m-0">
            全部已读
          </Tag>
        )
      }
      extra={
        <Space>
          <Button
            icon={<CheckOutlined />}
            onClick={() => {
              markAllRead();
              message.success('已全部标记为已读');
            }}
            disabled={unreadCount === 0}
          >
            全部已读
          </Button>
          <Popconfirm
            title="清空所有消息？"
            description="清空后无法恢复，不影响站点数据。"
            okText="清空"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => {
              notifications.forEach((n) => dismissNotification(n.id));
              message.success('已清空消息');
            }}
            disabled={notifications.length === 0}
          >
            <Button danger icon={<DeleteOutlined />} disabled={notifications.length === 0}>
              清空
            </Button>
          </Popconfirm>
        </Space>
      }
    >
      <div className="space-y-4">
        {/* 概览 */}
        <Row gutter={16}>
          {(['success', 'info', 'warning', 'error'] as MessageType[]).map((type) => {
            const meta = TYPE_META[type];
            return (
              <Col xs={12} md={6} key={type}>
                <Card size="small" styles={{ body: { padding: 14 } }}>
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
                      style={{ background: meta.color }}
                    >
                      {meta.icon}
                    </span>
                    <div>
                      <div className="text-xs hm-text-secondary">{meta.label}</div>
                      <div className="text-lg font-semibold leading-tight">{counts[type]}</div>
                    </div>
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>

        <Row gutter={16}>
          {/* 消息列表 */}
          <Col xs={24} lg={15}>
            <Card
              size="small"
              title={
                <Space>
                  <BellOutlined />
                  <span>通知列表</span>
                </Space>
              }
              extra={
                <Segmented
                  size="small"
                  value={filter}
                  onChange={(value) => setFilter(value as Filter)}
                  options={[
                    { label: `全部 (${notifications.length})`, value: 'all' },
                    { label: `未读 (${unreadCount})`, value: 'unread' },
                  ]}
                />
              }
              styles={{ body: { padding: 0 } }}
            >
              {filtered.length === 0 ? (
                <div className="py-4">
                  <EmptyState
                    kind="logs"
                    compact
                    title={notifications.length === 0 ? '暂无消息' : '没有未读消息'}
                    description={
                      notifications.length === 0
                        ? '应用运行过程中的重要提示会出现在这里。'
                        : '所有消息都已处理完毕。'
                    }
                  />
                </div>
              ) : (
                <div className="hm-scroll" style={{ maxHeight: 560 }}>
                  <List size="small" dataSource={filtered} renderItem={renderItem} />
                </div>
              )}
            </Card>
          </Col>

          {/* 预览服务 */}
          <Col xs={24} lg={9}>
            <Card
              size="small"
              title={
                <Space>
                  <PlayCircleOutlined />
                  <span>运行中的预览服务</span>
                  {servers.length > 0 ? (
                    <Tag color="green" className="m-0">
                      {servers.length}
                    </Tag>
                  ) : null}
                </Space>
              }
              extra={
                <Tooltip title="刷新列表">
                  <Button
                    type="text"
                    size="small"
                    icon={<ReloadOutlined />}
                    loading={refreshing}
                    onClick={() => void handleRefreshServers()}
                  />
                </Tooltip>
              }
            >
              {servers.length === 0 ? (
                <Empty
                  imageStyle={{ height: 44, fontSize: 34, opacity: 0.6 }}
                  description={
                    <div>
                      <div className="text-sm">没有运行中的预览服务</div>
                      <div className="mt-1 text-xs hm-text-secondary">
                        在「本地预览」页启动服务后可在此管理
                      </div>
                    </div>
                  }
                />
              ) : (
                <div className="space-y-2">
                  {servers.map((server) => (
                    <div
                      key={server.pid}
                      className="rounded-lg border p-3"
                      style={{ borderColor: 'var(--hm-border)' }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <StatusDot color="#52c41a" pulse text={`端口 ${server.port}`} />
                        <Space size={2}>
                          <Tooltip title="在浏览器中打开">
                            <Button
                              type="text"
                              size="small"
                              icon={<LinkOutlined />}
                              onClick={() => void openWithSystem(`http://localhost:${server.port}`)}
                            />
                          </Tooltip>
                          <Tooltip title="停止服务">
                            <Button
                              type="text"
                              size="small"
                              danger
                              icon={<StopOutlined />}
                              onClick={() => handleStop(server.pid, server.port)}
                            />
                          </Tooltip>
                        </Space>
                      </div>

                      <div className="mt-2 space-y-0.5 text-xs hm-text-secondary">
                        <div>
                          PID：<span className="hm-mono">{server.pid}</span>
                        </div>
                        <div className="hm-mono break-all">http://localhost:{server.port}</div>
                        {server.siteId ? (
                          <div>
                            站点 ID：<span className="hm-mono">{server.siteId}</span>
                          </div>
                        ) : null}
                        {server.startedAt ? (
                          <div>启动于 {formatRelative(server.startedAt)}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Alert
              className="mt-4"
              type="info"
              showIcon
              icon={<ExclamationCircleOutlined />}
              message="关于消息通知"
              description={
                <ul className="mt-1 mb-0 list-disc pl-4 text-xs leading-relaxed">
                  <li>消息仅在当前会话中保留，最多显示最近 50 条</li>
                  <li>关闭应用后未读消息不会持久化，重要信息请及时处理</li>
                  <li>预览服务在应用关闭后可能残留，可通过刷新列表强制同步</li>
                </ul>
              }
            />
          </Col>
        </Row>
      </div>
    </PageContainer>
  );
}

export default NotificationsPage;
