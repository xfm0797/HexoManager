/** 关于与更新：应用信息、技术栈、检查更新与更新日志 */

import { useEffect, useState } from 'react';
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Empty,
  Progress,
  Row,
  Space,
  Steps,
  Switch,
  Table,
  Tabs,
  Tag,
  Timeline,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ApiOutlined,
  BugOutlined,
  CloudDownloadOutlined,
  CoffeeOutlined,
  ExportOutlined,
  GithubOutlined,
  HeartOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  ReloadOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { CodeBlock, PageContainer } from '@/components';
import { useUpdate, useUpdateConfig } from '@/hooks';
import { APP_META } from '@/constants';
import { useI18n } from '@/i18n';
import type { Changelog, TechItem } from '@/types';
import { formatDateTime } from '@/utils/format';

/**
 * 技术栈分组展示顺序。
 * 必须与后端 `src-tauri/src/update/check.rs` 里的 `layer` 取值逐一对应，
 * 否则 indexOf 返回 -1，该分组会被排到最前面且顺序错乱。
 */
const LAYER_ORDER = [
  '前端框架',
  '前端路由',
  'UI 组件库',
  '样式方案',
  '构建工具',
  '状态管理',
  '代码编辑器',
  '桌面框架',
  '开发语言',
  '后端语言',
  '模板引擎',
  '本地数据库',
];

/** 开源许可清单 */
const LICENSES = [
  { name: 'Tauri', version: '2.x', license: 'MIT / Apache-2.0', url: 'https://tauri.app' },
  { name: 'React', version: '18.3.1', license: 'MIT', url: 'https://react.dev' },
  { name: 'Ant Design', version: '5.29.x', license: 'MIT', url: 'https://ant.design' },
  { name: 'Tailwind CSS', version: '3.4.x', license: 'MIT', url: 'https://tailwindcss.com' },
  { name: 'Zustand', version: '4.5.x', license: 'MIT', url: 'https://zustand-demo.pmnd.rs' },
  {
    name: 'Monaco Editor',
    version: '0.5x',
    license: 'MIT',
    url: 'https://microsoft.github.io/monaco-editor/',
  },
  {
    name: 'rusqlite',
    version: '0.32',
    license: 'MIT',
    url: 'https://github.com/rusqlite/rusqlite',
  },
  { name: 'Handlebars', version: '6.x', license: 'MIT', url: 'https://handlebarsjs.com' },
  { name: 'Hexo', version: '7.x', license: 'MIT', url: 'https://hexo.io' },
];

/** 关于与更新页面 */
export function UpdatesPage() {
  const { message } = AntdApp.useApp();
  const { t } = useI18n();
  const { config } = useUpdateConfig();

  const {
    appInfo,
    settings,
    updateInfo,
    changelog,
    checking,
    downloading,
    progress,
    downloadResult,
    check,
    download,
    install,
    skipVersion,
    openExternal,
    toggleAutoCheck,
    refreshChangelog,
  } = useUpdate();

  const [activeTab, setActiveTab] = useState('about');

  /** 首次进入页面时拉取更新日志 */
  useEffect(() => {
    void refreshChangelog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 按层级聚合技术栈 */
  const techGroups = (() => {
    const source = appInfo?.techStack ?? [];
    const map = new Map<string, TechItem[]>();
    source.forEach((item) => {
      const list = map.get(item.layer) ?? [];
      list.push(item);
      map.set(item.layer, list);
    });
    const entries = Array.from(map.entries());
    entries.sort((a, b) => {
      const ai = LAYER_ORDER.indexOf(a[0]);
      const bi = LAYER_ORDER.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    return entries;
  })();

  const techColumns: ColumnsType<TechItem> = [
    {
      title: t('组件'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <span
          className="cursor-pointer hover:underline"
          onClick={() => void openExternal(record.url)}
        >
          {name}
        </span>
      ),
    },
    {
      title: t('版本'),
      dataIndex: 'version',
      key: 'version',
      width: 110,
      render: (version: string) => <span className="hm-mono text-xs">{version}</span>,
    },
    {
      title: t('层级'),
      dataIndex: 'layer',
      key: 'layer',
      width: 110,
      render: (layer: string) => (
        <Tag className="m-0" color="blue">
          {t(layer)}
        </Tag>
      ),
    },
    {
      title: t('主页'),
      key: 'url',
      width: 80,
      render: (_v, record) => (
        <Tooltip title={record.url}>
          <Button
            type="text"
            size="small"
            icon={<LinkOutlined />}
            onClick={() => void openExternal(record.url)}
          />
        </Tooltip>
      ),
    },
  ];

  const licenseColumns: ColumnsType<(typeof LICENSES)[number]> = [
    { title: t('依赖'), dataIndex: 'name', key: 'name' },
    {
      title: t('版本'),
      dataIndex: 'version',
      key: 'version',
      width: 110,
      render: (version: string) => <span className="hm-mono text-xs">{version}</span>,
    },
    {
      title: t('许可协议'),
      dataIndex: 'license',
      key: 'license',
      width: 160,
      render: (license: string) => <Tag className="m-0">{license}</Tag>,
    },
    {
      title: t('仓库'),
      key: 'url',
      width: 80,
      render: (_v, record) => (
        <Tooltip title={record.url}>
          <Button
            type="text"
            size="small"
            icon={<GithubOutlined />}
            onClick={() => void openExternal(record.url)}
          />
        </Tooltip>
      ),
    },
  ];

  const version = appInfo?.version ?? APP_META.version;
  const hasUpdate = updateInfo?.available === true;
  const isSkipped = hasUpdate && updateInfo?.latestVersion === settings.skipVersion;

  return (
    <PageContainer
      title={t('关于与更新')}
      description={
        <span>
          {APP_META.name} v{version} · {t(APP_META.description)}
        </span>
      }
      card={false}
      flush
      badge={
        hasUpdate ? (
          <Tag color="orange" className="m-0" icon={<RocketOutlined />}>
            {t('有新版本')}
          </Tag>
        ) : (
          <Tag color="green" className="m-0">
            {t('已是最新')}
          </Tag>
        )
      }
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} loading={checking} onClick={() => void check(false)}>
            {t('检查更新')}
          </Button>
          {hasUpdate && updateInfo?.downloadUrl ? (
            <Button
              type="primary"
              icon={<CloudDownloadOutlined />}
              loading={downloading}
              onClick={() => void download(updateInfo.downloadUrl as string)}
            >
              {t('下载更新')}
            </Button>
          ) : null}
        </Space>
      }
    >
      <div className="space-y-4">
        {/* 顶部品牌卡 */}
        <Card styles={{ body: { padding: 20 } }}>
          <div className="flex flex-wrap items-center gap-5">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #3366ff 0%, #722ed1 100%)' }}
            >
              HM
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold">{appInfo?.name ?? APP_META.name}</span>
                <Tag color="blue" className="m-0 hm-mono">
                  v{version}
                </Tag>
                <Tag className="m-0">{appInfo?.license ?? APP_META.license}</Tag>
              </div>
              <div className="mt-1 text-sm hm-text-secondary">
                {t(appInfo?.description ?? APP_META.description)}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs hm-text-secondary">
                <span>
                  {t('作者：{author}', { author: appInfo?.author ?? APP_META.author })}
                </span>
                <span>
                  {t('构建时间：{time}', { time: formatDateTime(appInfo?.buildDate ?? null) })}
                </span>
                <span>{t('Tauri：{version}', { version: appInfo?.tauriVersion ?? '2.x' })}</span>
              </div>
            </div>

            <Space direction="vertical" size={6}>
              <Button
                block
                icon={<GithubOutlined />}
                onClick={() => void openExternal(appInfo?.repository ?? APP_META.repository)}
              >
                {t('项目仓库')}
              </Button>
              <Button
                block
                icon={<LinkOutlined />}
                onClick={() => void openExternal(appInfo?.homepage ?? APP_META.homepage)}
              >
                {t('项目主页')}
              </Button>
            </Space>
          </div>
        </Card>

        {/* 更新状态 */}
        {hasUpdate ? (
          <Alert
            type={isSkipped ? 'info' : 'success'}
            showIcon
            icon={<RocketOutlined />}
            message={
              <span>
                {t('发现新版本')} <span className="hm-mono">{updateInfo?.latestVersion}</span>
                {isSkipped ? t('（已忽略该版本）') : ''}
              </span>
            }
            description={
              <div className="space-y-2">
                <div className="text-xs">
                  {t('当前版本 {version} · 发布时间 {time}', {
                    version: updateInfo?.currentVersion ?? '',
                    time: formatDateTime(updateInfo?.pubDate ?? null),
                  })}
                </div>
                {updateInfo?.notes ? (
                  <div className="whitespace-pre-wrap text-xs leading-relaxed">
                    {updateInfo.notes}
                  </div>
                ) : null}
                <Space wrap>
                  {updateInfo?.downloadUrl ? (
                    <Button
                      size="small"
                      type="primary"
                      icon={<CloudDownloadOutlined />}
                      loading={downloading}
                      onClick={() => void download(updateInfo.downloadUrl as string)}
                    >
                      {t('下载更新包')}
                    </Button>
                  ) : null}
                  {isSkipped ? (
                    <Button size="small" onClick={() => void skipVersion('')}>
                      {t('取消忽略')}
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      onClick={() => {
                        void skipVersion(updateInfo?.latestVersion ?? '');
                        message.success(t('已忽略该版本'));
                      }}
                    >
                      {t('忽略此版本')}
                    </Button>
                  )}
                </Space>
              </div>
            }
          />
        ) : updateInfo?.error ? (
          <Alert
            type="warning"
            showIcon
            message={t('检查更新失败')}
            description={
              <div className="space-y-2">
                <div className="hm-mono text-xs">{updateInfo.error}</div>
                <div className="text-xs">
                  {t('可能是网络受限导致。可稍后重试，或前往项目仓库手动下载最新版本。')}
                </div>
              </div>
            }
            action={
              <Button size="small" onClick={() => void check(false)} loading={checking}>
                {t('重试')}
              </Button>
            }
          />
        ) : (
          <Alert
            type="success"
            showIcon
            message={t('当前已是最新版本')}
            description={
              <span className="text-xs">
                {t('当前版本')}{' '}
                <span className="hm-mono">{updateInfo?.currentVersion ?? version}</span>
                {settings.lastCheckAt
                  ? t(' · 上次检查于 {time}', {
                      time: formatDateTime(settings.lastCheckAt),
                    })
                  : ''}
              </span>
            }
          />
        )}

        {/* 下载进度 */}
        {downloading || downloadResult ? (
          <Card size="small" title={t('更新包下载')}>
            {downloading ? (
              <Progress percent={progress} status="active" />
            ) : (
              <div className="space-y-2">
                <Alert
                  type="success"
                  showIcon
                  message={t('更新包已下载完成')}
                  description={
                    <div className="text-xs">
                      {t('保存位置：')}
                      <span className="hm-mono break-all">{downloadResult?.path}</span>
                    </div>
                  }
                />
                <Space>
                  <Button
                    type="primary"
                    icon={<ExportOutlined />}
                    onClick={() => (downloadResult ? void install(downloadResult.path) : undefined)}
                  >
                    {t('安装更新')}
                  </Button>
                  <Button
                    onClick={() =>
                      downloadResult
                        ? void import('@/utils/desktop').then((m) =>
                            m.openWithSystem(downloadResult.path),
                          )
                        : undefined
                    }
                  >
                    {t('在文件夹中显示')}
                  </Button>
                </Space>
              </div>
            )}
          </Card>
        ) : null}

        {/* 主体 Tab */}
        <Card styles={{ body: { paddingTop: 8 } }}>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: 'about',
                label: (
                  <span>
                    <InfoCircleOutlined /> {t('软件信息')}
                  </span>
                ),
                children: (
                  <div className="space-y-4">
                    <Row gutter={16}>
                      <Col xs={24} lg={12}>
                        <Descriptions
                          size="small"
                          column={1}
                          bordered
                          title={t('基本信息')}
                          items={[
                            {
                              key: 'name',
                              label: t('软件名称'),
                              children: appInfo?.name ?? APP_META.name,
                            },
                            {
                              key: 'version',
                              label: t('当前版本'),
                              children: <span className="hm-mono">{version}</span>,
                            },
                            {
                              key: 'tauri',
                              label: t('Tauri 版本'),
                              children: (
                                <span className="hm-mono">{appInfo?.tauriVersion ?? '2.x'}</span>
                              ),
                            },
                            {
                              key: 'build',
                              label: t('构建时间'),
                              children: formatDateTime(appInfo?.buildDate ?? null),
                            },
                            {
                              key: 'author',
                              label: t('开发者'),
                              children: appInfo?.author ?? APP_META.author,
                            },
                            {
                              key: 'license',
                              label: t('开源许可'),
                              children: appInfo?.license ?? APP_META.license,
                            },
                          ]}
                        />
                      </Col>

                      <Col xs={24} lg={12}>
                        <Card size="small" title={t('核心能力')} className="h-full">
                          <div className="space-y-3">
                            {[
                              {
                                icon: <ApiOutlined />,
                                color: '#3366ff',
                                title: t('多站点统一管理'),
                                desc: t('同时维护多个 Hexo 站点，一键切换上下文'),
                              },
                              {
                                icon: <ThunderboltOutlined />,
                                color: '#fa8c16',
                                title: t('全流程自动化'),
                                desc: t('构建、提交、推送、部署一条链路完成'),
                              },
                              {
                                icon: <SafetyCertificateOutlined />,
                                color: '#52c41a',
                                title: t('配置生成器'),
                                desc: t('覆盖 7 大平台与边缘层回源策略的 CI 配置'),
                              },
                              {
                                icon: <CoffeeOutlined />,
                                color: '#722ed1',
                                title: t('本地优先'),
                                desc: t('所有数据存放于本机 SQLite，不上传云端'),
                              },
                            ].map((item) => (
                              <div key={item.title} className="flex items-start gap-3">
                                <span
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
                                  style={{ background: item.color }}
                                >
                                  {item.icon}
                                </span>
                                <div className="min-w-0">
                                  <div className="text-sm font-medium">{item.title}</div>
                                  <div className="text-xs hm-text-secondary">{item.desc}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </Card>
                      </Col>
                    </Row>

                    <Alert
                      type="info"
                      showIcon
                      message={t('数据存储位置')}
                      description={
                        <div className="space-y-1 text-xs">
                          <div>
                            {t('应用数据目录（数据库与配置）：')}
                            <span className="hm-mono">
                              {t('系统应用数据目录 / hexo-manager /')}
                            </span>
                          </div>
                          <div>
                            {t('数据库文件：')}
                            <span className="hm-mono">hexo-manager.db</span>
                            {t('（SQLite，WAL 模式）')}
                          </div>
                          <div>
                            {t('所有站点源码保持在其原始目录，本应用不会移动或复制你的站点文件')}
                          </div>
                        </div>
                      }
                    />
                  </div>
                ),
              },
              {
                key: 'tech',
                label: (
                  <span>
                    <ApiOutlined /> {t('技术栈')}
                  </span>
                ),
                children: (
                  <div className="space-y-4">
                    <Table
                      rowKey={(record) => `${record.layer}-${record.name}`}
                      size="small"
                      columns={techColumns}
                      dataSource={appInfo?.techStack ?? []}
                      pagination={false}
                      locale={{ emptyText: <Empty description={t('暂无技术栈信息')} /> }}
                    />

                    {techGroups.length > 0 ? (
                      <Card size="small" title={t('分层视图')}>
                        <div className="space-y-3">
                          {techGroups.map(([layer, items]) => (
                            <div key={layer} className="flex items-start gap-3">
                              <Tag color="blue" className="m-0 mt-0.5 shrink-0">
                                {t(layer)}
                              </Tag>
                              <div className="flex flex-wrap gap-1">
                                {items.map((item) => (
                                  <Tooltip key={item.name} title={`${item.name} ${item.version}`}>
                                    <Tag
                                      className="m-0 cursor-pointer hm-mono text-xs"
                                      onClick={() => void openExternal(item.url)}
                                    >
                                      {item.name}
                                    </Tag>
                                  </Tooltip>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    ) : null}
                  </div>
                ),
              },
              {
                key: 'changelog',
                label: (
                  <span>
                    <SyncOutlined /> {t('更新日志')}
                  </span>
                ),
                children: (
                  <div className="space-y-4">
                    {changelog.length === 0 ? (
                      <Empty description={t('暂无更新日志')} />
                    ) : (
                      <Timeline
                        items={changelog.map((item: Changelog, index) => ({
                          color: index === 0 ? 'blue' : 'gray',
                          children: (
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="hm-mono font-medium">v{item.version}</span>
                                <span className="text-xs hm-text-secondary">{item.date}</span>
                                {index === 0 ? (
                                  <Tag color="blue" className="m-0">
                                    {t('最新')}
                                  </Tag>
                                ) : null}
                              </div>
                              <ul className="mt-1.5 mb-0 list-disc pl-4 text-sm leading-relaxed">
                                {item.changes.map((change, i) => (
                                  <li key={`${item.version}-${i}`}>{change}</li>
                                ))}
                              </ul>
                            </div>
                          ),
                        }))}
                      />
                    )}

                    <Divider className="my-2" />
                    <div className="text-xs hm-text-secondary">
                      {t('更新日志来源于项目根目录的 CHANGELOG.md，遵循 Keep a Changelog 规范')}
                    </div>
                    <CodeBlock
                      language="markdown"
                      maxHeight={200}
                      code={`## [1.0.0] - 2025-01-01
### Added
- ${t('多站点创建、导入与切换')}
- ${t('文章可视化编辑与 Markdown 实时预览')}
- ${t('7 大平台 CI/CD 配置生成器')}
- ${t('边缘层回源策略配置（EdgeOne / Cloudflare）')}
- ${t('Git 操作面板与一键部署')}`}
                    />
                  </div>
                ),
              },
              {
                key: 'license',
                label: (
                  <span>
                    <SafetyCertificateOutlined /> {t('开源许可')}
                  </span>
                ),
                children: (
                  <div className="space-y-4">
                    <Table
                      rowKey="name"
                      size="small"
                      columns={licenseColumns}
                      dataSource={LICENSES}
                      pagination={false}
                    />

                    <Card size="small" title={t('许可证全文')}>
                      <CodeBlock
                        language="plaintext"
                        maxHeight={260}
                        code={`MIT License

Copyright (c) 2025 ${APP_META.author}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`}
                      />
                    </Card>
                  </div>
                ),
              },
              {
                key: 'update',
                label: (
                  <span>
                    <RocketOutlined /> {t('更新设置')}
                  </span>
                ),
                children: (
                  <div className="max-w-2xl space-y-4">
                    <div
                      className="flex items-center justify-between rounded-lg border p-3"
                      style={{ borderColor: 'var(--hm-border)' }}
                    >
                      <div>
                        <div className="text-sm font-medium">{t('启动时自动检查更新')}</div>
                        <div className="text-xs hm-text-secondary">
                          {t('应用启动后静默检查新版本，发现更新时在消息中心提示')}
                        </div>
                      </div>
                      <Switch
                        checked={settings.autoCheck}
                        onChange={(checked) => void toggleAutoCheck(checked)}
                      />
                    </div>

                    <Descriptions
                      size="small"
                      column={1}
                      bordered
                      title={t('更新状态')}
                      items={[
                        {
                          key: 'lastCheck',
                          label: t('上次检查时间'),
                          children: formatDateTime(settings.lastCheckAt),
                        },
                        {
                          key: 'lastVersion',
                          label: t('上次已知版本'),
                          children: settings.lastVersion ? (
                            <span className="hm-mono">{settings.lastVersion}</span>
                          ) : (
                            '—'
                          ),
                        },
                        {
                          key: 'skip',
                          label: t('已忽略版本'),
                          children: settings.skipVersion ? (
                            <Space>
                              <span className="hm-mono">{settings.skipVersion}</span>
                              <Button
                                type="link"
                                size="small"
                                className="!px-0"
                                onClick={() => void skipVersion('')}
                              >
                                {t('取消忽略')}
                              </Button>
                            </Space>
                          ) : (
                            t('未忽略任何版本')
                          ),
                        },
                        {
                          key: 'platform',
                          label: t('当前平台'),
                          children: config ? (
                            <span className="hm-mono text-xs">
                              {config.os}-{config.arch}
                            </span>
                          ) : (
                            '—'
                          ),
                        },
                      ]}
                    />

                    {/* 更新源链路 */}
                    <Card
                      size="small"
                      title={t('更新源链路')}
                      extra={
                        <span className="text-xs hm-text-secondary">
                          {t('按优先级依次尝试，第一个成功的源生效')}
                        </span>
                      }
                    >
                      <Steps
                        size="small"
                        direction="vertical"
                        current={-1}
                        items={(config?.endpoints ?? []).map((endpoint, index) => ({
                          key: endpoint,
                          title:
                            index === 0 ? t('首选源（Tauri updater 清单）') : t('备用源'),
                          description: (
                            <span
                              className="hm-mono cursor-pointer break-all text-xs hover:underline"
                              onClick={() => void openExternal(endpoint)}
                            >
                              {endpoint}
                            </span>
                          ),
                        }))}
                      />
                      {!config ? (
                        <div className="text-xs hm-text-secondary">
                          {t('更新源配置加载中，或当前环境（浏览器调试模式）不支持该命令')}
                        </div>
                      ) : null}
                    </Card>

                    <Space>
                      <Button
                        type="primary"
                        icon={<ReloadOutlined />}
                        loading={checking}
                        onClick={() => void check(false)}
                      >
                        {t('立即检查更新')}
                      </Button>
                      <Button
                        icon={<BugOutlined />}
                        onClick={() => void openExternal(`${APP_META.repository}/issues`)}
                      >
                        {t('反馈问题')}
                      </Button>
                    </Space>

                    <Alert
                      type="info"
                      showIcon
                      message={t('手动更新方式')}
                      description={
                        <div className="space-y-1 text-xs">
                          <div>{t('1. 点击「检查更新」获取最新版本信息与下载地址')}</div>
                          <div>
                            {t('2. 下载安装包后点击「安装更新」，应用将自动关闭并启动安装程序')}
                          </div>
                          <div>{t('3. 也可直接前往项目仓库的 Releases 页面手动下载')}</div>
                        </div>
                      }
                    />
                  </div>
                ),
              },
            ]}
          />
        </Card>

        <div className="flex items-center justify-center gap-1.5 pb-2 text-xs hm-text-secondary">
          <span>{t('用')}</span>
          <HeartOutlined className="text-red-400" />
          <span>
            {t('构建 · {name} v{version} · {license} License', {
              name: APP_META.name,
              version,
              license: APP_META.license,
            })}
          </span>
        </div>
      </div>
    </PageContainer>
  );
}

export default UpdatesPage;
