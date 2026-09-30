/** 偏好设置：外观、编辑体验、默认值与更新策略 */

import { useState } from 'react';
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Col,
  Descriptions,
  Row,
  Space,
  Tabs,
  Tag,
} from 'antd';
import {
  BgColorsOutlined,
  CopyOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderOpenOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  SettingOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { PageContainer, SettingsPanel } from '@/components';
import { useUiStore } from '@/stores';
import { APP_META } from '@/constants';
import { copyToClipboard, openWithSystem } from '@/utils/desktop';

/** 本地存储键前缀 */
const STORAGE_PREFIX = 'hexo-manager:';

/** 列出所有本地存储项 */
function listLocalStorage(): { key: string; size: number }[] {
  const result: { key: string; size: number }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
      result.push({ key, size: (localStorage.getItem(key) ?? '').length });
    }
  } catch {
    // localStorage 不可用时返回空列表
  }
  return result.sort((a, b) => a.key.localeCompare(b.key));
}

/** 偏好设置页面 */
export function SettingsPage() {
  const { message } = AntdApp.useApp();
  const [activeTab, setActiveTab] = useState('preferences');
  const [storageKeys, setStorageKeys] = useState(() => listLocalStorage());

  const isDark = useUiStore((s) => s.isDark);
  const themeMode = useUiStore((s) => s.themeMode);
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);

  const totalSize = storageKeys.reduce((sum, item) => sum + item.size, 0);

  const handleClearStorage = () => {
    storageKeys.forEach((item) => {
      try {
        localStorage.removeItem(item.key);
      } catch {
        // 忽略
      }
    });
    setStorageKeys(listLocalStorage());
    message.success('已清除本地偏好数据，刷新页面后生效');
  };

  return (
    <PageContainer
      title="偏好设置"
      description="界面外观、编辑体验与应用默认行为，设置保存在本机"
      card={false}
      flush
      extra={
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setStorageKeys(listLocalStorage());
              message.success('已刷新本地数据列表');
            }}
          >
            刷新
          </Button>
          <Button
            type="primary"
            icon={<SettingOutlined />}
            onClick={() => message.info('设置已自动保存到本机，无需手动提交')}
          >
            保存说明
          </Button>
        </Space>
      }
    >
      <div className="space-y-4">
        <Row gutter={16}>
          <Col xs={24} lg={16}>
            <Card>
              <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                  {
                    key: 'preferences',
                    label: (
                      <span>
                        <ToolOutlined /> 偏好设置
                      </span>
                    ),
                    children: <SettingsPanel />,
                  },
                  {
                    key: 'storage',
                    label: (
                      <span>
                        <DatabaseOutlined /> 本地数据
                      </span>
                    ),
                    children: (
                      <div className="max-w-3xl space-y-4">
                        <Alert
                          type="info"
                          showIcon
                          message="本地数据说明"
                          description={
                            <div className="space-y-1 text-xs">
                              <div>
                                以下为保存在浏览器本地存储中的偏好项，仅记录界面选择与默认值，
                                不包含站点路径、文章内容等敏感信息。
                              </div>
                              <div>
                                站点与文章数据保存在本机 SQLite 数据库中，不受此处操作影响。
                              </div>
                            </div>
                          }
                        />

                        <Descriptions
                          size="small"
                          column={2}
                          bordered
                          items={[
                            {
                              key: 'count',
                              label: '偏好项数量',
                              children: storageKeys.length,
                            },
                            {
                              key: 'size',
                              label: '占用空间',
                              children: `${totalSize} 字符`,
                            },
                            {
                              key: 'theme',
                              label: '主题模式',
                              children: <Tag className="m-0">{themeMode}</Tag>,
                            },
                            {
                              key: 'dark',
                              label: '当前深色',
                              children: (
                                <Tag className="m-0" color={isDark ? 'blue' : 'default'}>
                                  {isDark ? '深色' : '浅色'}
                                </Tag>
                              ),
                            },
                            {
                              key: 'sidebar',
                              label: '侧栏状态',
                              children: sidebarCollapsed ? '已折叠' : '展开',
                            },
                            {
                              key: 'version',
                              label: '应用版本',
                              children: <span className="hm-mono">{APP_META.version}</span>,
                            },
                          ]}
                        />

                        <div>
                          <div className="mb-2 text-sm font-medium">已存储的键</div>
                          {storageKeys.length === 0 ? (
                            <div className="text-xs hm-text-secondary">暂无本地偏好数据</div>
                          ) : (
                            <div className="space-y-1">
                              {storageKeys.map((item) => (
                                <div
                                  key={item.key}
                                  className="flex items-center justify-between rounded border px-3 py-1.5"
                                  style={{ borderColor: 'var(--hm-border)' }}
                                >
                                  <span className="hm-mono truncate text-xs">{item.key}</span>
                                  <Space size={4}>
                                    <span className="text-xs hm-text-secondary">
                                      {item.size} 字符
                                    </span>
                                    <TooltipCopy
                                      onCopy={() => {
                                        void copyToClipboard(item.key).then((ok) =>
                                          ok ? message.success('键名已复制') : undefined,
                                        );
                                      }}
                                    />
                                  </Space>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <Space>
                          <Button
                            danger
                            icon={<DeleteOutlined />}
                            onClick={handleClearStorage}
                            disabled={storageKeys.length === 0}
                          >
                            清除全部本地偏好
                          </Button>
                          <Button
                            icon={<FolderOpenOutlined />}
                            onClick={() => void openWithSystem('.')}
                          >
                            打开工作目录
                          </Button>
                        </Space>
                      </div>
                    ),
                  },
                  {
                    key: 'guide',
                    label: (
                      <span>
                        <InfoCircleOutlined /> 使用说明
                      </span>
                    ),
                    children: (
                      <div className="max-w-3xl space-y-4">
                        <Card size="small" title="推荐的首次使用流程">
                          <ol className="m-0 list-decimal pl-5 text-sm leading-relaxed">
                            <li>在「站点管理」中创建新站点，或导入本地已有的 Hexo 站点目录</li>
                            <li>进入「配置管理」确认 _config.yml 的站点信息与部署配置</li>
                            <li>在「主题管理」安装主题，在「插件管理」补齐常用插件</li>
                            <li>在「本地预览」启动 hexo server，实时查看效果</li>
                            <li>在「部署配置」选择目标平台，一键生成 CI/CD 配置文件</li>
                            <li>在「Git 操作」提交并推送代码，触发流水线完成上线</li>
                            <li>后续写作只需在「文章管理」编辑内容，然后一键部署</li>
                          </ol>
                        </Card>

                        <Card size="small" title="环境要求">
                          <Descriptions
                            size="small"
                            column={1}
                            items={[
                              {
                                key: 'node',
                                label: 'Node.js',
                                children: (
                                  <span>
                                    <span className="hm-mono">18 / 20 / 22</span>
                                    <span className="ml-2 text-xs hm-text-secondary">
                                      用于运行 hexo 命令
                                    </span>
                                  </span>
                                ),
                              },
                              {
                                key: 'git',
                                label: 'Git',
                                children: (
                                  <span>
                                    <span className="hm-mono">2.30+</span>
                                    <span className="ml-2 text-xs hm-text-secondary">
                                      用于版本管理与部署
                                    </span>
                                  </span>
                                ),
                              },
                              {
                                key: 'hexo',
                                label: 'Hexo CLI',
                                children: (
                                  <span>
                                    <span className="hm-mono">局部或全局安装</span>
                                    <span className="ml-2 text-xs hm-text-secondary">
                                      建议在站点目录内局部安装
                                    </span>
                                  </span>
                                ),
                              },
                            ]}
                          />
                        </Card>

                        <Alert
                          type="warning"
                          showIcon
                          message="注意事项"
                          description={
                            <ul className="mt-1 mb-0 list-disc pl-4 text-xs leading-relaxed">
                              <li>本工具直接读写站点目录，操作前建议先提交一次代码以便回滚</li>
                              <li>「放弃改动」与「回滚」均为不可逆操作，请谨慎使用</li>
                              <li>生成的 CI 配置文件会覆盖同名文件，写入前会自动备份</li>
                            </ul>
                          }
                        />
                      </div>
                    ),
                  },
                ]}
              />
            </Card>
          </Col>

          <Col xs={24} lg={8}>
            <Card
              size="small"
              title={
                <Space>
                  <BgColorsOutlined />
                  <span>当前状态</span>
                </Space>
              }
            >
              <Descriptions
                size="small"
                column={1}
                items={[
                  {
                    key: 'theme',
                    label: '主题',
                    children: (
                      <Tag className="m-0" color="blue">
                        {themeMode === 'system'
                          ? '跟随系统'
                          : themeMode === 'dark'
                            ? '深色'
                            : '浅色'}
                      </Tag>
                    ),
                  },
                  {
                    key: 'sidebar',
                    label: '侧栏',
                    children: sidebarCollapsed ? '已折叠' : '展开',
                  },
                  {
                    key: 'storage',
                    label: '本地偏好',
                    children: `${storageKeys.length} 项`,
                  },
                  {
                    key: 'app',
                    label: '应用版本',
                    children: <span className="hm-mono">{APP_META.version}</span>,
                  },
                ]}
              />
            </Card>

            <Card
              size="small"
              title={
                <Space>
                  <EditOutlined />
                  <span>快捷提示</span>
                </Space>
              }
              className="mt-4"
            >
              <div className="space-y-2 text-xs hm-text-secondary">
                <div className="flex justify-between gap-2">
                  <span>保存文章</span>
                  <span className="hm-mono">Ctrl / Cmd + S</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>切换侧栏</span>
                  <span className="hm-mono">点击顶栏折叠按钮</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>切换明暗</span>
                  <span className="hm-mono">顶栏主题按钮</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>快速切换站点</span>
                  <span className="hm-mono">顶栏站点选择器</span>
                </div>
              </div>
            </Card>
          </Col>
        </Row>
      </div>
    </PageContainer>
  );
}

/** 复制按钮（内部小工具） */
function TooltipCopy({ onCopy }: { onCopy: () => void }) {
  return <Button type="text" size="small" icon={<CopyOutlined />} onClick={onCopy} />;
}

export default SettingsPage;
