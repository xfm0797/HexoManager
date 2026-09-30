/** 配置管理：可视化表单 + 原始 YAML 双向编辑 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Row,
  Segmented,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
  CodeOutlined,
  DiffOutlined,
  FormOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SaveOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { CodeEditor, EmptyState, FormField, FormSection, PageContainer } from '@/components';
import { useSiteConfig } from '@/hooks';
import { useConfigStore, useSiteStore } from '@/stores';
import type { SiteConfig } from '@/types';
import { parseYaml } from '@/utils/yaml';
import { pickSavePath, pickFile } from '@/utils/desktop';

/** 常用配置项定义（用于可视化分组表单） */
const CONFIG_GROUPS = [
  {
    key: 'basic',
    title: '基本信息',
    description: '站点的标题、副标题与描述，会展示在页面与搜索引擎结果中',
    fields: [
      { key: 'title', label: '站点标题', type: 'string', required: true },
      { key: 'subtitle', label: '副标题', type: 'string' },
      { key: 'description', label: '站点描述', type: 'text' },
      { key: 'keywords', label: '关键词', type: 'string', tooltip: '多个关键词用英文逗号分隔' },
      { key: 'author', label: '作者', type: 'string' },
      {
        key: 'language',
        label: '语言',
        type: 'select',
        options: ['zh-CN', 'zh-TW', 'en', 'ja', 'ko'],
      },
      { key: 'timezone', label: '时区', type: 'string', tooltip: '如 Asia/Shanghai' },
    ],
  },
  {
    key: 'url',
    title: '网址与链接',
    description: '站点地址与永久链接格式',
    fields: [
      { key: 'url', label: '站点网址', type: 'string', tooltip: '如 https://blog.example.com' },
      {
        key: 'root',
        label: '根路径',
        type: 'string',
        tooltip: '站点部署在子目录时填写，如 /blog/',
      },
      {
        key: 'permalink',
        label: '永久链接格式',
        type: 'string',
        tooltip: '如 :year/:month/:day/:title/',
      },
      { key: 'permalink_defaults', label: '永久链接默认值', type: 'object' },
      { key: 'pretty_urls', label: '美化 URL', type: 'object', tooltip: '去除链接中的 index.html' },
    ],
  },
  {
    key: 'dir',
    title: '目录',
    description: '各类内容的存放目录',
    fields: [
      { key: 'source_dir', label: '源文件目录', type: 'string' },
      { key: 'public_dir', label: '生成目录', type: 'string' },
      { key: 'tag_dir', label: '标签目录', type: 'string' },
      { key: 'archive_dir', label: '归档目录', type: 'string' },
      { key: 'category_dir', label: '分类目录', type: 'string' },
      { key: 'code_dir', label: '代码目录', type: 'string' },
      { key: 'i18n_dir', label: 'i18n 目录', type: 'string' },
      {
        key: 'skip_render',
        label: '跳过渲染',
        type: 'array',
        tooltip: '不参与渲染的路径，支持通配符',
      },
    ],
  },
  {
    key: 'writing',
    title: '写作',
    description: '新建文章的默认行为',
    fields: [
      { key: 'new_post_name', label: '新文章文件名', type: 'string', tooltip: '如 :title.md' },
      {
        key: 'default_layout',
        label: '默认布局',
        type: 'select',
        options: ['post', 'page', 'draft'],
      },
      { key: 'titlecase', label: '标题式大写', type: 'boolean' },
      { key: 'filename_case', label: '文件名大小写', type: 'select', options: ['0', '1', '2'] },
      { key: 'render_drafts', label: '渲染草稿', type: 'boolean' },
      {
        key: 'post_asset_folder',
        label: '文章资源文件夹',
        type: 'boolean',
        tooltip: '为每篇文章创建同名资源目录',
      },
      { key: 'relative_link', label: '相对链接', type: 'boolean' },
      { key: 'future', label: '显示未来文章', type: 'boolean' },
    ],
  },
  {
    key: 'category_tag',
    title: '分类与标签',
    description: '默认分类、映射规则',
    fields: [
      { key: 'default_category', label: '默认分类', type: 'string' },
      { key: 'category_map', label: '分类映射', type: 'object' },
      { key: 'tag_map', label: '标签映射', type: 'object' },
    ],
  },
  {
    key: 'date_time',
    title: '日期与时间',
    description: '日期时间格式化',
    fields: [
      { key: 'date_format', label: '日期格式', type: 'string' },
      { key: 'time_format', label: '时间格式', type: 'string' },
      { key: 'per_page', label: '每页文章数', type: 'number' },
      { key: 'pagination_dir', label: '分页目录', type: 'string' },
    ],
  },
  {
    key: 'extensions',
    title: '扩展',
    description: '主题与插件配置',
    fields: [
      { key: 'theme', label: '当前主题', type: 'string', required: true },
      { key: 'theme_config', label: '主题配置', type: 'object' },
      {
        key: 'deploy',
        label: '部署配置',
        type: 'object',
        tooltip: 'hexo deploy 的配置，通常由部署页面自动生成',
      },
      { key: 'feed', label: 'RSS 订阅', type: 'object' },
      { key: 'sitemap', label: '站点地图', type: 'object' },
      { key: 'search', label: '搜索', type: 'object' },
    ],
  },
] as const;

type ConfigGroupKey = (typeof CONFIG_GROUPS)[number]['key'];

/** 配置管理页面 */
export function ConfigPage() {
  const { message, modal } = AntdApp.useApp();

  const currentSiteId = useSiteStore((s) => s.currentSiteId);
  const currentSite = useSiteStore((s) => s.sites.find((site) => site.id === s.currentSiteId));

  const {
    config,
    raw,
    previewYaml,
    mode,
    loading,
    saving,
    dirty,
    setMode,
    patchConfig,
    setRaw,
    save,
    showDiff,
    restore,
    refresh,
  } = useSiteConfig(currentSiteId);

  const templates = useConfigStore((s) => s.templates);
  const fetchTemplates = useConfigStore((s) => s.fetchTemplates);
  const applyTemplate = useConfigStore((s) => s.applyTemplate);

  const [activeGroup, setActiveGroup] = useState<ConfigGroupKey>('basic');

  useEffect(() => {
    if (templates.length === 0) void fetchTemplates();
    // 仅首次加载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 原始模式下的 YAML 语法校验
  const yamlError = useMemo(() => {
    if (mode !== 'raw') return null;
    const { error } = parseYaml(raw);
    return error;
  }, [mode, raw]);

  const handleSave = async () => {
    if (mode === 'raw' && yamlError) {
      message.error('YAML 格式有误，请先修正后再保存');
      return;
    }
    await save();
  };

  const handleExport = async () => {
    if (currentSiteId === null) return;
    const target = await pickSavePath({
      title: '导出站点配置',
      defaultPath: '_config.yml',
      filters: [{ name: 'YAML', extensions: ['yml', 'yaml'] }],
    });
    if (!target) return;

    try {
      const exported = await import('@/services').then((m) =>
        m.configService.exportConfig(currentSiteId),
      );
      const { fileService } = await import('@/services');
      await fileService.write(target, exported);
      message.success(`配置已导出到 ${target}`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleImport = async () => {
    if (currentSiteId === null) return;
    const source = await pickFile({
      title: '选择要导入的配置文件',
      filters: [{ name: 'YAML', extensions: ['yml', 'yaml'] }],
    });
    if (!source) return;

    try {
      const { configService, fileService } = await import('@/services');
      const content = await fileService.read(source);
      await configService.importConfig(currentSiteId, content);
      await refresh();
      message.success('配置已导入');
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRestore = () => {
    modal.confirm({
      title: '恢复配置备份？',
      content: '将用最近一次备份覆盖当前 _config.yml，未保存的修改会丢失。',
      okText: '确认恢复',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => restore(),
    });
  };

  /** 渲染单个字段控件 */
  const renderField = (field: (typeof CONFIG_GROUPS)[number]['fields'][number]) => {
    const value = config[field.key as keyof SiteConfig];

    if (field.type === 'boolean') {
      return (
        <FormField
          key={field.key}
          name={field.key}
          label={field.label}
          tooltip={'tooltip' in field ? (field.tooltip as string | undefined) : undefined}
          valuePropName="checked"
        >
          <Switch
            checked={Boolean(value)}
            onChange={(checked) => patchConfig({ [field.key]: checked } as Partial<SiteConfig>)}
          />
        </FormField>
      );
    }

    if (field.type === 'number') {
      return (
        <FormField
          key={field.key}
          name={field.key}
          label={field.label}
          tooltip={'tooltip' in field ? (field.tooltip as string | undefined) : undefined}
        >
          <InputNumber
            value={typeof value === 'number' ? value : undefined}
            onChange={(v) => patchConfig({ [field.key]: v } as Partial<SiteConfig>)}
            style={{ width: '100%' }}
            min={0}
          />
        </FormField>
      );
    }

    if (field.type === 'select') {
      const options = 'options' in field ? (field.options as readonly string[]) : [];
      return (
        <FormField
          key={field.key}
          name={field.key}
          label={field.label}
          tooltip={'tooltip' in field ? (field.tooltip as string | undefined) : undefined}
        >
          <Select
            value={value === undefined || value === null ? undefined : String(value)}
            onChange={(v) => patchConfig({ [field.key]: v } as Partial<SiteConfig>)}
            allowClear
            showSearch
            options={options.map((opt) => ({ label: opt, value: opt }))}
          />
        </FormField>
      );
    }

    if (field.type === 'text') {
      return (
        <FormField
          key={field.key}
          name={field.key}
          label={field.label}
          tooltip={'tooltip' in field ? (field.tooltip as string | undefined) : undefined}
          fullWidth
        >
          <Input.TextArea
            value={value === undefined || value === null ? '' : String(value)}
            onChange={(e) => patchConfig({ [field.key]: e.target.value } as Partial<SiteConfig>)}
            rows={2}
            autoSize={{ minRows: 2, maxRows: 6 }}
          />
        </FormField>
      );
    }

    // array / object 类型统一用 JSON/YAML 文本编辑
    if (field.type === 'array' || field.type === 'object') {
      const text =
        value === undefined || value === null
          ? ''
          : typeof value === 'string'
            ? value
            : JSON.stringify(value, null, 2);

      return (
        <FormField
          key={field.key}
          name={field.key}
          label={field.label}
          tooltip={'tooltip' in field ? (field.tooltip as string | undefined) : undefined}
          fullWidth
          help={
            typeof value === 'object' && value !== null ? (
              <span className="text-xs">当前为复杂结构，建议在「原始 YAML」模式下编辑</span>
            ) : undefined
          }
        >
          <Input.TextArea
            value={text}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                patchConfig({ [field.key]: parsed } as Partial<SiteConfig>);
              } catch {
                patchConfig({ [field.key]: e.target.value } as Partial<SiteConfig>);
              }
            }}
            rows={3}
            className="hm-mono"
            placeholder={field.type === 'array' ? '["value1", "value2"]' : '{ "key": "value" }'}
          />
        </FormField>
      );
    }

    return (
      <FormField
        key={field.key}
        name={field.key}
        label={field.label}
        required={'required' in field ? Boolean(field.required) : false}
        tooltip={'tooltip' in field ? (field.tooltip as string | undefined) : undefined}
      >
        <Input
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => patchConfig({ [field.key]: e.target.value } as Partial<SiteConfig>)}
          className="hm-mono"
          placeholder={`请输入${field.label}`}
        />
      </FormField>
    );
  };

  /** 统计配置项数量 */
  const knownKeys = useMemo(
    () => new Set(CONFIG_GROUPS.flatMap((g) => g.fields.map((f) => f.key as string))),
    [],
  );
  const customKeys = useMemo(
    () => Object.keys(config).filter((key) => !knownKeys.has(key)),
    [config, knownKeys],
  );

  if (currentSiteId === null) {
    return (
      <PageContainer title="配置管理">
        <EmptyState
          kind="articles"
          title="请先选择站点"
          description="在顶栏的站点切换器中选择站点后即可编辑其 _config.yml"
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="配置管理"
      description={
        <span>
          {currentSite?.name} ·{' '}
          <span className="hm-mono text-xs">{currentSite?.path}/_config.yml</span>
        </span>
      }
      card={false}
      flush
      badge={
        dirty ? (
          <Tag color="orange" className="m-0">
            未保存
          </Tag>
        ) : (
          <Tag color="green" className="m-0" icon={<CheckCircleOutlined />}>
            已同步
          </Tag>
        )
      }
      extra={
        <Space>
          <Segmented
            value={mode}
            onChange={(v) => setMode(v as 'form' | 'raw')}
            options={[
              { label: '可视化', value: 'form', icon: <FormOutlined /> },
              { label: '原始 YAML', value: 'raw', icon: <CodeOutlined /> },
            ]}
          />
          <Tooltip title="查看与 Git 的差异">
            <Button icon={<DiffOutlined />} onClick={() => void showDiff()}>
              差异
            </Button>
          </Tooltip>
          <Tooltip title="重新加载">
            <Button icon={<ReloadOutlined />} onClick={() => void refresh()} loading={loading} />
          </Tooltip>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={() => void handleSave()}
            loading={saving}
            disabled={!dirty}
          >
            保存
          </Button>
        </Space>
      }
    >
      <Row gutter={16} className="h-full">
        {/* 左：编辑区 */}
        <Col xs={24} lg={16} className="h-full">
          <div className="hm-surface flex h-full flex-col overflow-hidden">
            {mode === 'form' ? (
              <Tabs
                activeKey={activeGroup}
                onChange={(key) => setActiveGroup(key as ConfigGroupKey)}
                items={[
                  ...CONFIG_GROUPS.map((group) => ({
                    key: group.key,
                    label: group.title,
                    children: (
                      <div
                        className="hm-scroll px-5 pb-5"
                        style={{ maxHeight: 'calc(100vh - 300px)' }}
                      >
                        <FormSection title={group.title} description={group.description}>
                          <Form layout="vertical">
                            <Row gutter={16}>
                              {group.fields.map((field) => (
                                <Col
                                  key={field.key}
                                  span={
                                    field.type === 'text' ||
                                    field.type === 'object' ||
                                    field.type === 'array'
                                      ? 24
                                      : 12
                                  }
                                >
                                  {renderField(field)}
                                </Col>
                              ))}
                            </Row>
                          </Form>
                        </FormSection>

                        {group.key === 'extensions' ? (
                          <>
                            <Divider />
                            <FormSection
                              title="配置模板"
                              sub
                              description="快速应用一组预设配置（会与当前配置合并，同名键以当前值为准）"
                            >
                              <Space wrap>
                                {templates.length === 0 ? (
                                  <span className="text-xs hm-text-secondary">暂无可用模板</span>
                                ) : (
                                  templates.map((template) => (
                                    <Tooltip key={template.id} title={template.description}>
                                      <Button
                                        size="small"
                                        onClick={() => {
                                          applyTemplate(template.id);
                                          message.success(`已应用模板「${template.name}」`);
                                        }}
                                      >
                                        {template.name}
                                      </Button>
                                    </Tooltip>
                                  ))
                                )}
                              </Space>
                            </FormSection>
                          </>
                        ) : null}

                        {group.key === 'extensions' && customKeys.length > 0 ? (
                          <>
                            <Divider />
                            <Alert
                              type="info"
                              showIcon
                              message={`检测到 ${customKeys.length} 个自定义配置项`}
                              description={
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {customKeys.slice(0, 20).map((key) => (
                                    <Tag key={key} className="m-0 hm-mono" style={{ fontSize: 11 }}>
                                      {key}
                                    </Tag>
                                  ))}
                                  {customKeys.length > 20 ? (
                                    <span className="text-xs">…等 {customKeys.length} 项</span>
                                  ) : null}
                                </div>
                              }
                            />
                          </>
                        ) : null}
                      </div>
                    ),
                  })),
                  {
                    key: '__raw__',
                    label: '原始视图',
                    children: (
                      <div className="p-4">
                        <CodeEditor
                          value={previewYaml}
                          language="yaml"
                          height={520}
                          readOnly
                          title="_config.yml（只读预览）"
                        />
                        <div className="mt-2 text-xs hm-text-secondary">
                          需要在文本级别精确编辑时，请切换到上方的「原始 YAML」模式
                        </div>
                      </div>
                    ),
                  },
                ]}
              />
            ) : (
              <div className="flex h-full flex-col p-4">
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
                    message="YAML 格式正确"
                    description="修改后点击「保存」写入 _config.yml（会自动创建备份）"
                  />
                )}

                <CodeEditor
                  value={raw}
                  onChange={setRaw}
                  language="yaml"
                  height="calc(100vh - 340px)"
                />
              </div>
            )}
          </div>
        </Col>

        {/* 右：工具与信息 */}
        <Col xs={24} lg={8}>
          <div className="space-y-4">
            <Card size="small" title="配置操作">
              <Space direction="vertical" className="w-full" size={8}>
                <Button block icon={<CloudDownloadOutlined />} onClick={() => void handleExport()}>
                  导出配置到文件
                </Button>
                <Button block icon={<CloudUploadOutlined />} onClick={() => void handleImport()}>
                  从文件导入配置
                </Button>
                <Button block icon={<DiffOutlined />} onClick={() => void showDiff()}>
                  查看 Git 差异
                </Button>
                <Button block danger icon={<RollbackOutlined />} onClick={handleRestore}>
                  恢复备份
                </Button>
                <Button
                  block
                  icon={<UndoOutlined />}
                  onClick={() => void refresh()}
                  disabled={!dirty}
                >
                  放弃修改并重新加载
                </Button>
              </Space>
            </Card>

            <Card size="small" title="当前配置摘要">
              <div className="space-y-2 text-xs">
                {[
                  ['站点标题', config.title],
                  ['副标题', config.subtitle],
                  ['作者', config.author],
                  ['语言', config.language],
                  ['站点网址', config.url],
                  ['根路径', config.root || '/'],
                  ['永久链接', config.permalink],
                  ['当前主题', config.theme],
                  ['每页文章数', config.per_page],
                  ['默认分类', config.default_category],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex items-start justify-between gap-3">
                    <span className="shrink-0 hm-text-secondary">{label}</span>
                    <span className="truncate hm-mono" title={String(value ?? '')}>
                      {value === undefined || value === null || value === '' ? '—' : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Alert
              type="info"
              showIcon
              message="配置项说明"
              description={
                <ul className="mt-1 mb-0 list-disc pl-4 text-xs leading-relaxed">
                  <li>每次保存前会自动备份原文件，可通过「恢复备份」回退</li>
                  <li>可视化模式只覆盖已展示的字段，未展示的自定义配置会原样保留</li>
                  <li>复杂的嵌套配置（如 highlight、deploy）建议在原始 YAML 模式下编辑</li>
                </ul>
              }
            />
          </div>
        </Col>
      </Row>
    </PageContainer>
  );
}

export default ConfigPage;
