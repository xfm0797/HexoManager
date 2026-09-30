/** 站点管理：列表、详情、编辑、导入 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  App as AntdApp,
  Button,
  Checkbox,
  Col,
  Descriptions,
  Divider,
  Form,
  Input,
  Modal,
  Radio,
  Row,
  Segmented,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  ExportOutlined,
  FolderOpenOutlined,
  ImportOutlined,
  PlusOutlined,
  ReloadOutlined,
  RocketOutlined,
  SearchOutlined,
  TableOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import {
  CreateSiteWizard,
  EmptyState,
  ErrorState,
  PageContainer,
  SiteCard,
  SkeletonGrid,
  StatCard,
  StatGrid,
} from '@/components';
import { SiteStatusBadge } from '@/components/StatusBadge';
import { useSites } from '@/hooks';
import { useSiteStore } from '@/stores';
import { siteService } from '@/services';
import type { Site, UpdateSiteInput } from '@/types';
import {
  formatDateTime,
  formatFileSize,
  formatNumber,
  formatRelative,
  gradientFromString,
  initialsOf,
} from '@/utils/format';
import { copyToClipboard, openWithSystem, pickDirectory } from '@/utils/desktop';
import { validateSiteName } from '@/utils/validator';

type ViewMode = 'grid' | 'table';

/** 站点管理页面 */
export function SitesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { message, modal } = AntdApp.useApp();

  const { sites, loading, error, refresh, update, remove } = useSites();
  const currentSiteId = useSiteStore((s) => s.currentSiteId);
  const setCurrentSite = useSiteStore((s) => s.setCurrentSite);
  const stats = useSiteStore((s) => s.stats);
  const fetchStats = useSiteStore((s) => s.fetchStats);

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [keyword, setKeyword] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [detailSite, setDetailSite] = useState<Site | null>(null);
  const [editForm] = Form.useForm<UpdateSiteInput>();
  const [saving, setSaving] = useState(false);

  // 支持通过 URL 参数直接打开新建向导
  useEffect(() => {
    if (searchParams.get('action') === 'create') {
      setWizardOpen(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // 打开详情时同步统计
  useEffect(() => {
    if (detailSite) void fetchStats(detailSite.id);
  }, [detailSite, fetchStats]);

  const filtered = useMemo(() => {
    if (!keyword.trim()) return sites;
    const lower = keyword.toLowerCase();
    return sites.filter(
      (site) =>
        site.name.toLowerCase().includes(lower) ||
        (site.description ?? '').toLowerCase().includes(lower) ||
        site.path.toLowerCase().includes(lower) ||
        (site.domain ?? '').toLowerCase().includes(lower),
    );
  }, [sites, keyword]);

  const handleImport = async () => {
    const path = await pickDirectory('选择已有的 Hexo 站点目录');
    if (!path) return;

    try {
      const site = await useSiteStore.getState().importSite(path);
      message.success(`已导入站点「${site.name}」`);
      void refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleEdit = (site: Site) => {
    setEditing(site);
    editForm.setFieldsValue({
      name: site.name,
      description: site.description ?? '',
      domain: site.domain ?? '',
      theme: site.theme ?? '',
      nodeVersion: site.nodeVersion ?? '',
      status: site.status ?? 'active',
    });
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    try {
      const values = await editForm.validateFields();
      setSaving(true);
      await update(editing.id, values);
      setEditing(null);
    } catch (e) {
      if (e instanceof Error && e.message) message.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (site: Site) => {
    let deleteFiles = false;

    modal.confirm({
      title: `删除站点「${site.name}」？`,
      width: 480,
      content: (
        <div className="space-y-2">
          <p className="mb-2 text-sm">
            此操作将从管理列表中移除该站点（不影响磁盘上的文件，除非勾选下方选项）。
          </p>
          <Checkbox
            onChange={(e) => {
              deleteFiles = e.target.checked;
            }}
          >
            <span className="text-red-500">同时删除磁盘上的站点目录（不可恢复）</span>
          </Checkbox>
        </div>
      ),
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await remove(site.id, deleteFiles);
          if (detailSite?.id === site.id) setDetailSite(null);
        } catch (e) {
          message.error(e instanceof Error ? e.message : String(e));
        }
      },
    });
  };

  const handleDuplicate = (site: Site) => {
    const nameRef = { value: `${site.name} 副本` };
    let pathRef = '';

    modal.confirm({
      title: '复制站点',
      width: 520,
      content: (
        <div className="space-y-3 pt-2">
          <div>
            <div className="mb-1 text-xs hm-text-secondary">新站点名称</div>
            <Input
              defaultValue={nameRef.value}
              onChange={(e) => {
                nameRef.value = e.target.value;
              }}
            />
          </div>
          <div>
            <div className="mb-1 text-xs hm-text-secondary">新站点目录</div>
            <div className="flex gap-2">
              <Input
                id="duplicate-path-input"
                placeholder="选择目标目录"
                onChange={(e) => {
                  pathRef = e.target.value;
                }}
                className="hm-mono"
              />
              <Button
                onClick={async () => {
                  const picked = await pickDirectory('选择复制目标目录');
                  if (picked) {
                    pathRef = picked;
                    const input = document.getElementById(
                      'duplicate-path-input',
                    ) as HTMLInputElement | null;
                    if (input) input.value = picked;
                  }
                }}
              >
                选择
              </Button>
            </div>
          </div>
        </div>
      ),
      okText: '开始复制',
      cancelText: '取消',
      onOk: async () => {
        if (!pathRef.trim()) {
          message.error('请选择新站点目录');
          throw new Error('未选择目录');
        }
        try {
          await siteService.duplicate(site.id, nameRef.value, pathRef);
          message.success('站点复制完成');
          await refresh();
        } catch (e) {
          message.error(e instanceof Error ? e.message : String(e));
          throw e;
        }
      },
    });
  };

  const handleBackup = async (site: Site) => {
    const target = await pickDirectory('选择备份保存目录');
    if (!target) return;

    const hide = message.loading('正在备份站点…', 0);
    try {
      const result = await siteService.backup(site.id, target);
      message.success(`备份完成：${result}`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      hide();
    }
  };

  const handleOpenFolder = async (site: Site) => {
    try {
      await siteService.fileTree(site.id, 1).catch(() => undefined);
      await openWithSystem(site.path);
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleCopyPath = async (site: Site) => {
    const ok = await copyToClipboard(site.path);
    if (ok) message.success('路径已复制');
  };

  const columns: ColumnsType<Site> = [
    {
      title: '站点',
      dataIndex: 'name',
      key: 'name',
      width: 280,
      render: (_value, site) => {
        const [from, to] = gradientFromString(site.name);
        return (
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
              style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
            >
              {initialsOf(site.name)}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="cursor-pointer truncate font-medium hover:text-brand-500"
                  onClick={() => setDetailSite(site)}
                >
                  {site.name}
                </span>
                {site.id === currentSiteId ? (
                  <Tag color="blue" className="m-0" style={{ fontSize: 11 }}>
                    当前
                  </Tag>
                ) : null}
              </div>
              <div
                className="truncate text-xs hm-text-secondary"
                title={site.description ?? site.path}
              >
                {site.description || site.path}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status: string) => <SiteStatusBadge status={status} asTag />,
    },
    {
      title: '文章',
      key: 'articles',
      width: 110,
      render: (_value, site) => (
        <span className="text-sm">
          {site.articleCount}
          <span className="ml-1 text-xs hm-text-secondary">/ {site.draftCount} 草稿</span>
        </span>
      ),
    },
    {
      title: '主题',
      dataIndex: 'theme',
      key: 'theme',
      width: 120,
      render: (theme: string | null) =>
        theme ? <Tag className="m-0">{theme}</Tag> : <span className="hm-text-secondary">—</span>,
    },
    {
      title: '域名',
      dataIndex: 'domain',
      key: 'domain',
      ellipsis: true,
      render: (domain: string | null) =>
        domain ? (
          <span className="hm-mono text-xs">{domain}</span>
        ) : (
          <span className="hm-text-secondary">—</span>
        ),
    },
    {
      title: '最近部署',
      dataIndex: 'lastDeployAt',
      key: 'lastDeployAt',
      width: 130,
      render: (value: string | null) => (
        <span className="text-xs hm-text-secondary">
          {value ? formatRelative(value) : '从未部署'}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_value, site) => (
        <Space size={2}>
          <Tooltip title="设为当前站点">
            <Button
              type="text"
              size="small"
              icon={<CheckCircleOutlined />}
              disabled={site.id === currentSiteId}
              onClick={() => {
                setCurrentSite(site.id);
                message.success(`已切换到「${site.name}」`);
              }}
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(site)}
            />
          </Tooltip>
          <Tooltip title="打开目录">
            <Button
              type="text"
              size="small"
              icon={<FolderOpenOutlined />}
              onClick={() => void handleOpenFolder(site)}
            />
          </Tooltip>
          <Tooltip title="复制站点">
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => handleDuplicate(site)}
            />
          </Tooltip>
          <Tooltip title="备份">
            <Button
              type="text"
              size="small"
              icon={<ExportOutlined />}
              onClick={() => void handleBackup(site)}
            />
          </Tooltip>
          <Tooltip title="删除">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(site)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const totalArticles = sites.reduce((sum, s) => sum + s.articleCount, 0);
  const totalDrafts = sites.reduce((sum, s) => sum + s.draftCount, 0);
  const deployedSites = sites.filter((s) => s.lastDeployAt !== null).length;

  return (
    <PageContainer
      title="站点管理"
      description={`共 ${sites.length} 个站点`}
      card={false}
      flush
      extra={
        <Space>
          <Button icon={<ImportOutlined />} onClick={() => void handleImport()}>
            导入站点
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setWizardOpen(true)}>
            新建站点
          </Button>
        </Space>
      }
    >
      <div className="space-y-4">
        {/* 汇总指标 */}
        {sites.length > 0 ? (
          <StatGrid columns={4}>
            <StatCard
              title="站点总数"
              value={sites.length}
              icon={<AppstoreOutlined />}
              iconColor="#3366ff"
            />
            <StatCard
              title="文章总数"
              value={formatNumber(totalArticles)}
              icon={<UnorderedListOutlined />}
              iconColor="#722ed1"
            />
            <StatCard
              title="草稿"
              value={totalDrafts}
              icon={<EditOutlined />}
              iconColor="#faad14"
            />
            <StatCard
              title="已部署站点"
              value={`${deployedSites} / ${sites.length}`}
              icon={<RocketOutlined />}
              iconColor="#52c41a"
            />
          </StatGrid>
        ) : null}

        {/* 工具条 */}
        <div className="hm-surface flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Space>
            <Input
              allowClear
              prefix={<SearchOutlined className="opacity-50" />}
              placeholder="搜索站点名称、路径或域名"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ width: 260 }}
            />
            {keyword ? (
              <span className="text-xs hm-text-secondary">
                匹配 {filtered.length} / {sites.length}
              </span>
            ) : null}
          </Space>

          <Space>
            <Segmented
              value={viewMode}
              onChange={(v) => setViewMode(v as ViewMode)}
              options={[
                { label: '卡片', value: 'grid', icon: <AppstoreOutlined /> },
                { label: '表格', value: 'table', icon: <TableOutlined /> },
              ]}
            />
            <Tooltip title="刷新">
              <Button icon={<ReloadOutlined />} onClick={() => void refresh()} loading={loading}>
                刷新
              </Button>
            </Tooltip>
          </Space>
        </div>

        {/* 列表主体 */}
        {error && sites.length === 0 ? (
          <div className="hm-surface">
            <ErrorState message={error} onRetry={() => void refresh()} />
          </div>
        ) : loading && sites.length === 0 ? (
          <SkeletonGrid rows={2} columns={3} />
        ) : filtered.length === 0 ? (
          <div className="hm-surface">
            <EmptyState
              kind={keyword ? 'search' : 'sites'}
              title={keyword ? '没有匹配的站点' : undefined}
              actionText={keyword ? undefined : '创建第一个站点'}
              onAction={keyword ? undefined : () => setWizardOpen(true)}
              onRefresh={keyword ? () => setKeyword('') : () => void refresh()}
            />
          </div>
        ) : viewMode === 'grid' ? (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))' }}
          >
            {filtered.map((site) => (
              <SiteCard
                key={site.id}
                site={site}
                active={site.id === currentSiteId}
                onSelect={(s) => setDetailSite(s)}
                onEdit={handleEdit}
                onOpenFolder={(s) => void handleOpenFolder(s)}
                onDeploy={() => navigate('/deploy')}
                onDuplicate={handleDuplicate}
                onExport={(s) => void handleBackup(s)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          <div className="hm-surface overflow-hidden">
            <Table
              rowKey="id"
              size="middle"
              columns={columns}
              dataSource={filtered}
              loading={loading}
              scroll={{ x: 1100 }}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (t) => `共 ${t} 个站点`,
              }}
            />
          </div>
        )}
      </div>

      {/* 创建向导 */}
      <CreateSiteWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={(siteId) => setCurrentSite(siteId)}
      />

      {/* 编辑弹窗 */}
      <Modal
        open={editing !== null}
        title={`编辑站点「${editing?.name ?? ''}」`}
        onCancel={() => setEditing(null)}
        onOk={() => void handleSaveEdit()}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={560}
      >
        <Form form={editForm} layout="vertical" className="pt-2">
          <Form.Item
            name="name"
            label="站点名称"
            rules={[
              {
                validator: (_rule, value: string) => {
                  const err = validateSiteName(value ?? '');
                  return err ? Promise.reject(new Error(err)) : Promise.resolve();
                },
              },
            ]}
          >
            <Input maxLength={60} showCount />
          </Form.Item>

          <Form.Item name="description" label="站点描述">
            <Input.TextArea rows={3} maxLength={200} showCount />
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="domain" label="站点域名">
                <Input placeholder="blog.example.com" className="hm-mono" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="theme" label="当前主题">
                <Input placeholder="landscape" className="hm-mono" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="nodeVersion" label="Node 版本">
                <Input placeholder="系统默认" className="hm-mono" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="站点状态">
                <Radio.Group
                  optionType="button"
                  buttonStyle="solid"
                  options={[
                    { label: '正常', value: 'active' },
                    { label: '已归档', value: 'archived' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Alert
            type="info"
            showIcon
            message="站点目录不可修改"
            description={
              <span className="hm-mono text-xs">
                {editing?.path}
                <Button
                  type="link"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => editing && void handleCopyPath(editing)}
                >
                  复制
                </Button>
              </span>
            }
          />
        </Form>
      </Modal>

      {/* 详情抽屉（用 Modal 承载，便于展示较宽内容） */}
      <Modal
        open={detailSite !== null}
        title={
          <div className="flex items-center gap-2">
            <span>{detailSite?.name}</span>
            <SiteStatusBadge status={detailSite?.status} asTag />
            {detailSite?.id === currentSiteId ? (
              <Tag color="blue" className="m-0">
                当前站点
              </Tag>
            ) : null}
          </div>
        }
        onCancel={() => setDetailSite(null)}
        footer={
          <Space>
            <Button onClick={() => setDetailSite(null)}>关闭</Button>
            <Button
              icon={<FolderOpenOutlined />}
              onClick={() => detailSite && void handleOpenFolder(detailSite)}
            >
              打开目录
            </Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => {
                if (detailSite) {
                  setCurrentSite(detailSite.id);
                  message.success(`已切换到「${detailSite.name}」`);
                }
              }}
              disabled={detailSite?.id === currentSiteId}
            >
              设为当前站点
            </Button>
          </Space>
        }
        width={780}
      >
        {detailSite ? (
          <Tabs
            items={[
              {
                key: 'overview',
                label: '概览',
                children: (
                  <div className="space-y-4">
                    <Descriptions
                      column={2}
                      size="small"
                      bordered
                      items={[
                        { key: 'name', label: '站点名称', children: detailSite.name },
                        {
                          key: 'status',
                          label: '状态',
                          children: <SiteStatusBadge status={detailSite.status} asTag />,
                        },
                        {
                          key: 'path',
                          label: '站点目录',
                          span: 2,
                          children: (
                            <span className="hm-mono text-xs break-all">{detailSite.path}</span>
                          ),
                        },
                        {
                          key: 'domain',
                          label: '域名',
                          children: detailSite.domain ?? '—',
                        },
                        { key: 'theme', label: '主题', children: detailSite.theme ?? '—' },
                        {
                          key: 'node',
                          label: 'Node 版本',
                          children: detailSite.nodeVersion ?? '系统默认',
                        },
                        {
                          key: 'created',
                          label: '创建时间',
                          children: formatDateTime(detailSite.createdAt),
                        },
                        {
                          key: 'updated',
                          label: '更新时间',
                          children: formatDateTime(detailSite.updatedAt),
                        },
                        {
                          key: 'deploy',
                          label: '最近部署',
                          children: detailSite.lastDeployAt
                            ? formatDateTime(detailSite.lastDeployAt)
                            : '从未部署',
                        },
                        {
                          key: 'desc',
                          label: '描述',
                          span: 2,
                          children: detailSite.description ?? '—',
                        },
                      ]}
                    />

                    <StatGrid columns={3}>
                      <StatCard
                        title="文章数"
                        value={stats?.articleCount ?? detailSite.articleCount}
                        icon={<UnorderedListOutlined />}
                      />
                      <StatCard
                        title="草稿数"
                        value={stats?.draftCount ?? detailSite.draftCount}
                        icon={<EditOutlined />}
                        iconColor="#faad14"
                      />
                      <StatCard
                        title="占用空间"
                        value={formatFileSize(stats?.diskUsage ?? 0)}
                        icon={<FolderOpenOutlined />}
                        iconColor="#722ed1"
                        tooltip="站点目录占用的磁盘空间"
                      />
                    </StatGrid>
                  </div>
                ),
              },
              {
                key: 'taxonomy',
                label: `分类与标签${
                  stats && (stats.categories.length || stats.tags.length)
                    ? ` (${stats.categories.length}/${stats.tags.length})`
                    : ''
                }`,
                children: (
                  <div className="space-y-4">
                    <div>
                      <div className="mb-2 text-sm font-medium">
                        分类（{stats?.categories.length ?? 0}）
                      </div>
                      {stats && stats.categories.length > 0 ? (
                        <Space size={6} wrap>
                          {stats.categories.map((name) => (
                            <Tag key={name} color="purple" className="m-0">
                              {name}
                            </Tag>
                          ))}
                        </Space>
                      ) : (
                        <span className="text-sm hm-text-secondary">暂无分类</span>
                      )}
                    </div>

                    <Divider className="my-3" />

                    <div>
                      <div className="mb-2 text-sm font-medium">
                        标签（{stats?.tags.length ?? 0}）
                      </div>
                      {stats && stats.tags.length > 0 ? (
                        <Space size={6} wrap>
                          {stats.tags.map((name) => (
                            <Tag key={name} color="blue" className="m-0">
                              {name}
                            </Tag>
                          ))}
                        </Space>
                      ) : (
                        <span className="text-sm hm-text-secondary">暂无标签</span>
                      )}
                    </div>
                  </div>
                ),
              },
              {
                key: 'quick',
                label: '快捷操作',
                children: (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: '文章管理', desc: '撰写与发布文章', path: '/articles' },
                      { label: '配置管理', desc: '编辑 _config.yml', path: '/config' },
                      { label: '主题管理', desc: '切换与配置主题', path: '/themes' },
                      { label: '插件管理', desc: '安装与管理插件', path: '/plugins' },
                      { label: '文件管理', desc: '浏览站点目录', path: '/files' },
                      { label: '本地预览', desc: '启动本地服务', path: '/preview' },
                      { label: '部署配置', desc: '生成 CI/CD 配置', path: '/deploy' },
                      { label: 'Git 操作', desc: '提交与推送', path: '/git' },
                    ].map((item) => (
                      <Button
                        key={item.path}
                        block
                        className="!h-auto !justify-start !py-2.5"
                        onClick={() => {
                          setCurrentSite(detailSite.id);
                          setDetailSite(null);
                          navigate(item.path);
                        }}
                      >
                        <div className="text-left">
                          <div className="text-sm">{item.label}</div>
                          <div className="text-xs hm-text-secondary">{item.desc}</div>
                        </div>
                      </Button>
                    ))}
                  </div>
                ),
              },
            ]}
          />
        ) : null}
      </Modal>
    </PageContainer>
  );
}

export default SitesPage;
