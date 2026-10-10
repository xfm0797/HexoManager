/** 部署记录：历史列表、日志详情与回滚 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Input,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloudUploadOutlined,
  ExportOutlined,
  FileTextOutlined,
  HistoryOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  CodeBlock,
  DeployStatusBadge,
  EmptyState,
  LogViewer,
  PageContainer,
  StatCard,
  StatGrid,
} from '@/components';
import { useDeployStore, useSiteStore } from '@/stores';
import type { DeployLog } from '@/types';
import { formatDateTime, formatDuration, formatRelative } from '@/utils/format';
import { copyToClipboard, pickSavePath } from '@/utils/desktop';
import { fileService } from '@/services';
import { useI18n } from '@/i18n';

type StatusFilter = 'all' | 'success' | 'failed' | 'running';

/** 部署记录页面 */
export function LogsPage() {
  const { message, modal } = AntdApp.useApp();
  const { t } = useI18n();

  const currentSiteId = useSiteStore((s) => s.currentSiteId);
  const currentSite = useSiteStore((s) => s.sites.find((site) => site.id === s.currentSiteId));

  const logs = useDeployStore((s) => s.logs);
  const fetchLogs = useDeployStore((s) => s.fetchLogs);
  const rollback = useDeployStore((s) => s.rollback);

  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [limit, setLimit] = useState(50);
  const [detail, setDetail] = useState<DeployLog | null>(null);

  const reload = async () => {
    if (currentSiteId === null) return;
    setLoading(true);
    try {
      await fetchLogs(currentSiteId, limit);
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSiteId, limit]);

  /** 按状态与关键字筛选后的记录 */
  const filtered = useMemo(() => {
    const lower = keyword.trim().toLowerCase();
    return logs.filter((log) => {
      if (statusFilter !== 'all' && log.status !== statusFilter) return false;
      if (!lower) return true;
      return (
        (log.commitMessage ?? '').toLowerCase().includes(lower) ||
        (log.commitHash ?? '').toLowerCase().includes(lower) ||
        (log.errorMessage ?? '').toLowerCase().includes(lower)
      );
    });
  }, [logs, keyword, statusFilter]);

  const successCount = logs.filter((log) => log.status === 'success').length;
  const failedCount = logs.filter((log) => log.status === 'failed').length;
  const durations = logs
    .map((log) => log.durationMs)
    .filter((value): value is number => typeof value === 'number' && value > 0);
  const avgDuration = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : 0;
  const lastSuccess = logs.find((log) => log.status === 'success');

  const handleRollback = (log: DeployLog) => {
    if (!log.commitHash) {
      message.warning(t('该记录没有关联的提交哈希，无法回滚'));
      return;
    }
    modal.confirm({
      title: t('回滚到该次部署？'),
      content: (
        <div className="pt-1 text-sm">
          <div>
            {t('提交：')}
            <span className="hm-mono">{log.commitHash.slice(0, 8)}</span>
          </div>
          <div className="mt-1">{t('时间：{time}', { time: formatDateTime(log.createdAt) })}</div>
          <div className="mt-2 hm-text-secondary">
            {t('将执行 git reset --hard，该提交之后的改动都会被丢弃。')}
          </div>
        </div>
      ),
      okText: t('确认回滚'),
      okButtonProps: { danger: true },
      cancelText: t('取消'),
      onOk: async () => {
        if (currentSiteId === null) return;
        try {
          await rollback(currentSiteId, log.commitHash as string);
          message.success(t('已回滚到指定提交'));
          await reload();
        } catch (e) {
          message.error(e instanceof Error ? e.message : String(e));
        }
      },
    });
  };

  const handleExport = async (log: DeployLog) => {
    const target = await pickSavePath({
      title: t('导出部署日志'),
      defaultPath: `deploy-${log.id}-${(log.commitHash ?? 'na').slice(0, 7)}.log`,
      filters: [{ name: t('日志文件'), extensions: ['log', 'txt'] }],
    });
    if (!target) return;

    const lines = [
      `# ${t('部署记录 #{id}', { id: log.id })}`,
      `${t('站点')}: ${currentSite?.name ?? t('未知')} (${currentSite?.path ?? '-'})`,
      `${t('状态')}: ${log.status}`,
      `${t('提交')}: ${log.commitHash ?? '-'}`,
      `${t('分支')}: ${log.branch ?? '-'}`,
      `${t('提交信息')}: ${log.commitMessage ?? '-'}`,
      `${t('耗时')}: ${formatDuration(log.durationMs)}`,
      `${t('创建时间')}: ${formatDateTime(log.createdAt)}`,
      log.errorMessage ? `${t('错误')}: ${log.errorMessage}` : '',
      '',
      `----- ${t('输出')} -----`,
      log.output ?? t('(无输出)'),
    ].filter((line) => line !== '');

    try {
      await fileService.write(target, lines.join('\n'));
      message.success(t('日志已导出'));
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  const columns: ColumnsType<DeployLog> = [
    {
      title: t('状态'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      filters: [
        { text: t('成功'), value: 'success' },
        { text: t('失败'), value: 'failed' },
        { text: t('进行中'), value: 'running' },
      ],
      onFilter: (value, record) => record.status === value,
      render: (status: string) => <DeployStatusBadge status={status} asTag />,
    },
    {
      title: t('提交信息'),
      dataIndex: 'commitMessage',
      key: 'commitMessage',
      ellipsis: true,
      render: (text: string | null, log) => (
        <div className="min-w-0">
          <div className="truncate text-sm">{text || t('（无提交信息）')}</div>
          <div className="mt-0.5 flex items-center gap-2 text-xs hm-text-secondary">
            {log.commitHash ? (
              <span
                className="hm-mono cursor-pointer hover:underline"
                onClick={() =>
                  void copyToClipboard(log.commitHash as string).then((ok) =>
                    ok ? message.success(t('提交哈希已复制')) : undefined,
                  )
                }
              >
                {(log.commitHash ?? '').slice(0, 7)}
              </span>
            ) : null}
            {log.branch ? <Tag className="m-0">{log.branch}</Tag> : null}
          </div>
        </div>
      ),
    },
    {
      title: t('耗时'),
      dataIndex: 'durationMs',
      key: 'durationMs',
      width: 100,
      sorter: (a, b) => (a.durationMs ?? 0) - (b.durationMs ?? 0),
      render: (value: number | null) => (
        <span className="hm-mono text-xs">{formatDuration(value)}</span>
      ),
    },
    {
      title: t('时间'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      sorter: (a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
      defaultSortOrder: 'descend',
      render: (value: string | null) => (
        <Tooltip title={formatDateTime(value)}>
          <span className="text-xs">{formatRelative(value)}</span>
        </Tooltip>
      ),
    },
    {
      title: t('操作'),
      key: 'actions',
      width: 150,
      render: (_v, log) => (
        <Space size={2}>
          <Tooltip title={t('查看详情')}>
            <Button
              type="text"
              size="small"
              icon={<FileTextOutlined />}
              onClick={() => setDetail(log)}
            />
          </Tooltip>
          <Tooltip title={t('导出日志')}>
            <Button
              type="text"
              size="small"
              icon={<ExportOutlined />}
              onClick={() => void handleExport(log)}
            />
          </Tooltip>
          <Tooltip title={t('回滚到该提交')}>
            <Popconfirm
              title={t('回滚到该次部署？')}
              description={t('该提交之后的改动都会被丢弃。')}
              okText={t('回滚')}
              cancelText={t('取消')}
              okButtonProps={{ danger: true }}
              onConfirm={() => handleRollback(log)}
            >
              <Button
                type="text"
                size="small"
                danger
                icon={<RollbackOutlined />}
                disabled={!log.commitHash}
              />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title={t('部署记录')}
      description={
        currentSite ? (
          <span>
            {t('{name} · 共 {count} 条部署记录', { name: currentSite.name, count: logs.length })}
          </span>
        ) : (
          t('请先选择站点')
        )
      }
      card={false}
      flush
      extra={
        <Space>
          <Select
            size="middle"
            value={limit}
            onChange={setLimit}
            style={{ width: 120 }}
            options={[
              { label: t('最近 20 条'), value: 20 },
              { label: t('最近 50 条'), value: 50 },
              { label: t('最近 100 条'), value: 100 },
              { label: t('最近 200 条'), value: 200 },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void reload()} loading={loading}>
            {t('刷新')}
          </Button>
        </Space>
      }
    >
      {currentSiteId === null ? (
        <div className="hm-surface">
          <EmptyState
            kind="articles"
            title={t('请先选择站点')}
            description={t('在顶栏选择站点后查看其部署历史')}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <StatGrid columns={4}>
            <StatCard
              title={t('部署总数')}
              value={logs.length}
              icon={<HistoryOutlined />}
              iconColor="#3366ff"
              footer={
                logs[0]
                  ? t('最近一次 {time}', { time: formatRelative(logs[0].createdAt) })
                  : t('暂无部署')
              }
            />
            <StatCard
              title={t('成功')}
              value={successCount}
              icon={<CheckCircleOutlined />}
              iconColor="#52c41a"
              footer={
                logs.length > 0
                  ? t('成功率 {percent}%', {
                      percent: Math.round((successCount / logs.length) * 100),
                    })
                  : '—'
              }
            />
            <StatCard
              title={t('失败')}
              value={failedCount}
              icon={<CloseCircleOutlined />}
              iconColor="#ff4d4f"
              footer={failedCount > 0 ? t('建议查看日志定位问题') : t('暂无失败记录')}
            />
            <StatCard
              title={t('平均耗时')}
              value={avgDuration > 0 ? formatDuration(avgDuration) : '—'}
              icon={<ThunderboltOutlined />}
              iconColor="#fa8c16"
              tooltip={t('仅统计耗时大于 0 的成功部署记录')}
            />
          </StatGrid>

          {failedCount > 0 ? (
            <Alert
              type="warning"
              showIcon
              message={t('有 {count} 次部署失败', { count: failedCount })}
              description={t(
                '常见原因：Hexo 构建报错、Git 凭据未配置、远程分支冲突。点击失败记录查看完整输出。',
              )}
            />
          ) : null}

          <Card
            size="small"
            title={t('历史记录')}
            extra={
              <Space>
                <Segmented
                  size="small"
                  value={statusFilter}
                  onChange={(value) => setStatusFilter(value as StatusFilter)}
                  options={[
                    { label: t('全部'), value: 'all' },
                    { label: t('成功'), value: 'success' },
                    { label: t('失败'), value: 'failed' },
                    { label: t('进行中'), value: 'running' },
                  ]}
                />
                <Input
                  allowClear
                  size="small"
                  prefix={<SearchOutlined />}
                  placeholder={t('搜索提交信息或哈希')}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  style={{ width: 200 }}
                />
              </Space>
            }
            styles={{ body: { padding: 0 } }}
          >
            <Table
              rowKey="id"
              size="small"
              loading={loading}
              columns={columns}
              dataSource={filtered}
              pagination={filtered.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
              locale={{
                emptyText: (
                  <EmptyState
                    kind="logs"
                    compact
                    title={logs.length === 0 ? t('暂无部署记录') : t('没有匹配的记录')}
                    description={
                      logs.length === 0
                        ? t('在部署配置页执行一次部署后，这里会记录完整过程。')
                        : t('换个关键词或清空筛选条件试试。')
                    }
                  />
                ),
              }}
            />
          </Card>

          <Row gutter={16}>
            <Col xs={24} lg={12}>
              <Card size="small" title={t('最近一次成功部署')}>
                {lastSuccess ? (
                  <Descriptions
                    size="small"
                    column={1}
                    items={[
                      {
                        key: 'time',
                        label: t('部署时间'),
                        children: formatDateTime(lastSuccess.createdAt),
                      },
                      {
                        key: 'commit',
                        label: t('提交'),
                        children: (
                          <span className="hm-mono text-xs">
                            {lastSuccess.commitHash?.slice(0, 12) ?? '—'}
                          </span>
                        ),
                      },
                      {
                        key: 'message',
                        label: t('提交信息'),
                        children: lastSuccess.commitMessage ?? '—',
                      },
                      {
                        key: 'branch',
                        label: t('分支'),
                        children: <span className="hm-mono">{lastSuccess.branch ?? '—'}</span>,
                      },
                      {
                        key: 'duration',
                        label: t('耗时'),
                        children: formatDuration(lastSuccess.durationMs),
                      },
                    ]}
                  />
                ) : (
                  <EmptyState kind="logs" compact title={t('暂无成功部署记录')} />
                )}
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card size="small" title={t('部署节奏')}>
                <div className="space-y-2">
                  <div className="text-xs hm-text-secondary">{t('最近 8 次部署状态')}</div>
                  <div className="flex flex-wrap gap-1">
                    {logs.slice(0, 8).map((log) => (
                      <Tooltip
                        key={log.id}
                        title={`${formatDateTime(log.createdAt)} · ${log.status}`}
                      >
                        <span
                          className="h-6 w-6 cursor-pointer rounded"
                          style={{
                            background:
                              log.status === 'success'
                                ? '#52c41a'
                                : log.status === 'failed'
                                  ? '#ff4d4f'
                                  : log.status === 'running'
                                    ? '#1677ff'
                                    : '#d9d9d9',
                            opacity: 0.85,
                          }}
                          onClick={() => setDetail(log)}
                        />
                      </Tooltip>
                    ))}
                    {logs.length === 0 ? (
                      <span className="text-xs hm-text-secondary">{t('暂无数据')}</span>
                    ) : null}
                  </div>
                  <div className="pt-1 text-xs hm-text-secondary">
                    {t('点击色块可查看该次部署的完整日志')}
                  </div>
                </div>

                {currentSite ? (
                  <>
                    <div className="mt-4 text-xs hm-text-secondary">{t('部署目标')}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Tag className="m-0 hm-mono text-xs">{currentSite.path}</Tag>
                    </div>
                  </>
                ) : null}
              </Card>
            </Col>
          </Row>

          <Alert
            type="info"
            showIcon
            icon={<CloudUploadOutlined />}
            message={t('部署记录说明')}
            description={
              <ul className="mt-1 mb-0 list-disc pl-4 text-xs leading-relaxed">
                <li>{t('每次执行部署都会记录构建输出、提交哈希与耗时，便于排查问题')}</li>
                <li>{t('回滚操作会重置工作区，未提交的改动将丢失，建议先提交或暂存')}</li>
                <li>{t('日志可通过右上角导出按钮保存为文本文件，便于分享与归档')}</li>
              </ul>
            }
          />
        </div>
      )}

      {/* 日志详情 */}
      <Drawer
        open={detail !== null}
        title={detail ? t('部署记录 #{id}', { id: detail.id }) : t('部署记录')}
        placement="right"
        width={780}
        onClose={() => setDetail(null)}
        extra={
          detail ? (
            <Space>
              <Button
                size="small"
                icon={<ExportOutlined />}
                onClick={() => void handleExport(detail)}
              >
                {t('导出')}
              </Button>
              <Button
                size="small"
                danger
                icon={<RollbackOutlined />}
                disabled={!detail.commitHash}
                onClick={() => handleRollback(detail)}
              >
                {t('回滚')}
              </Button>
            </Space>
          ) : null
        }
      >
        {detail ? (
          <div className="space-y-4">
            <Descriptions
              size="small"
              column={2}
              items={[
                {
                  key: 'status',
                  label: t('状态'),
                  children: <DeployStatusBadge status={detail.status} asTag />,
                },
                {
                  key: 'time',
                  label: t('部署时间'),
                  children: formatDateTime(detail.createdAt),
                },
                {
                  key: 'commit',
                  label: t('提交哈希'),
                  children: <span className="hm-mono text-xs">{detail.commitHash ?? '—'}</span>,
                },
                {
                  key: 'branch',
                  label: t('分支'),
                  children: <span className="hm-mono">{detail.branch ?? '—'}</span>,
                },
                {
                  key: 'message',
                  label: t('提交信息'),
                  span: 2,
                  children: detail.commitMessage ?? '—',
                },
                {
                  key: 'duration',
                  label: t('耗时'),
                  children: formatDuration(detail.durationMs),
                },
                {
                  key: 'site',
                  label: t('站点'),
                  children: currentSite?.name ?? '—',
                },
              ]}
            />

            {detail.errorMessage ? (
              <Alert
                type="error"
                showIcon
                message={t('部署失败')}
                description={<span className="hm-mono text-xs">{detail.errorMessage}</span>}
              />
            ) : null}

            <div>
              <div className="mb-2 text-sm font-medium">{t('完整输出')}</div>
              {detail.output ? (
                <LogViewer
                  lines={detail.output.split('\n')}
                  height={420}
                  exportFileName={`deploy-${detail.id}.log`}
                />
              ) : (
                <CodeBlock
                  code={t('（本次部署没有输出内容）')}
                  language="plaintext"
                  maxHeight={200}
                />
              )}
            </div>
          </div>
        ) : null}
      </Drawer>
    </PageContainer>
  );
}

export default LogsPage;
