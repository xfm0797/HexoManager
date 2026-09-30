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
import { useUpdate } from '@/hooks';
import { APP_META } from '@/constants';
import type { Changelog, TechItem } from '@/types';
import { formatDateTime } from '@/utils/format';

/** 技术栈分组展示顺序 */
const LAYER_ORDER = [
  '前端框架',
  'UI 组件',
  '构建工具',
  '状态管理',
  '编辑器',
  '后端框架',
  '数据库',
  '模板引擎',
  '语言',
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
      title: '组件',
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
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 110,
      render: (version: string) => <span className="hm-mono text-xs">{version}</span>,
    },
    {
      title: '层级',
      dataIndex: 'layer',
      key: 'layer',
      width: 110,
      render: (layer: string) => (
        <Tag className="m-0" color="blue">
          {layer}
        </Tag>
      ),
    },
    {
      title: '主页',
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
    { title: '依赖', dataIndex: 'name', key: 'name' },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 110,
      render: (version: string) => <span className="hm-mono text-xs">{version}</span>,
    },
    {
      title: '许可协议',
      dataIndex: 'license',
      key: 'license',
      width: 160,
      render: (license: string) => <Tag className="m-0">{license}</Tag>,
    },
    {
      title: '仓库',
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
      title="关于与更新"
      description={
        <span>
          {APP_META.name} v{version} · {APP_META.description}
        </span>
      }
      card={false}
      flush
      badge={
        hasUpdate ? (
          <Tag color="orange" className="m-0" icon={<RocketOutlined />}>
            有新版本
          </Tag>
        ) : (
          <Tag color="green" className="m-0">
            已是最新
          </Tag>
        )
      }
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} loading={checking} onClick={() => void check(false)}>
            检查更新
          </Button>
          {hasUpdate && updateInfo?.downloadUrl ? (
            <Button
              type="primary"
              icon={<CloudDownloadOutlined />}
              loading={downloading}
              onClick={() => void download(updateInfo.downloadUrl as string)}
            >
              下载更新
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
                {appInfo?.description ?? APP_META.description}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs hm-text-secondary">
                <span>作者：{appInfo?.author ?? APP_META.author}</span>
                <span>构建时间：{formatDateTime(appInfo?.buildDate ?? null)}</span>
                <span>Tauri：{appInfo?.tauriVersion ?? '2.x'}</span>
              </div>
            </div>

            <Space direction="vertical" size={6}>
              <Button
                block
                icon={<GithubOutlined />}
                onClick={() => void openExternal(appInfo?.repository ?? APP_META.repository)}
              >
                项目仓库
              </Button>
              <Button
                block
                icon={<LinkOutlined />}
                onClick={() => void openExternal(appInfo?.homepage ?? APP_META.homepage)}
              >
                项目主页
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
                发现新版本 <span className="hm-mono">{updateInfo?.latestVersion}</span>
                {isSkipped ? '（已忽略该版本）' : ''}
              </span>
            }
            description={
              <div className="space-y-2">
                <div className="text-xs">
                  当前版本 {updateInfo?.currentVersion} · 发布时间{' '}
                  {formatDateTime(updateInfo?.pubDate ?? null)}
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
                      下载更新包
                    </Button>
                  ) : null}
                  {isSkipped ? (
                    <Button size="small" onClick={() => void skipVersion('')}>
                      取消忽略
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      onClick={() => {
                        void skipVersion(updateInfo?.latestVersion ?? '');
                        message.success('已忽略该版本');
                      }}
                    >
                      忽略此版本
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
            message="检查更新失败"
            description={
              <div className="space-y-2">
                <div className="hm-mono text-xs">{updateInfo.error}</div>
                <div className="text-xs">
                  可能是网络受限导致。可稍后重试，或前往项目仓库手动下载最新版本。
                </div>
              </div>
            }
            action={
              <Button size="small" onClick={() => void check(false)} loading={checking}>
                重试
              </Button>
            }
          />
        ) : (
          <Alert
            type="success"
            showIcon
            message="当前已是最新版本"
            description={
              <span className="text-xs">
                当前版本 <span className="hm-mono">{updateInfo?.currentVersion ?? version}</span>
                {settings.lastCheckAt
                  ? ` · 上次检查于 ${formatDateTime(settings.lastCheckAt)}`
                  : ''}
              </span>
            }
          />
        )}

        {/* 下载进度 */}
        {downloading || downloadResult ? (
          <Card size="small" title="更新包下载">
            {downloading ? (
              <Progress percent={progress} status="active" />
            ) : (
              <div className="space-y-2">
                <Alert
                  type="success"
                  showIcon
                  message="更新包已下载完成"
                  description={
                    <div className="text-xs">
                      保存位置：<span className="hm-mono break-all">{downloadResult?.path}</span>
                    </div>
                  }
                />
                <Space>
                  <Button
                    type="primary"
                    icon={<ExportOutlined />}
                    onClick={() => (downloadResult ? void install(downloadResult.path) : undefined)}
                  >
                    安装更新
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
                    在文件夹中显示
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
                    <InfoCircleOutlined /> 软件信息
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
                          title="基本信息"
                          items={[
                            {
                              key: 'name',
                              label: '软件名称',
                              children: appInfo?.name ?? APP_META.name,
                            },
                            {
                              key: 'version',
                              label: '当前版本',
                              children: <span className="hm-mono">{version}</span>,
                            },
                            {
                              key: 'tauri',
                              label: 'Tauri 版本',
                              children: (
                                <span className="hm-mono">{appInfo?.tauriVersion ?? '2.x'}</span>
                              ),
                            },
                            {
                              key: 'build',
                              label: '构建时间',
                              children: formatDateTime(appInfo?.buildDate ?? null),
                            },
                            {
                              key: 'author',
                              label: '开发者',
                              children: appInfo?.author ?? APP_META.author,
                            },
                            {
                              key: 'license',
                              label: '开源许可',
                              children: appInfo?.license ?? APP_META.license,
                            },
                          ]}
                        />
                      </Col>

                      <Col xs={24} lg={12}>
                        <Card size="small" title="核心能力" className="h-full">
                          <div className="space-y-3">
                            {[
                              {
                                icon: <ApiOutlined />,
                                color: '#3366ff',
                                title: '多站点统一管理',
                                desc: '同时维护多个 Hexo 站点，一键切换上下文',
                              },
                              {
                                icon: <ThunderboltOutlined />,
                                color: '#fa8c16',
                                title: '全流程自动化',
                                desc: '构建、提交、推送、部署一条链路完成',
                              },
                              {
                                icon: <SafetyCertificateOutlined />,
                                color: '#52c41a',
                                title: '配置生成器',
                                desc: '覆盖 7 大平台与边缘层回源策略的 CI 配置',
                              },
                              {
                                icon: <CoffeeOutlined />,
                                color: '#722ed1',
                                title: '本地优先',
                                desc: '所有数据存放于本机 SQLite，不上传云端',
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
                      message="数据存储位置"
                      description={
                        <div className="space-y-1 text-xs">
                          <div>
                            应用数据目录（数据库与配置）：
                            <span className="hm-mono">系统应用数据目录 / hexo-manager /</span>
                          </div>
                          <div>
                            数据库文件：
                            <span className="hm-mono">hexo-manager.db</span>（SQLite，WAL 模式）
                          </div>
                          <div>所有站点源码保持在其原始目录，本应用不会移动或复制你的站点文件</div>
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
                    <ApiOutlined /> 技术栈
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
                      locale={{ emptyText: <Empty description="暂无技术栈信息" /> }}
                    />

                    {techGroups.length > 0 ? (
                      <Card size="small" title="分层视图">
                        <div className="space-y-3">
                          {techGroups.map(([layer, items]) => (
                            <div key={layer} className="flex items-start gap-3">
                              <Tag color="blue" className="m-0 mt-0.5 shrink-0">
                                {layer}
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
                    <SyncOutlined /> 更新日志
                  </span>
                ),
                children: (
                  <div className="space-y-4">
                    {changelog.length === 0 ? (
                      <Empty description="暂无更新日志" />
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
                                    最新
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
                      更新日志来源于项目根目录的 CHANGELOG.md，遵循 Keep a Changelog 规范
                    </div>
                    <CodeBlock
                      language="markdown"
                      maxHeight={200}
                      code={`## [1.0.0] - 2025-01-01
### Added
- 多站点创建、导入与切换
- 文章可视化编辑与 Markdown 实时预览
- 7 大平台 CI/CD 配置生成器
- 边缘层回源策略配置（EdgeOne / Cloudflare）
- Git 操作面板与一键部署`}
                    />
                  </div>
                ),
              },
              {
                key: 'license',
                label: (
                  <span>
                    <SafetyCertificateOutlined /> 开源许可
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

                    <Card size="small" title="许可证全文">
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
                    <RocketOutlined /> 更新设置
                  </span>
                ),
                children: (
                  <div className="max-w-2xl space-y-4">
                    <div
                      className="flex items-center justify-between rounded-lg border p-3"
                      style={{ borderColor: 'var(--hm-border)' }}
                    >
                      <div>
                        <div className="text-sm font-medium">启动时自动检查更新</div>
                        <div className="text-xs hm-text-secondary">
                          应用启动后静默检查新版本，发现更新时在消息中心提示
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
                      title="更新状态"
                      items={[
                        {
                          key: 'lastCheck',
                          label: '上次检查时间',
                          children: formatDateTime(settings.lastCheckAt),
                        },
                        {
                          key: 'lastVersion',
                          label: '上次已知版本',
                          children: settings.lastVersion ? (
                            <span className="hm-mono">{settings.lastVersion}</span>
                          ) : (
                            '—'
                          ),
                        },
                        {
                          key: 'skip',
                          label: '已忽略版本',
                          children: settings.skipVersion ? (
                            <Space>
                              <span className="hm-mono">{settings.skipVersion}</span>
                              <Button
                                type="link"
                                size="small"
                                className="!px-0"
                                onClick={() => void skipVersion('')}
                              >
                                取消忽略
                              </Button>
                            </Space>
                          ) : (
                            '未忽略任何版本'
                          ),
                        },
                      ]}
                    />

                    <Space>
                      <Button
                        type="primary"
                        icon={<ReloadOutlined />}
                        loading={checking}
                        onClick={() => void check(false)}
                      >
                        立即检查更新
                      </Button>
                      <Button
                        icon={<BugOutlined />}
                        onClick={() => void openExternal(`${APP_META.repository}/issues`)}
                      >
                        反馈问题
                      </Button>
                    </Space>

                    <Alert
                      type="info"
                      showIcon
                      message="手动更新方式"
                      description={
                        <div className="space-y-1 text-xs">
                          <div>1. 点击「检查更新」获取最新版本信息与下载地址</div>
                          <div>2. 下载安装包后点击「安装更新」，应用将自动关闭并启动安装程序</div>
                          <div>3. 也可直接前往项目仓库的 Releases 页面手动下载</div>
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
          <span>用</span>
          <HeartOutlined className="text-red-400" />
          <span>
            构建 · {APP_META.name} v{version} · {APP_META.license} License
          </span>
        </div>
      </div>
    </PageContainer>
  );
}

export default UpdatesPage;
