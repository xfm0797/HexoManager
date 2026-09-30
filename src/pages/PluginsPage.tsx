/** 插件管理：安装、启停、卸载 */

import { useMemo, useState } from 'react';
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Col,
  Divider,
  Input,
  List,
  Modal,
  Row,
  Segmented,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ApiOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  ExportOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import {
  CodeBlock,
  EmptyState,
  PageContainer,
  SkeletonTable,
  StatCard,
  StatGrid,
} from '@/components';
import { usePlugins } from '@/hooks';
import { useSiteStore } from '@/stores';
import type { Plugin } from '@/types';
import { formatDateTime } from '@/utils/format';
import { openWithSystem } from '@/utils/desktop';

/** 常用插件推荐清单 */
const RECOMMENDED_PLUGINS = [
  {
    name: 'hexo-generator-feed',
    display: 'RSS 订阅',
    description: '生成 Atom/RSS 订阅文件，便于读者订阅站点更新',
    category: '订阅',
  },
  {
    name: 'hexo-generator-sitemap',
    display: '站点地图',
    description: '生成 sitemap.xml，帮助搜索引擎更好地索引站点',
    category: 'SEO',
  },
  {
    name: 'hexo-generator-searchdb',
    display: '本地搜索',
    description: '生成站内搜索索引，配合主题实现本地全文搜索',
    category: '搜索',
  },
  {
    name: 'hexo-generator-index',
    display: '首页生成',
    description: '生成首页分页，支持置顶文章排序',
    category: '生成器',
  },
  {
    name: 'hexo-renderer-marked',
    display: 'Marked 渲染器',
    description: '使用 marked 渲染 Markdown，支持 GFM 语法',
    category: '渲染器',
  },
  {
    name: 'hexo-renderer-pandoc',
    display: 'Pandoc 渲染器',
    description: '使用 Pandoc 渲染，支持更多文档格式转换',
    category: '渲染器',
  },
  {
    name: 'hexo-deployer-git',
    display: 'Git 部署器',
    description: '通过 Git 推送部署站点，最常用的部署方式',
    category: '部署',
  },
  {
    name: 'hexo-filter-nofollow',
    display: '外链 nofollow',
    description: '自动为外部链接添加 rel="nofollow"，有助于 SEO',
    category: 'SEO',
  },
  {
    name: 'hexo-wordcount',
    display: '字数统计',
    description: '统计文章字数与阅读时长，供主题调用',
    category: '辅助',
  },
  {
    name: 'hexo-abbrlink',
    display: '短链接',
    description: '为文章生成固定短链接，避免标题变更导致链接失效',
    category: 'SEO',
  },
  {
    name: 'hexo-autonofollow',
    display: '自动 nofollow',
    description: '自动处理外部链接的 nofollow 属性',
    category: 'SEO',
  },
  {
    name: 'hexo-browsersync',
    display: '浏览器同步',
    description: '热更新与多设备同步预览，提升写作体验',
    category: '开发',
  },
] as const;

/** 插件管理页面 */
export function PluginsPage() {
  const { message, modal } = AntdApp.useApp();

  const currentSiteId = useSiteStore((s) => s.currentSiteId);
  const currentSite = useSiteStore((s) => s.sites.find((site) => site.id === s.currentSiteId));

  const { plugins, busy, install, uninstall, toggle, refresh } = usePlugins(currentSiteId);

  const [installOpen, setInstallOpen] = useState(false);
  const [installName, setInstallName] = useState('');
  const [installing, setInstalling] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [detailPlugin, setDetailPlugin] = useState<Plugin | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const installedNames = useMemo(() => new Set(plugins.map((p) => p.name)), [plugins]);

  const categories = useMemo(() => {
    const set = new Set(RECOMMENDED_PLUGINS.map((p) => p.category));
    return ['all', ...Array.from(set)];
  }, []);

  const filteredRecommended = useMemo(() => {
    return RECOMMENDED_PLUGINS.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (!keyword.trim()) return true;
      const lower = keyword.toLowerCase();
      return (
        item.name.toLowerCase().includes(lower) ||
        item.display.toLowerCase().includes(lower) ||
        item.description.toLowerCase().includes(lower)
      );
    });
  }, [categoryFilter, keyword]);

  const filteredPlugins = useMemo(() => {
    if (!keyword.trim()) return plugins;
    const lower = keyword.toLowerCase();
    return plugins.filter((p) => p.name.toLowerCase().includes(lower));
  }, [plugins, keyword]);

  const handleInstall = async (name: string) => {
    if (!name.trim()) {
      message.warning('请输入插件名称');
      return;
    }

    setInstalling(true);
    try {
      await install(name.trim());
      setInstallOpen(false);
      setInstallName('');
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstall = (plugin: Plugin) => {
    modal.confirm({
      title: `卸载插件「${plugin.name}」？`,
      content: '将从 package.json 中移除依赖并卸载该 npm 包，站点可能需要重新生成。',
      okText: '卸载',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => uninstall(plugin.name),
    });
  };

  const columns: ColumnsType<Plugin> = [
    {
      title: '插件',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, plugin) => {
        const recommended = RECOMMENDED_PLUGINS.find((p) => p.name === name);
        return (
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-500">
              <ApiOutlined />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="hm-mono truncate text-sm">{name}</span>
                {recommended ? (
                  <Tag color="blue" className="m-0" style={{ fontSize: 11 }}>
                    {recommended.category}
                  </Tag>
                ) : null}
              </div>
              {recommended ? (
                <div className="text-xs hm-text-secondary">{recommended.description}</div>
              ) : plugin.config ? (
                <div className="truncate text-xs hm-text-secondary">{plugin.config}</div>
              ) : null}
            </div>
          </div>
        );
      },
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 100,
      render: (version: string | null) =>
        version ? (
          <Tag className="m-0 hm-mono" style={{ fontSize: 11 }}>
            v{version}
          </Tag>
        ) : (
          <span className="hm-text-secondary">—</span>
        ),
    },
    {
      title: '启用',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 90,
      render: (isActive: boolean, plugin) => (
        <Switch
          size="small"
          checked={isActive}
          onChange={(checked) => void toggle(plugin.name, checked)}
          checkedChildren="启用"
          unCheckedChildren="停用"
        />
      ),
    },
    {
      title: '安装时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      render: (value: string | null) => (
        <span className="text-xs hm-text-secondary">{formatDateTime(value)}</span>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_value, plugin) => (
        <Space size={2}>
          <Tooltip title="查看详情">
            <Button
              type="text"
              size="small"
              icon={<InfoCircleOutlined />}
              onClick={() => setDetailPlugin(plugin)}
            />
          </Tooltip>
          <Tooltip title="打开 npm 页面">
            <Button
              type="text"
              size="small"
              icon={<ExportOutlined />}
              onClick={() => void openWithSystem(`https://www.npmjs.com/package/${plugin.name}`)}
            />
          </Tooltip>
          <Tooltip title="卸载">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleUninstall(plugin)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title="插件管理"
      description={
        currentSite ? `${currentSite.name} · 共 ${plugins.length} 个插件` : '请先选择站点'
      }
      card={false}
      flush
      extra={
        <Space>
          <Button
            icon={<PlusOutlined />}
            type="primary"
            onClick={() => setInstallOpen(true)}
            disabled={currentSiteId === null}
          >
            安装插件
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void refresh()}
            loading={busy}
            disabled={currentSiteId === null}
          >
            刷新
          </Button>
        </Space>
      }
    >
      {currentSiteId === null ? (
        <div className="hm-surface">
          <EmptyState
            kind="articles"
            title="请先选择站点"
            description="在顶栏选择站点后管理其插件"
          />
        </div>
      ) : (
        <div className="space-y-4">
          <StatGrid columns={4}>
            <StatCard title="已安装插件" value={plugins.length} icon={<ApiOutlined />} />
            <StatCard
              title="已启用"
              value={plugins.filter((p) => p.isActive).length}
              icon={<CheckCircleOutlined />}
              iconColor="#52c41a"
            />
            <StatCard
              title="已停用"
              value={plugins.filter((p) => !p.isActive).length}
              icon={<ApiOutlined />}
              iconColor="#8c8c8c"
            />
            <StatCard
              title="推荐未安装"
              value={RECOMMENDED_PLUGINS.filter((p) => !installedNames.has(p.name)).length}
              icon={<DownloadOutlined />}
              iconColor="#fa8c16"
              tooltip="常用插件中尚未安装的数量"
            />
          </StatGrid>

          <Row gutter={16}>
            {/* 已安装插件 */}
            <Col xs={24} lg={15}>
              <Card
                size="small"
                title="已安装插件"
                extra={
                  <Space size={8}>
                    <Input
                      size="small"
                      allowClear
                      prefix={<SearchOutlined className="opacity-50" />}
                      placeholder="搜索插件"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      style={{ width: 160 }}
                    />
                    <Segmented
                      size="small"
                      value={viewMode}
                      onChange={(v) => setViewMode(v as 'table' | 'grid')}
                      options={[
                        { label: '列表', value: 'table' },
                        { label: '卡片', value: 'grid' },
                      ]}
                    />
                  </Space>
                }
                styles={{ body: { padding: viewMode === 'table' ? 0 : 16 } }}
              >
                {busy && plugins.length === 0 ? (
                  <div className="p-4">
                    <SkeletonTable rows={5} />
                  </div>
                ) : filteredPlugins.length === 0 ? (
                  <EmptyState
                    kind={keyword ? 'search' : 'articles'}
                    compact
                    title={keyword ? '没有匹配的插件' : '还没有安装插件'}
                    description={
                      keyword ? '换个关键词试试' : '从右侧推荐列表中选择常用插件快速安装'
                    }
                    actionText={keyword ? undefined : '安装插件'}
                    onAction={keyword ? undefined : () => setInstallOpen(true)}
                    onRefresh={keyword ? () => setKeyword('') : undefined}
                  />
                ) : viewMode === 'table' ? (
                  <Table
                    rowKey="id"
                    size="small"
                    columns={columns}
                    dataSource={filteredPlugins}
                    pagination={filteredPlugins.length > 10 ? { pageSize: 10 } : false}
                  />
                ) : (
                  <div
                    className="grid gap-3"
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}
                  >
                    {filteredPlugins.map((plugin) => (
                      <Card
                        key={plugin.id}
                        size="small"
                        className={plugin.isActive ? '' : 'opacity-70'}
                        title={
                          <span className="hm-mono truncate text-xs" title={plugin.name}>
                            {plugin.name}
                          </span>
                        }
                        extra={
                          <Switch
                            size="small"
                            checked={plugin.isActive}
                            onChange={(checked) => void toggle(plugin.name, checked)}
                          />
                        }
                      >
                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="hm-text-secondary">版本</span>
                            <span className="hm-mono">{plugin.version ?? '—'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="hm-text-secondary">安装时间</span>
                            <span>{formatDateTime(plugin.createdAt)}</span>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center gap-1">
                          <Button
                            size="small"
                            type="text"
                            icon={<InfoCircleOutlined />}
                            onClick={() => setDetailPlugin(plugin)}
                          />
                          <Button
                            size="small"
                            type="text"
                            icon={<ExportOutlined />}
                            onClick={() =>
                              void openWithSystem(`https://www.npmjs.com/package/${plugin.name}`)
                            }
                          />
                          <Button
                            size="small"
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => handleUninstall(plugin)}
                          />
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </Card>
            </Col>

            {/* 推荐插件 */}
            <Col xs={24} lg={9}>
              <Card
                size="small"
                title="常用插件推荐"
                extra={
                  <span className="text-xs hm-text-secondary">{filteredRecommended.length} 项</span>
                }
                styles={{ body: { padding: 0, maxHeight: 620, overflow: 'auto' } }}
              >
                <div className="p-3">
                  <Segmented
                    size="small"
                    block
                    value={categoryFilter}
                    onChange={(v) => setCategoryFilter(String(v))}
                    options={categories.map((c) => ({
                      label: c === 'all' ? '全部' : c,
                      value: c,
                    }))}
                  />
                </div>

                {filteredRecommended.length === 0 ? (
                  <EmptyState kind="search" compact title="没有匹配的插件" />
                ) : (
                  <List
                    size="small"
                    dataSource={filteredRecommended}
                    renderItem={(item) => {
                      const installed = installedNames.has(item.name);
                      return (
                        <List.Item className="px-3">
                          <div className="w-full">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">{item.display}</span>
                              <Tag className="m-0" style={{ fontSize: 11 }}>
                                {item.category}
                              </Tag>
                            </div>

                            <div className="hm-mono mt-0.5 truncate text-xs hm-text-secondary">
                              {item.name}
                            </div>

                            <p className="mt-1 mb-1.5 text-xs hm-text-secondary">
                              {item.description}
                            </p>

                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="small"
                                type="text"
                                icon={<ExportOutlined />}
                                onClick={() =>
                                  void openWithSystem(`https://www.npmjs.com/package/${item.name}`)
                                }
                              />
                              <Button
                                size="small"
                                type={installed ? 'default' : 'primary'}
                                ghost={!installed}
                                disabled={installed}
                                loading={installing && installName === item.name}
                                onClick={() => void handleInstall(item.name)}
                              >
                                {installed ? '已安装' : '安装'}
                              </Button>
                            </div>
                          </div>
                        </List.Item>
                      );
                    }}
                  />
                )}
              </Card>

              <Alert
                className="mt-4"
                type="info"
                showIcon
                message="插件说明"
                description={
                  <ul className="mt-1 mb-0 list-disc pl-4 text-xs leading-relaxed">
                    <li>插件通过 npm 安装到站点目录，卸载时会同步更新 package.json</li>
                    <li>停用插件只是逻辑标记，如需完全移除请使用「卸载」</li>
                    <li>安装或卸载后建议重新构建站点（hexo clean &amp;&amp; hexo generate）</li>
                  </ul>
                }
              />
            </Col>
          </Row>
        </div>
      )}

      {/* 安装插件弹窗 */}
      <Modal
        open={installOpen}
        title="安装插件"
        onCancel={() => setInstallOpen(false)}
        onOk={() => void handleInstall(installName)}
        confirmLoading={installing}
        okText="开始安装"
        cancelText="取消"
        width={560}
      >
        <div className="space-y-4 pt-2">
          <div>
            <div className="mb-2 text-sm">npm 包名</div>
            <Input
              autoFocus
              value={installName}
              onChange={(e) => setInstallName(e.target.value)}
              onPressEnter={() => void handleInstall(installName)}
              placeholder="如 hexo-generator-feed"
              className="hm-mono"
              prefix={<ApiOutlined />}
              allowClear
            />
          </div>

          <Alert
            type="info"
            showIcon
            message="安装命令"
            description={
              <CodeBlock
                code={`cd "${currentSite?.path ?? '<站点目录>'}"\nnpm install ${installName || '<包名>'} --save`}
                language="shell"
                maxHeight={90}
              />
            }
          />

          <Divider className="my-2" />

          <div>
            <div className="mb-2 text-xs hm-text-secondary">快速选择常用插件</div>
            <Space size={4} wrap>
              {RECOMMENDED_PLUGINS.filter((p) => !installedNames.has(p.name))
                .slice(0, 10)
                .map((item) => (
                  <Tag
                    key={item.name}
                    className="m-0 cursor-pointer hm-mono"
                    style={{ fontSize: 11 }}
                    color={installName === item.name ? 'blue' : undefined}
                    onClick={() => setInstallName(item.name)}
                  >
                    {item.name}
                  </Tag>
                ))}
            </Space>
          </div>
        </div>
      </Modal>

      {/* 插件详情 */}
      <Modal
        open={detailPlugin !== null}
        title={detailPlugin?.name}
        onCancel={() => setDetailPlugin(null)}
        width={620}
        footer={
          <Space>
            <Button onClick={() => setDetailPlugin(null)}>关闭</Button>
            {detailPlugin ? (
              <Button
                icon={<ExportOutlined />}
                onClick={() =>
                  void openWithSystem(`https://www.npmjs.com/package/${detailPlugin.name}`)
                }
              >
                npm 页面
              </Button>
            ) : null}
            {detailPlugin ? (
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={() => {
                  handleUninstall(detailPlugin);
                  setDetailPlugin(null);
                }}
              >
                卸载
              </Button>
            ) : null}
          </Space>
        }
      >
        {detailPlugin ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div className="flex justify-between">
                <span className="hm-text-secondary">名称</span>
                <span className="hm-mono text-xs">{detailPlugin.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="hm-text-secondary">版本</span>
                <span className="hm-mono text-xs">{detailPlugin.version ?? '未知'}</span>
              </div>
              <div className="flex justify-between">
                <span className="hm-text-secondary">状态</span>
                <Tag color={detailPlugin.isActive ? 'green' : 'default'} className="m-0">
                  {detailPlugin.isActive ? '已启用' : '已停用'}
                </Tag>
              </div>
              <div className="flex justify-between">
                <span className="hm-text-secondary">安装时间</span>
                <span className="text-xs">{formatDateTime(detailPlugin.createdAt)}</span>
              </div>
            </div>

            {detailPlugin.config ? (
              <div>
                <div className="mb-1 text-xs hm-text-secondary">插件配置片段</div>
                <CodeBlock code={detailPlugin.config} language="yaml" maxHeight={200} lineNumbers />
              </div>
            ) : (
              <Alert type="info" showIcon message="该插件没有独立的配置片段" />
            )}
          </div>
        ) : null}
      </Modal>
    </PageContainer>
  );
}

export default PluginsPage;
