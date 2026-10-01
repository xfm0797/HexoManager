/** 主题管理：安装、切换、配置 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Input,
  List,
  Modal,
  Radio,
  Row,
  Segmented,
  Space,
  Spin,
  Tag,
  Tooltip,
} from 'antd';
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  CloudDownloadOutlined,
  DeleteOutlined,
  ExportOutlined,
  EyeOutlined,
  GlobalOutlined,
  ReloadOutlined,
  SaveOutlined,
  SearchOutlined,
  SettingOutlined,
  StarOutlined,
  SyncOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import {
  CodeEditor,
  EmptyState,
  PageContainer,
  SkeletonGrid,
  StatCard,
  StatGrid,
} from '@/components';
import { useThemeConfig, useThemes } from '@/hooks';
import { useSiteStore } from '@/stores';
import type { Theme } from '@/types';
import { formatRelative, gradientFromString, initialsOf } from '@/utils/format';
import { openWithSystem } from '@/utils/desktop';
import { parseYaml } from '@/utils/yaml';

/** 主题管理页面 */
export function ThemesPage() {
  const { message, modal } = AntdApp.useApp();

  const currentSiteId = useSiteStore((s) => s.currentSiteId);
  const currentSite = useSiteStore((s) => s.sites.find((site) => site.id === s.currentSiteId));

  const {
    themes,
    active,
    market,
    loading,
    busy,
    switchTheme,
    install,
    uninstall,
    update,
    search,
    refresh,
  } = useThemes(currentSiteId);

  const [keyword, setKeyword] = useState('');
  const [marketKeyword, setMarketKeyword] = useState('');
  const [installOpen, setInstallOpen] = useState(false);
  const [installSource, setInstallSource] = useState<'npm' | 'git'>('npm');
  const [installName, setInstallName] = useState('');
  const [installing, setInstalling] = useState(false);
  const [configTheme, setConfigTheme] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  const {
    raw: themeRaw,
    loading: configLoading,
    saving: configSaving,
    error: themeConfigError,
    save: saveThemeConfig,
    reload: reloadThemeConfig,
  } = useThemeConfig(configOpen ? currentSiteId : null, configTheme);

  const [draftRaw, setDraftRaw] = useState('');

  // 同步主题配置文本
  useEffect(() => {
    if (themeRaw) setDraftRaw(themeRaw);
  }, [themeRaw]);

  useEffect(() => {
    if (market.length === 0) void search();
    // 仅首次加载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredThemes = useMemo(() => {
    if (!keyword.trim()) return themes;
    const lower = keyword.toLowerCase();
    return themes.filter(
      (theme) =>
        theme.name.toLowerCase().includes(lower) ||
        (theme.description ?? '').toLowerCase().includes(lower),
    );
  }, [themes, keyword]);

  const filteredMarket = useMemo(() => {
    if (!marketKeyword.trim()) return market;
    const lower = marketKeyword.toLowerCase();
    return market.filter(
      (theme) =>
        theme.name.toLowerCase().includes(lower) ||
        (theme.displayName ?? '').toLowerCase().includes(lower),
    );
  }, [market, marketKeyword]);

  const yamlError = useMemo(
    () => (configOpen ? parseYaml(draftRaw).error : null),
    [configOpen, draftRaw],
  );

  const handleInstall = async () => {
    if (!installName.trim()) {
      message.warning('请输入主题名称');
      return;
    }

    setInstalling(true);
    try {
      const source = installSource === 'npm' ? installName.trim() : `git:${installName.trim()}`;
      const result = await install(installName.trim(), source);
      if (result) {
        setInstallOpen(false);
        setInstallName('');
      }
    } finally {
      setInstalling(false);
    }
  };

  const handleOpenConfig = (theme: Theme) => {
    setConfigTheme(theme.name);
    setConfigOpen(true);
  };

  const handleSaveConfig = async () => {
    if (yamlError) {
      message.error('YAML 格式有误，请修正后再保存');
      return;
    }
    await saveThemeConfig(draftRaw);
  };

  const handleUninstall = (theme: Theme) => {
    modal.confirm({
      title: `卸载主题「${theme.name}」？`,
      content: '主题目录与配置文件将被删除。如果该主题正在使用中，建议先切换到其他主题。',
      okText: '卸载',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => uninstall(theme),
    });
  };

  const handleSwitch = (theme: Theme) => {
    if (theme.isActive) {
      message.info('该主题已是当前使用的主题');
      return;
    }

    modal.confirm({
      title: `切换到主题「${theme.name}」？`,
      content: '切换后会修改 _config.yml 中的 theme 字段，需要重新生成站点才能看到效果。',
      okText: '切换',
      cancelText: '取消',
      onOk: () => switchTheme(theme),
    });
  };

  const hasConfig = (theme: Theme) => theme.hasConfig;

  return (
    <PageContainer
      title="主题管理"
      description={
        currentSite ? `${currentSite.name} · 共 ${themes.length} 个主题` : '请先选择站点'
      }
      card={false}
      flush
      extra={
        <Space>
          <Button
            icon={<CloudDownloadOutlined />}
            onClick={() => setInstallOpen(true)}
            disabled={currentSiteId === null}
          >
            安装主题
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void refresh()}
            loading={loading}
            disabled={currentSiteId === null}
          >
            刷新
          </Button>
        </Space>
      }
    >
      {currentSiteId === null ? (
        <div className="hm-surface">
          <EmptyState kind="themes" title="请先选择站点" description="在顶栏选择站点后管理其主题" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* 概览 */}
          <StatGrid columns={4}>
            <StatCard title="已安装主题" value={themes.length} icon={<AppstoreOutlined />} />
            <StatCard
              title="当前主题"
              value={active?.name ?? currentSite?.theme ?? '未设置'}
              icon={<CheckCircleOutlined />}
              iconColor="#52c41a"
            />
            <StatCard
              title="带配置的主题"
              value={themes.filter(hasConfig).length}
              icon={<SettingOutlined />}
              iconColor="#722ed1"
              tooltip="存在 _config.yml 的主题数量"
            />
            <StatCard
              title="可更新主题"
              value={themes.filter((t) => t.version === null).length}
              icon={<SyncOutlined />}
              iconColor="#fa8c16"
              tooltip="无法读取版本号的主题，可能需要手动更新"
            />
          </StatGrid>

          <Row gutter={16}>
            {/* 已安装主题 */}
            <Col xs={24} lg={15}>
              <Card
                size="small"
                title="已安装主题"
                extra={
                  <Input
                    size="small"
                    allowClear
                    prefix={<SearchOutlined className="opacity-50" />}
                    placeholder="搜索主题"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    style={{ width: 180 }}
                  />
                }
                styles={{ body: { padding: 16 } }}
              >
                {loading && themes.length === 0 ? (
                  <SkeletonGrid rows={1} columns={2} itemHeight={120} />
                ) : filteredThemes.length === 0 ? (
                  <EmptyState
                    kind={keyword ? 'search' : 'themes'}
                    compact
                    title={keyword ? '没有匹配的主题' : undefined}
                    actionText={keyword ? undefined : '安装主题'}
                    onAction={keyword ? undefined : () => setInstallOpen(true)}
                    onRefresh={keyword ? () => setKeyword('') : undefined}
                  />
                ) : (
                  <div
                    className="grid gap-3"
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
                  >
                    {filteredThemes.map((theme) => {
                      const [from, to] = gradientFromString(theme.name);
                      return (
                        <div
                          key={theme.name}
                          className={`hm-surface flex flex-col overflow-hidden ${
                            theme.isActive ? 'ring-2 ring-brand-500' : ''
                          }`}
                        >
                          <div
                            className="flex h-16 items-center justify-between px-3"
                            style={{ background: `linear-gradient(120deg, ${from}, ${to})` }}
                          >
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/25 text-sm font-semibold text-white backdrop-blur">
                              {initialsOf(theme.name)}
                            </span>
                            {theme.isActive ? (
                              <Tag color="white" className="m-0 text-brand-600">
                                使用中
                              </Tag>
                            ) : null}
                          </div>

                          <div className="flex flex-1 flex-col p-3">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium" title={theme.name}>
                                {theme.name}
                              </span>
                              {theme.version ? (
                                <Tag className="m-0" style={{ fontSize: 11 }}>
                                  v{theme.version}
                                </Tag>
                              ) : null}
                            </div>

                            <p className="mt-1 mb-0 line-clamp-2 flex-1 text-xs hm-text-secondary">
                              {theme.description || `${theme.author ?? '未知作者'} 开发的主题`}
                            </p>

                            <div className="mt-2 text-[11px] hm-text-secondary">
                              {theme.installedAt
                                ? `安装于 ${formatRelative(theme.installedAt)}`
                                : '本地主题'}
                            </div>

                            <div className="mt-2 flex items-center justify-between gap-1">
                              <Space size={2}>
                                <Tooltip title="编辑主题配置">
                                  <Button
                                    size="small"
                                    type="text"
                                    icon={<SettingOutlined />}
                                    onClick={() => handleOpenConfig(theme)}
                                    disabled={!hasConfig(theme)}
                                  />
                                </Tooltip>
                                {theme.repo ? (
                                  <Tooltip title="打开仓库">
                                    <Button
                                      size="small"
                                      type="text"
                                      icon={<ExportOutlined />}
                                      onClick={() => void openWithSystem(theme.repo as string)}
                                    />
                                  </Tooltip>
                                ) : null}
                                <Tooltip title="更新主题">
                                  <Button
                                    size="small"
                                    type="text"
                                    icon={<SyncOutlined />}
                                    loading={busy}
                                    onClick={() => void update(theme)}
                                  />
                                </Tooltip>
                                <Tooltip title="卸载">
                                  <Button
                                    size="small"
                                    type="text"
                                    danger
                                    icon={<DeleteOutlined />}
                                    onClick={() => handleUninstall(theme)}
                                    disabled={theme.isActive}
                                  />
                                </Tooltip>
                              </Space>

                              <Button
                                size="small"
                                type={theme.isActive ? 'default' : 'primary'}
                                ghost={!theme.isActive}
                                onClick={() => handleSwitch(theme)}
                                disabled={theme.isActive}
                              >
                                {theme.isActive ? '使用中' : '启用'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </Col>

            {/* 主题市场 */}
            <Col xs={24} lg={9}>
              <Card
                size="small"
                title="主题市场"
                extra={
                  <Button
                    size="small"
                    type="text"
                    icon={<ReloadOutlined />}
                    onClick={() => void search(marketKeyword || undefined)}
                  />
                }
                styles={{ body: { padding: 0, maxHeight: 620, overflow: 'auto' } }}
              >
                <div className="p-3">
                  <Input
                    size="small"
                    allowClear
                    prefix={<SearchOutlined className="opacity-50" />}
                    placeholder="搜索主题市场"
                    value={marketKeyword}
                    onChange={(e) => setMarketKeyword(e.target.value)}
                    onPressEnter={() => void search(marketKeyword || undefined)}
                  />
                </div>

                {filteredMarket.length === 0 ? (
                  <EmptyState
                    kind={marketKeyword ? 'search' : 'themes'}
                    compact
                    title={marketKeyword ? '没有匹配结果' : '市场数据为空'}
                    description={
                      marketKeyword ? '换个关键词试试' : '可能需要网络连接才能获取主题市场数据'
                    }
                    onRefresh={() => void search(marketKeyword || undefined)}
                  />
                ) : (
                  <List
                    size="small"
                    dataSource={filteredMarket}
                    renderItem={(item) => {
                      const installed = themes.some((t) => t.name === item.name);
                      return (
                        <List.Item className="px-3">
                          <div className="w-full">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-medium">
                                {item.displayName ?? item.name}
                              </span>
                              {item.stars !== null ? (
                                <span className="flex shrink-0 items-center gap-0.5 text-xs hm-text-secondary">
                                  <StarOutlined className="text-amber-500" />
                                  {item.stars}
                                </span>
                              ) : null}
                            </div>

                            <p className="mt-0.5 mb-1 line-clamp-2 text-xs hm-text-secondary">
                              {item.description || '暂无描述'}
                            </p>

                            <div className="flex items-center justify-between">
                              <span className="text-[11px] hm-text-secondary">
                                {item.author ?? '未知作者'}
                              </span>
                              <Space size={4}>
                                {item.repo ? (
                                  <Button
                                    size="small"
                                    type="text"
                                    icon={<ExportOutlined />}
                                    onClick={() => void openWithSystem(item.repo as string)}
                                  />
                                ) : null}
                                <Button
                                  size="small"
                                  type={installed ? 'default' : 'primary'}
                                  ghost={!installed}
                                  disabled={installed}
                                  onClick={() => {
                                    setInstallName(item.npmName ?? item.name);
                                    setInstallSource(item.npmName ? 'npm' : 'git');
                                    setInstallOpen(true);
                                  }}
                                >
                                  {installed ? '已安装' : '安装'}
                                </Button>
                              </Space>
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
                message="主题来源说明"
                description={
                  <ul className="mt-1 mb-0 list-disc pl-4 text-xs leading-relaxed">
                    <li>npm 安装：执行 npm install 并复制到 themes 目录（推荐）</li>
                    <li>Git 克隆：直接从仓库地址克隆到 themes 目录</li>
                    <li>也可手动把主题文件夹放入 themes 目录后点击「刷新」</li>
                  </ul>
                }
              />
            </Col>
          </Row>
        </div>
      )}

      {/* 安装主题弹窗 */}
      <Modal
        open={installOpen}
        title="安装主题"
        onCancel={() => setInstallOpen(false)}
        onOk={() => void handleInstall()}
        confirmLoading={installing}
        okText="开始安装"
        cancelText="取消"
        width={560}
      >
        <div className="space-y-4 pt-2">
          <div>
            <div className="mb-2 text-sm">安装来源</div>
            <Radio.Group
              value={installSource}
              onChange={(e) => setInstallSource(e.target.value as 'npm' | 'git')}
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value="npm">npm 包（推荐）</Radio.Button>
              <Radio.Button value="git">Git 仓库</Radio.Button>
            </Radio.Group>
          </div>

          <div>
            <div className="mb-2 text-sm">
              {installSource === 'npm' ? 'npm 包名' : 'Git 仓库地址'}
            </div>
            <Input
              value={installName}
              onChange={(e) => setInstallName(e.target.value)}
              placeholder={
                installSource === 'npm'
                  ? 'hexo-theme-xxx'
                  : 'https://github.com/user/hexo-theme-xxx.git'
              }
              className="hm-mono"
              prefix={installSource === 'npm' ? <AppstoreOutlined /> : <GlobalOutlined />}
              allowClear
            />
          </div>

          <Alert
            type="warning"
            showIcon
            message="安装过程可能较慢"
            description="需要从网络下载主题文件，请确保网络连接正常。安装完成后会自动刷新主题列表。"
          />

          {/* 已安装主题快速选择 */}
          {themes.length > 0 ? (
            <div>
              <div className="mb-1.5 text-xs hm-text-secondary">已安装（通常无需重复安装）</div>
              <Space size={4} wrap>
                {themes.map((theme) => (
                  <Tag key={theme.name} className="m-0 hm-mono" style={{ fontSize: 11 }}>
                    {theme.name}
                  </Tag>
                ))}
              </Space>
            </div>
          ) : null}
        </div>
      </Modal>

      {/* 主题配置抽屉 */}
      <Drawer
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        title={`主题配置 · ${configTheme ?? ''}`}
        width={720}
        extra={
          <Space>
            <Button
              size="small"
              icon={<UndoOutlined />}
              onClick={() => setDraftRaw(themeRaw)}
              disabled={draftRaw === themeRaw}
            >
              还原
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<SaveOutlined />}
              loading={configSaving}
              onClick={() => void handleSaveConfig()}
              disabled={draftRaw === themeRaw || Boolean(yamlError)}
            >
              保存
            </Button>
          </Space>
        }
      >
        {configLoading ? (
          <div className="flex justify-center py-16">
            <Spin />
          </div>
        ) : themeRaw ? (
          <div className="flex h-full flex-col">
            {yamlError ? (
              <Alert
                className="mb-3"
                type="error"
                showIcon
                message="YAML 语法错误"
                description={<span className="hm-mono text-xs break-all">{yamlError}</span>}
              />
            ) : (
              <Alert
                className="mb-3"
                type="success"
                showIcon
                message="主题配置文件"
                description={`编辑 themes/${configTheme}/_config.yml，保存后重新生成站点生效`}
              />
            )}

            <CodeEditor
              value={draftRaw}
              onChange={setDraftRaw}
              language="yaml"
              height="calc(100vh - 260px)"
            />
          </div>
        ) : themeConfigError ? (
          <div className="flex h-full flex-col">
            <Alert
              type="error"
              showIcon
              message="主题配置加载失败"
              description={
                <div className="space-y-2">
                  <div className="hm-mono text-xs break-all">{themeConfigError}</div>
                  <div className="text-xs hm-text-secondary">
                    已尝试查找 themes/{configTheme}/_config.yml、_config.{configTheme}.yml 与
                    themes/{configTheme}/_config.yaml。若主题确实无独立配置文件，可改用站点
                    _config.yml 的 theme_config 段。
                  </div>
                </div>
              }
              action={
                <Space direction="vertical">
                  <Button size="small" onClick={() => void reloadThemeConfig()}>
                    重试
                  </Button>
                  <Button
                    size="small"
                    type="link"
                    onClick={() =>
                      void openWithSystem(
                        `${currentSite?.path ?? ''}/themes/${configTheme ?? ''}`,
                      )
                    }
                  >
                    打开目录
                  </Button>
                </Space>
              }
            />
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div className="text-sm hm-text-secondary">
                该主题没有独立的 _config.yml
                <div className="mt-1 text-xs">
                  部分主题的配置直接写在站点 _config.yml 的 theme_config 中
                </div>
              </div>
            }
          >
            <Space direction="vertical">
              <Button onClick={() => void reloadThemeConfig()}>重新加载</Button>
              <Button
                onClick={() =>
                  void openWithSystem(`${currentSite?.path ?? ''}/themes/${configTheme ?? ''}`)
                }
              >
                打开主题目录
              </Button>
            </Space>
          </Empty>
        )}
      </Drawer>

      {/* 当前主题信息 */}
      {active ? (
        <Card size="small" title="当前主题详情" className="mt-4">
          <Descriptions
            size="small"
            column={3}
            items={[
              { key: 'name', label: '主题名称', children: active.name },
              { key: 'version', label: '版本', children: active.version ?? '未知' },
              { key: 'author', label: '作者', children: active.author ?? '未知' },
              {
                key: 'path',
                label: '主题路径',
                span: 2,
                children: <span className="hm-mono text-xs break-all">{active.path}</span>,
              },
              {
                key: 'config',
                label: '独立配置',
                children: active.hasConfig ? (
                  <Tag color="green" className="m-0">
                    有
                  </Tag>
                ) : (
                  <Tag className="m-0">无</Tag>
                ),
              },
            ]}
          />

          <div className="mt-3">
            <Segmented
              options={[
                { label: '打开主题目录', value: 'dir', icon: <EyeOutlined /> },
                ...(active.repo
                  ? [{ label: '访问仓库', value: 'repo', icon: <ExportOutlined /> }]
                  : []),
              ]}
              onChange={(value) => {
                if (value === 'dir') void openWithSystem(active.path);
                else if (value === 'repo' && active.repo) void openWithSystem(active.repo);
              }}
            />
          </div>
        </Card>
      ) : null}
    </PageContainer>
  );
}

export default ThemesPage;
