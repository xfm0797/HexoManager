/** 工作台：全局概览与快捷入口 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Col,
  Empty,
  Progress,
  Row,
  Space,
  Tag,
  Timeline,
} from 'antd';
import {
  ArrowRightOutlined,
  BranchesOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  FireOutlined,
  FolderOutlined,
  PlusOutlined,
  ReloadOutlined,
  RocketOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  ArticleListItem,
  EmptyState,
  ErrorState,
  PageContainer,
  SiteCard,
  SkeletonGrid,
  StatCard,
  StatGrid,
} from '@/components';
import { useArticles, useDeploy, useHexoServer, useSites } from '@/hooks';
import { useDeployStore, useSiteStore } from '@/stores';
import type { Article as ArticleType } from '@/types';
import { formatCompactNumber, formatDuration, formatRelative } from '@/utils/format';
import { DEPLOY_STATUS_META } from '@/constants';
import { DeployStatusBadge, StatusDot } from '@/components/StatusBadge';

/** 工作台页面 */
export function DashboardPage() {
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();

  const { sites, loading: sitesLoading, error: sitesError, refresh } = useSites();
  const currentSiteId = useSiteStore((s) => s.currentSiteId);
  const setCurrentSite = useSiteStore((s) => s.setCurrentSite);
  const stats = useSiteStore((s) => s.stats);
  const fetchStats = useSiteStore((s) => s.fetchStats);

  const { articles, loading: articlesLoading, total } = useArticles();
  const { current: server } = useHexoServer(currentSiteId);
  const { logs } = useDeploy(currentSiteId);
  const lastResult = useDeployStore((s) => s.lastResult);

  const [recentSites, setRecentSites] = useState(sites.slice(0, 6));

  const currentSite = useMemo(
    () => sites.find((s) => s.id === currentSiteId),
    [sites, currentSiteId],
  );

  useEffect(() => {
    if (currentSiteId !== null) void fetchStats(currentSiteId);
  }, [currentSiteId, fetchStats]);

  useEffect(() => {
    // 按最近部署时间排序，取前 6 个
    const sorted = [...sites].sort((a, b) => {
      const aTime = a.lastDeployAt ? new Date(a.lastDeployAt).getTime() : 0;
      const bTime = b.lastDeployAt ? new Date(b.lastDeployAt).getTime() : 0;
      return bTime - aTime;
    });
    setRecentSites(sorted.slice(0, 6));
  }, [sites]);

  const successfulDeploys = useMemo(
    () => logs.filter((l) => l.status === 'success').length,
    [logs],
  );

  const successRate = logs.length > 0 ? (successfulDeploys / logs.length) * 100 : 0;

  const handleOpenArticle = (article: ArticleType) => {
    navigate(`/articles?article=${article.id}`);
  };

  if (sitesError && sites.length === 0) {
    return (
      <PageContainer title="工作台">
        <ErrorState message={sitesError} onRetry={() => void refresh()} />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="工作台"
      description={
        sites.length > 0
          ? `共管理 ${sites.length} 个站点，${formatCompactNumber(total)} 篇文章`
          : '开始管理你的 Hexo 站点'
      }
      card={false}
      flush
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void refresh()} loading={sitesLoading}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/sites?action=create')}
          >
            新建站点
          </Button>
        </Space>
      }
    >
      {sites.length === 0 ? (
        <div className="hm-surface">
          <EmptyState
            kind="sites"
            actionText="创建第一个站点"
            onAction={() => navigate('/sites?action=create')}
            onRefresh={() => void refresh()}
          />
        </div>
      ) : (
        <div className="space-y-5">
          {/* 当前站点概览 */}
          {currentSite ? (
            <div className="hm-surface p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="m-0 truncate text-lg font-semibold">{currentSite.name}</h2>
                    {server ? (
                      <StatusDot color="#52c41a" pulse text={`预览运行中 :${server.port}`} />
                    ) : null}
                  </div>
                  <p className="mt-1 mb-0 text-sm hm-text-secondary">
                    {currentSite.description || currentSite.path}
                  </p>
                </div>

                <Space>
                  <Button icon={<FolderOutlined />} onClick={() => navigate('/files')}>
                    文件
                  </Button>
                  <Button icon={<ThunderboltOutlined />} onClick={() => navigate('/preview')}>
                    本地预览
                  </Button>
                  <Button
                    type="primary"
                    icon={<RocketOutlined />}
                    onClick={() => navigate('/deploy')}
                  >
                    部署
                  </Button>
                </Space>
              </div>

              <StatGrid columns={4}>
                <StatCard
                  title="文章总数"
                  value={stats?.articleCount ?? currentSite.articleCount}
                  icon={<FileTextOutlined />}
                  iconColor="#3366ff"
                  tooltip="已发布文章数量"
                />
                <StatCard
                  title="草稿"
                  value={stats?.draftCount ?? currentSite.draftCount}
                  icon={<FileTextOutlined />}
                  iconColor="#faad14"
                  tooltip="尚未发布的草稿数量"
                />
                <StatCard
                  title="总字数"
                  value={formatCompactNumber(stats?.totalWords ?? 0)}
                  icon={<FireOutlined />}
                  iconColor="#eb2f96"
                  tooltip="全部文章的字数合计"
                />
                <StatCard
                  title="部署成功率"
                  value={`${successRate.toFixed(0)}%`}
                  icon={<CheckCircleOutlined />}
                  iconColor="#52c41a"
                  tooltip={`最近 ${logs.length} 次部署中成功 ${successfulDeploys} 次`}
                  footer={
                    <Progress
                      percent={successRate}
                      size="small"
                      showInfo={false}
                      strokeColor="#52c41a"
                    />
                  }
                />
              </StatGrid>

              {/* 分类 / 标签概览 */}
              {stats && (stats.categories.length > 0 || stats.tags.length > 0) ? (
                <div className="mt-4 flex flex-wrap items-start gap-6">
                  {stats.categories.length > 0 ? (
                    <div>
                      <div className="mb-1.5 text-xs hm-text-secondary">
                        分类（{stats.categories.length}）
                      </div>
                      <Space size={4} wrap>
                        {stats.categories.slice(0, 8).map((name) => (
                          <Tag
                            key={name}
                            color="purple"
                            className="m-0 cursor-pointer"
                            onClick={() => navigate('/categories')}
                          >
                            {name}
                          </Tag>
                        ))}
                      </Space>
                    </div>
                  ) : null}

                  {stats.tags.length > 0 ? (
                    <div>
                      <div className="mb-1.5 text-xs hm-text-secondary">
                        标签（{stats.tags.length}）
                      </div>
                      <Space size={4} wrap>
                        {stats.tags.slice(0, 10).map((name) => (
                          <Tag
                            key={name}
                            color="blue"
                            className="m-0 cursor-pointer"
                            onClick={() => navigate('/categories')}
                          >
                            {name}
                          </Tag>
                        ))}
                      </Space>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {lastResult ? (
                <Alert
                  className="mt-4"
                  type={lastResult.success ? 'success' : 'error'}
                  showIcon
                  message={
                    lastResult.success
                      ? `上次部署成功，耗时 ${formatDuration(lastResult.durationMs)}`
                      : `上次部署失败：${lastResult.error ?? '未知错误'}`
                  }
                  action={
                    <Button size="small" type="link" onClick={() => navigate('/logs')}>
                      查看记录
                    </Button>
                  }
                />
              ) : null}
            </div>
          ) : (
            <Alert
              type="info"
              showIcon
              message="请先选择一个站点"
              description="在顶栏的站点切换器中选择站点，即可查看统计信息与文章列表。"
            />
          )}

          <Row gutter={16}>
            {/* 最近文章 */}
            <Col xs={24} lg={14}>
              <Card
                title="最近更新的文章"
                size="small"
                extra={
                  <Button
                    type="link"
                    size="small"
                    onClick={() => navigate('/articles')}
                    disabled={currentSiteId === null}
                  >
                    查看全部 <ArrowRightOutlined />
                  </Button>
                }
                styles={{ body: { padding: 0, minHeight: 280 } }}
              >
                {currentSiteId === null ? (
                  <EmptyState
                    kind="articles"
                    compact
                    title="请先选择站点"
                    description="选择站点后展示其文章列表"
                  />
                ) : articlesLoading ? (
                  <div className="p-4">
                    <SkeletonGrid rows={1} columns={1} itemHeight={88} />
                  </div>
                ) : articles.length === 0 ? (
                  <EmptyState
                    kind="articles"
                    compact
                    actionText="新建文章"
                    onAction={() => navigate('/articles?action=new')}
                  />
                ) : (
                  <div className="max-h-[380px] overflow-auto">
                    {articles.slice(0, 6).map((article: ArticleType) => (
                      <ArticleListItem
                        key={article.id}
                        article={article}
                        onOpen={handleOpenArticle}
                      />
                    ))}
                  </div>
                )}
              </Card>
            </Col>

            {/* 最近部署记录 */}
            <Col xs={24} lg={10}>
              <Card
                title="最近部署"
                size="small"
                extra={
                  <Button
                    type="link"
                    size="small"
                    onClick={() => navigate('/logs')}
                    disabled={currentSiteId === null}
                  >
                    全部记录 <ArrowRightOutlined />
                  </Button>
                }
                styles={{ body: { padding: 16, minHeight: 280 } }}
              >
                {logs.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={<span className="text-xs hm-text-secondary">还没有部署记录</span>}
                  >
                    <Button
                      size="small"
                      type="primary"
                      onClick={() => navigate('/deploy')}
                      disabled={currentSiteId === null}
                    >
                      去部署
                    </Button>
                  </Empty>
                ) : (
                  <Timeline
                    className="mt-1"
                    items={logs.slice(0, 6).map((log) => {
                      const meta = DEPLOY_STATUS_META[log.status] ?? DEPLOY_STATUS_META.pending;
                      return {
                        color:
                          log.status === 'success'
                            ? 'green'
                            : log.status === 'failed'
                              ? 'red'
                              : 'blue',
                        children: (
                          <div className="pb-1">
                            <div className="flex items-center gap-2">
                              <DeployStatusBadge status={log.status} />
                              <span className="text-xs hm-text-secondary">
                                {formatRelative(log.createdAt)}
                              </span>
                            </div>
                            <div
                              className="mt-0.5 truncate text-sm"
                              title={log.commitMessage ?? ''}
                            >
                              {log.commitMessage || '（无提交信息）'}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-xs hm-text-secondary">
                              {log.commitHash ? (
                                <span className="hm-mono">{log.commitHash.slice(0, 7)}</span>
                              ) : null}
                              {log.branch ? (
                                <span className="inline-flex items-center gap-0.5">
                                  <BranchesOutlined />
                                  {log.branch}
                                </span>
                              ) : null}
                              {log.durationMs !== null ? (
                                <span>{formatDuration(log.durationMs)}</span>
                              ) : null}
                              <Tag className="m-0" style={{ fontSize: 10 }}>
                                {meta.label}
                              </Tag>
                            </div>
                          </div>
                        ),
                      };
                    })}
                  />
                )}
              </Card>
            </Col>
          </Row>

          {/* 站点快捷切换 */}
          {recentSites.length > 0 ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="m-0 text-base font-semibold">站点</h3>
                <Button type="link" size="small" onClick={() => navigate('/sites')}>
                  管理全部 <ArrowRightOutlined />
                </Button>
              </div>

              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}
              >
                {recentSites.map((site) => (
                  <SiteCard
                    key={site.id}
                    site={site}
                    active={site.id === currentSiteId}
                    onSelect={(s) => {
                      setCurrentSite(s.id);
                      message.success(`已切换到「${s.name}」`);
                    }}
                    onOpenFolder={() => navigate('/files')}
                    onDeploy={() => navigate('/deploy')}
                    onEdit={() => navigate('/sites')}
                  />
                ))}

                {/* 新建站点入口卡 */}
                <button
                  type="button"
                  onClick={() => navigate('/sites?action=create')}
                  className="hm-surface flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-2 border-dashed transition-colors hover:border-brand-400 hover:text-brand-500"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                    <PlusOutlined />
                  </span>
                  <span className="text-sm">新建站点</span>
                </button>
              </div>
            </div>
          ) : null}

          {/* 系统提示 */}
          {sites.some((s) => s.status === 'error') ? (
            <Alert
              type="warning"
              showIcon
              icon={<WarningOutlined />}
              message="部分站点状态异常"
              description="有站点目录不可访问或配置损坏，请前往「站点管理」检查。"
              action={
                <Button size="small" onClick={() => navigate('/sites')}>
                  去检查
                </Button>
              }
            />
          ) : null}
        </div>
      )}
    </PageContainer>
  );
}

export default DashboardPage;
