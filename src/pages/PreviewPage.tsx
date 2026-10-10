/** 本地预览：启动 hexo server 并预览站点 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  InputNumber,
  List,
  Row,
  Space,
  Spin,
  Statistic,
  Tag,
  Tooltip,
} from 'antd';
import {
  ApiOutlined,
  CheckCircleOutlined,
  ClearOutlined,
  CloseCircleOutlined,
  CloudServerOutlined,
  CompassOutlined,
  ExportOutlined,
  GlobalOutlined,
  LinkOutlined,
  PlayCircleOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { EmptyState, LogViewer, PageContainer, StatCard, StatGrid, StatusDot } from '@/components';
import { useHexoBuild, useHexoEnv, useHexoServer } from '@/hooks';
import { useSiteStore } from '@/stores';
import type { PreviewServer } from '@/types';
import { formatDuration, formatRelative } from '@/utils/format';
import { copyToClipboard, openWithSystem } from '@/utils/desktop';
import { DEPLOY_PHASES } from '@/components/DeployProgress';
import { useI18n } from '@/i18n';

/** 本地预览页面 */
export function PreviewPage() {
  const { message } = AntdApp.useApp();
  const { t } = useI18n();

  const currentSiteId = useSiteStore((s) => s.currentSiteId);
  const currentSite = useSiteStore((s) => s.sites.find((site) => site.id === s.currentSiteId));

  const {
    env,
    loading: envLoading,
    check: checkEnv,
    install,
  } = useHexoEnv(currentSite?.path, currentSiteId ?? undefined);
  const {
    servers,
    current: server,
    starting,
    start,
    stop,
    refresh: refreshServers,
  } = useHexoServer(currentSiteId);

  const { building, action, lastResult, logLines, build, clean, generate, deploy } =
    useHexoBuild(currentSiteId);

  const [port, setPort] = useState<number | null>(null);

  // 其它站点正在运行的预览服务
  const otherServers = useMemo(
    () => servers.filter((s) => s.siteId !== currentSiteId),
    [servers, currentSiteId],
  );

  useEffect(() => {
    if (currentSiteId !== null) void refreshServers();
  }, [currentSiteId, refreshServers]);

  const handleStart = async () => {
    const result = await start(port ?? undefined);
    if (result) {
      // 启动后自动打开浏览器
      setTimeout(() => {
        void openWithSystem(result.url).catch(() => undefined);
      }, 500);
    }
  };

  const handleCopyUrl = async (url: string) => {
    const ok = await copyToClipboard(url);
    if (ok) message.success(t('链接已复制到剪贴板'));
  };

  const phaseIndex = useMemo(() => {
    if (!action) return lastResult ? DEPLOY_PHASES.length : -1;
    if (action === 'build') return 0;
    if (action === 'clean') return 0;
    if (action === 'generate') return 0;
    if (action === 'deploy') return 3;
    return -1;
  }, [action, lastResult]);

  return (
    <PageContainer
      title={t('本地预览')}
      description={
        currentSite
          ? t('{name} · 启动本地服务实时预览站点效果', { name: currentSite.name })
          : t('请先选择站点')
      }
      card={false}
      flush
      extra={
        <Space>
          <Tooltip title={t('检查 Hexo 环境')}>
            <Button
              icon={<ApiOutlined />}
              onClick={() => void checkEnv()}
              loading={envLoading}
              disabled={currentSiteId === null}
            >
              {t('环境检测')}
            </Button>
          </Tooltip>
          <Tooltip title={t('刷新服务列表')}>
            <Button icon={<ReloadOutlined />} onClick={() => void refreshServers()} />
          </Tooltip>
        </Space>
      }
    >
      {currentSiteId === null ? (
        <div className="hm-surface">
          <EmptyState
            kind="articles"
            title={t('请先选择站点')}
            description={t('在顶栏选择站点后即可启动本地预览服务')}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* 环境状态 */}
          {env ? (
            <Alert
              type={env.ready ? 'success' : 'warning'}
              showIcon
              message={
                env.ready
                  ? t('环境检查通过，可以正常构建与预览')
                  : t('环境未完全就绪，部分功能可能不可用')
              }
              description={
                <div className="mt-1 space-y-1">
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                    <span>
                      {t('Node.js：')}
                      <span className="hm-mono">{env.nodeVersion ?? t('未安装')}</span>
                    </span>
                    <span>
                      {t('npm：')}
                      <span className="hm-mono">{env.npmVersion ?? t('未安装')}</span>
                    </span>
                    <span>
                      {t('Git：')}
                      <span className="hm-mono">{env.gitVersion ?? t('未安装')}</span>
                    </span>
                    <span>
                      {t('Hexo CLI：')}
                      <span className="hm-mono">{env.hexoVersion ?? t('未安装')}</span>
                    </span>
                  </div>

                  {env.issues.length > 0 ? (
                    <ul className="mb-0 list-disc pl-4 text-xs">
                      {env.issues.map((issue, index) => (
                        <li key={index}>{issue}</li>
                      ))}
                    </ul>
                  ) : null}

                  {!env.hexoInstalled ? (
                    <Button
                      size="small"
                      type="primary"
                      icon={<ThunderboltOutlined />}
                      onClick={async () => {
                        const hide = message.loading(t('正在安装 Hexo CLI…'), 0);
                        try {
                          await install();
                          message.success(t('Hexo CLI 安装完成'));
                        } catch (e) {
                          message.error(e instanceof Error ? e.message : String(e));
                        } finally {
                          hide();
                        }
                      }}
                    >
                      {t('安装 Hexo CLI')}
                    </Button>
                  ) : null}
                </div>
              }
            />
          ) : envLoading ? (
            <Alert type="info" showIcon message={t('正在检测环境…')} />
          ) : null}

          {/* 概览指标 */}
          <StatGrid columns={4}>
            <StatCard
              title={t('预览服务')}
              value={server ? t('运行中') : t('未启动')}
              icon={server ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
              iconColor={server ? '#52c41a' : '#8c8c8c'}
              footer={
                server ? (
                  <StatusDot color="#52c41a" pulse text={t('端口 {port}', { port: server.port })} />
                ) : (
                  t('点击下方按钮启动')
                )
              }
            />
            <StatCard
              title={t('站点文章')}
              value={currentSite?.articleCount ?? 0}
              icon={<CloudServerOutlined />}
              iconColor="#3366ff"
            />
            <StatCard
              title={t('上次构建耗时')}
              value={lastResult ? formatDuration(lastResult.durationMs) : '—'}
              icon={<ThunderboltOutlined />}
              iconColor="#fa8c16"
              tooltip={t('最近一次构建/生成操作的耗时')}
            />
            <StatCard
              title={t('运行中的服务')}
              value={servers.length}
              icon={<GlobalOutlined />}
              iconColor="#722ed1"
              tooltip={t('所有站点中正在运行的预览服务总数')}
            />
          </StatGrid>

          <Row gutter={16}>
            {/* 左：控制台 */}
            <Col xs={24} lg={14}>
              {/* 预览服务控制 */}
              <Card size="small" title={t('预览服务')} className="mb-4">
                {server ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="mb-1 flex items-center gap-2">
                          <StatusDot color="#52c41a" pulse />
                          <span className="font-medium">{t('服务运行中')}</span>
                          <Tag color="green" className="m-0 hm-mono">
                            PID {server.pid}
                          </Tag>
                        </div>
                        <a
                          href={server.url}
                          className="hm-mono text-sm text-brand-500 hover:underline"
                          onClick={(e) => {
                            e.preventDefault();
                            void openWithSystem(server.url);
                          }}
                        >
                          {server.url}
                        </a>
                      </div>

                      <Space>
                        <Button
                          size="small"
                          icon={<LinkOutlined />}
                          onClick={() => void handleCopyUrl(server.url)}
                        >
                          {t('复制链接')}
                        </Button>
                        <Button
                          size="small"
                          type="primary"
                          icon={<CompassOutlined />}
                          onClick={() => void openWithSystem(server.url)}
                        >
                          {t('打开浏览器')}
                        </Button>
                        <Button
                          size="small"
                          danger
                          icon={<PoweroffOutlined />}
                          onClick={() => void stop()}
                        >
                          {t('停止')}
                        </Button>
                      </Space>
                    </div>

                    <Descriptions
                      size="small"
                      column={2}
                      items={[
                        {
                          key: 'port',
                          label: t('端口'),
                          children: <span className="hm-mono">{server.port}</span>,
                        },
                        {
                          key: 'started',
                          label: t('启动时间'),
                          children: formatRelative(server.startedAt),
                        },
                        {
                          key: 'pid',
                          label: t('进程 ID'),
                          children: <span className="hm-mono">{server.pid}</span>,
                        },
                        {
                          key: 'site',
                          label: t('站点'),
                          children: currentSite?.name ?? '—',
                        },
                      ]}
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-end gap-4">
                      <div>
                        <div className="mb-1.5 text-xs hm-text-secondary">
                          {t('端口（留空自动分配 4000 起的空闲端口）')}
                        </div>
                        <InputNumber
                          value={port ?? undefined}
                          onChange={(v) => setPort(v ?? null)}
                          min={1024}
                          max={65535}
                          placeholder="4000"
                          style={{ width: 160 }}
                          className="hm-mono"
                        />
                      </div>

                      <Space>
                        <Button
                          type="primary"
                          icon={<PlayCircleOutlined />}
                          loading={starting}
                          onClick={() => void handleStart()}
                          disabled={env !== null && !env.nodeInstalled}
                        >
                          {t('启动预览服务')}
                        </Button>
                        <Button
                          icon={<SyncOutlined />}
                          onClick={() => void generate()}
                          loading={building}
                        >
                          {t('仅重新生成')}
                        </Button>
                      </Space>
                    </div>

                    <Alert
                      type="info"
                      showIcon
                      message={t('关于预览服务')}
                      description={
                        <ul className="mt-1 mb-0 list-disc pl-4 text-xs leading-relaxed">
                          <li>
                            {t(
                              '启动后会执行 hexo server，默认监听 4000 端口（端口被占用时自动顺延）',
                            )}
                          </li>
                          <li>{t('服务在后台运行，关闭应用前建议手动停止以释放端口')}</li>
                          <li>{t('修改文章或配置后，可点击「仅重新生成」刷新静态文件')}</li>
                        </ul>
                      }
                    />
                  </div>
                )}
              </Card>

              {/* 构建操作 */}
              <Card size="small" title={t('构建操作')}>
                <Space wrap className="mb-3">
                  <Button
                    icon={<ClearOutlined />}
                    onClick={() => void clean()}
                    loading={building && action === 'clean'}
                    disabled={building || currentSiteId === null}
                  >
                    {t('清理缓存')}
                  </Button>
                  <Button
                    icon={<SyncOutlined />}
                    onClick={() => void generate()}
                    loading={building && action === 'generate'}
                    disabled={building || currentSiteId === null}
                  >
                    {t('生成静态文件')}
                  </Button>
                  <Button
                    type="primary"
                    icon={<ThunderboltOutlined />}
                    onClick={() => void build()}
                    loading={building && action === 'build'}
                    disabled={building || currentSiteId === null}
                  >
                    {t('完整构建')}
                  </Button>
                  <Tooltip title={t('执行 hexo deploy（需要先配置 deploy）')}>
                    <Button
                      icon={<ExportOutlined />}
                      onClick={() => void deploy()}
                      loading={building && action === 'deploy'}
                      disabled={building || currentSiteId === null}
                    >
                      {t('执行 hexo deploy')}
                    </Button>
                  </Tooltip>
                </Space>

                <LogViewer
                  lines={logLines}
                  height={320}
                  running={building}
                  title={t('构建输出')}
                  emptyText={t('点击上方按钮开始构建')}
                  exportFileName={`hexo-build-${currentSite?.name ?? 'site'}.log`}
                />

                {lastResult ? (
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <Statistic
                      title={t('结果')}
                      value={lastResult.success ? t('成功') : t('失败')}
                      valueStyle={{
                        color: lastResult.success ? '#52c41a' : '#ff4d4f',
                        fontSize: 16,
                      }}
                    />
                    <Statistic
                      title={t('耗时')}
                      value={formatDuration(lastResult.durationMs)}
                      valueStyle={{ fontSize: 16 }}
                    />
                    <Statistic
                      title={t('生成文件')}
                      value={lastResult.filesGenerated ?? '—'}
                      valueStyle={{ fontSize: 16 }}
                    />
                  </div>
                ) : null}
              </Card>
            </Col>

            {/* 右：服务列表与提示 */}
            <Col xs={24} lg={10}>
              <Card
                size="small"
                title={t('运行中的服务（{count}）', { count: servers.length })}
                extra={
                  <Button
                    size="small"
                    type="text"
                    icon={<ReloadOutlined />}
                    onClick={() => void refreshServers()}
                  />
                }
                styles={{ body: { padding: 0, maxHeight: 400, overflow: 'auto' } }}
              >
                {servers.length === 0 ? (
                  <EmptyState
                    kind="articles"
                    compact
                    title={t('暂无运行中的服务')}
                    description={t('启动预览后，服务会显示在这里')}
                  />
                ) : (
                  <List
                    size="small"
                    dataSource={servers}
                    renderItem={(item: PreviewServer) => (
                      <List.Item className="px-3">
                        <div className="w-full">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 truncate text-sm">
                              <StatusDot color="#52c41a" pulse />
                              {servers.length > 1 && item.siteId === currentSiteId
                                ? t('当前站点')
                                : t('站点 #{id}', { id: item.siteId })}
                            </span>
                            <Tag color="green" className="m-0 hm-mono" style={{ fontSize: 11 }}>
                              :{item.port}
                            </Tag>
                          </div>

                          <div className="hm-mono mt-0.5 truncate text-xs hm-text-secondary">
                            {item.url}
                          </div>

                          <div className="mt-1.5 flex items-center justify-between">
                            <span className="text-[11px] hm-text-secondary">
                              {t('PID {pid} · {time} 启动', {
                                pid: item.pid,
                                time: formatRelative(item.startedAt),
                              })}
                            </span>
                            <Space size={4}>
                              <Button
                                size="small"
                                type="text"
                                icon={<CompassOutlined />}
                                onClick={() => void openWithSystem(item.url)}
                              />
                              <Button
                                size="small"
                                type="text"
                                danger
                                icon={<PoweroffOutlined />}
                                onClick={() => void stop(item.pid)}
                              />
                            </Space>
                          </div>
                        </div>
                      </List.Item>
                    )}
                  />
                )}
              </Card>

              {otherServers.length > 0 ? (
                <Alert
                  className="mt-4"
                  type="warning"
                  showIcon
                  icon={<WarningOutlined />}
                  message={t('有 {count} 个其他站点的服务正在运行', {
                    count: otherServers.length,
                  })}
                  description={
                    <div className="mt-1 text-xs">
                      {t('长时间运行会占用端口与内存，建议及时停止不需要的服务。')}
                      <Space size={4} className="mt-2">
                        {otherServers.map((item) => (
                          <Button
                            key={item.pid}
                            size="small"
                            danger
                            onClick={() => void stop(item.pid)}
                          >
                            {t('停止 :{port}', { port: item.port })}
                          </Button>
                        ))}
                      </Space>
                    </div>
                  }
                />
              ) : null}

              <Card size="small" title={t('预览技巧')} className="mt-4">
                <List
                  size="small"
                  dataSource={[
                    { title: t('实时查看改动'), desc: t('修改 Markdown 后重新生成即可刷新页面') },
                    { title: t('移动端适配'), desc: t('在浏览器中开启设备模拟，检查响应式效果') },
                    {
                      title: t('端口冲突'),
                      desc: t('4000 被占用时，可手动指定 4001-4999 之间的端口'),
                    },
                    {
                      title: t('草稿预览'),
                      desc: t('在 _config.yml 中开启 render_drafts 可预览草稿'),
                    },
                    { title: t('清理缓存'), desc: t('样式或数据异常时，先执行「清理缓存」再构建') },
                  ]}
                  renderItem={(item) => (
                    <List.Item className="px-0">
                      <div>
                        <div className="text-sm">{item.title}</div>
                        <div className="text-xs hm-text-secondary">{item.desc}</div>
                      </div>
                    </List.Item>
                  )}
                />
              </Card>

              {building ? (
                <Card size="small" className="mt-4">
                  <div className="flex items-center gap-3">
                    <Spin size="small" />
                    <div>
                      <div className="text-sm">
                        {t('正在执行 {action}…', { action: action ?? t('任务') })}
                      </div>
                      <div className="text-xs hm-text-secondary">
                        {t('构建过程会在左侧日志中实时展示')}
                      </div>
                    </div>
                  </div>
                </Card>
              ) : null}

              {phaseIndex >= 0 && !building ? (
                <Card size="small" title={t('最近一次操作')} className="mt-4">
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="hm-text-secondary">{t('操作类型')}</span>
                      <span>{action ?? t('（已完成）')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="hm-text-secondary">{t('结果')}</span>
                      <Tag
                        color={lastResult?.success ? 'green' : 'red'}
                        className="m-0"
                        style={{ fontSize: 11 }}
                      >
                        {lastResult?.success ? t('成功') : t('失败')}
                      </Tag>
                    </div>
                  </div>
                </Card>
              ) : null}
            </Col>
          </Row>

          {/* 内嵌预览提示 */}
          {server ? (
            <Card size="small" title={t('快速预览')}>
              <div className="flex flex-wrap items-center gap-3">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  imageStyle={{ height: 40 }}
                  description={
                    <span className="text-xs hm-text-secondary">
                      {t('出于安全考虑，本地预览页面在系统浏览器中打开')}
                    </span>
                  }
                  className="!m-0"
                />
                <Button
                  type="primary"
                  icon={<CompassOutlined />}
                  onClick={() => void openWithSystem(server.url)}
                >
                  {t('在浏览器中打开 {url}', { url: server.url })}
                </Button>
                <Button icon={<LinkOutlined />} onClick={() => void handleCopyUrl(server.url)}>
                  {t('复制链接')}
                </Button>
              </div>
            </Card>
          ) : null}
        </div>
      )}
    </PageContainer>
  );
}

export default PreviewPage;
