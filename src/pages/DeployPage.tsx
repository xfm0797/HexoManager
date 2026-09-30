/** 部署配置：7 平台 CI/CD 配置生成 + 边缘层配置 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Col,
  Collapse,
  Descriptions,
  Divider,
  Form,
  Input,
  Radio,
  Row,
  Select,
  Space,
  Steps,
  Switch,
  Tabs,
  Tag,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  CloudUploadOutlined,
  CodeOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  EyeOutlined,
  FileProtectOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  RocketOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  ConfigPreviewModal,
  EmptyState,
  EnvVarEditor,
  FileCheckList,
  FormField,
  FormSection,
  PageContainer,
  PlatformCard,
  StatCard,
  StatGrid,
} from '@/components';
import { useDeployConfig } from '@/hooks';
import { useSiteStore } from '@/stores';
import type { EnvVar, GeneratedFile, GenerateConfigInput, PlatformId } from '@/types';
import {
  BUILD_COMMANDS,
  DEPLOY_PLATFORMS,
  EDGE_PROVIDERS,
  NODE_VERSIONS,
  ORIGIN_STRATEGIES,
  REPO_PLATFORMS,
} from '@/constants';
import { isValidDomain, isValidRepoUrl } from '@/utils/validator';
import { copyToClipboard, openWithSystem } from '@/utils/desktop';

/** 生成配置所需的表单数据 */
interface DeployFormValues {
  domain?: string;
  repoUrl?: string;
  repoPlatform?: PlatformId;
  nodeVersion?: string;
  buildCommand?: string;
  envVars?: EnvVar[];
  edgeProvider?: string;
  edgeDomain?: string;
  originStrategy?: string;
  writeFiles?: boolean;
}

/** 部署配置页面 */
export function DeployPage() {
  const { message, modal } = AntdApp.useApp();

  const currentSiteId = useSiteStore((s) => s.currentSiteId);
  const currentSite = useSiteStore((s) => s.sites.find((site) => site.id === s.currentSiteId));

  const {
    config,
    templates,
    generatedPreview,
    generating,
    save,
    preview,
    generate,
    checkFiles,
    refresh,
  } = useDeployConfig(currentSiteId);

  const [form] = Form.useForm<DeployFormValues>();

  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>([]);
  const [edgeEnabled, setEdgeEnabled] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [writing, setWriting] = useState(false);
  const [fileCheck, setFileCheck] = useState<[string, boolean][]>([]);
  const [activeTab, setActiveTab] = useState('platforms');

  // 用已有配置初始化表单
  useEffect(() => {
    if (!config) return;

    const ciPlatforms = (config.ciPlatforms ?? []).filter((p) =>
      DEPLOY_PLATFORMS.some((platform) => platform.id === p),
    ) as PlatformId[];

    setSelectedPlatforms(ciPlatforms);
    setEdgeEnabled(Boolean(config.edgeProvider && config.edgeProvider !== 'none'));

    form.setFieldsValue({
      domain: currentSite?.domain ?? undefined,
      repoUrl: config.repoPlatform ? undefined : undefined,
      repoPlatform: (config.repoPlatform as PlatformId) ?? 'github',
      nodeVersion: config.nodeVersion || '20',
      buildCommand: config.buildCommand || 'hexo clean && hexo generate',
      envVars: config.envVars ?? [],
      edgeProvider: config.edgeProvider ?? 'edgeone',
      edgeDomain: config.edgeDomain ?? undefined,
      originStrategy: config.originStrategy || 'failover',
    });
  }, [config, form, currentSite]);

  /** 构造生成入参 */
  const buildInput = useMemo<GenerateConfigInput>(() => {
    const values = form.getFieldsValue();

    return {
      sitePath: currentSite?.path ?? '',
      siteName: currentSite?.name,
      domain: values.domain?.trim() || currentSite?.domain || undefined,
      repoUrl: values.repoUrl?.trim() || undefined,
      repoPlatform: values.repoPlatform ?? 'github',
      ciPlatforms: selectedPlatforms,
      nodeVersion: values.nodeVersion || '20',
      buildCommand: values.buildCommand || 'hexo clean && hexo generate',
      envVars: values.envVars ?? [],
      edgeProvider: edgeEnabled ? (values.edgeProvider ?? 'edgeone') : undefined,
      edgeDomain: edgeEnabled ? values.edgeDomain?.trim() || undefined : undefined,
      originStrategy: values.originStrategy || 'failover',
      writeFiles: false,
    };
  }, [form, currentSite, selectedPlatforms, edgeEnabled]);

  const handleTogglePlatform = (platformId: PlatformId) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platformId) ? prev.filter((p) => p !== platformId) : [...prev, platformId],
    );
  };

  const handlePreview = async () => {
    if (selectedPlatforms.length === 0 && !edgeEnabled) {
      message.warning('请至少选择一个部署平台或启用边缘层');
      return;
    }

    const files = await preview(buildInput);
    if (files.length > 0) {
      setPreviewOpen(true);
      // 同步检查文件是否已存在
      const check = await checkFiles(buildInput);
      setFileCheck(check);
    } else {
      message.info('没有生成任何配置文件，请检查平台选择');
    }
  };

  const handleGenerate = async () => {
    if (currentSiteId === null) return;
    if (selectedPlatforms.length === 0 && !edgeEnabled) {
      message.warning('请至少选择一个部署平台或启用边缘层');
      return;
    }

    const check = await checkFiles(buildInput);
    const existing = check.filter(([, exists]) => exists);

    if (existing.length > 0) {
      const confirmed = await new Promise<boolean>((resolve) => {
        modal.confirm({
          title: `有 ${existing.length} 个文件已存在`,
          content: (
            <div className="pt-2">
              <p className="mb-2 text-sm">生成会覆盖以下文件，请确认：</p>
              <ul className="mb-0 max-h-52 list-none overflow-auto p-0 text-xs">
                {existing.map(([path]) => (
                  <li key={path} className="hm-mono">
                    · {path}
                  </li>
                ))}
              </ul>
            </div>
          ),
          okText: '覆盖生成',
          okButtonProps: { danger: true },
          cancelText: '取消',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });

      if (!confirmed) return;
    }

    setWriting(true);
    try {
      await generate({
        ...buildInput,
        sitePath: currentSite?.path ?? '',
        writeFiles: true,
      });

      // 保存部署配置到数据库
      await save({
        repoPlatform: buildInput.repoPlatform ?? 'github',
        ciPlatforms: selectedPlatforms as string[],
        nodeVersion: buildInput.nodeVersion ?? '20',
        buildCommand: buildInput.buildCommand ?? '',
        envVars: buildInput.envVars ?? [],
        edgeProvider: edgeEnabled ? (buildInput.edgeProvider ?? null) : null,
        edgeDomain: edgeEnabled ? (buildInput.edgeDomain ?? null) : null,
        originStrategy: buildInput.originStrategy ?? 'failover',
      });

      message.success('配置文件已生成并保存到站点目录');
      await refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setWriting(false);
    }
  };

  // 按平台归类预览文件
  const filesByPlatform = useMemo(() => {
    const map = new Map<string, GeneratedFile[]>();
    for (const file of generatedPreview) {
      const list = map.get(file.platform) ?? [];
      list.push(file);
      map.set(file.platform, list);
    }
    return map;
  }, [generatedPreview]);

  if (currentSiteId === null) {
    return (
      <PageContainer title="部署配置">
        <EmptyState
          kind="articles"
          title="请先选择站点"
          description="在顶栏选择站点后，即可生成各平台的 CI/CD 配置文件"
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="部署配置"
      description={
        <span>
          {currentSite?.name} · <span className="hm-mono text-xs">{currentSite?.path}</span> · 已选{' '}
          {selectedPlatforms.length} 个平台
        </span>
      }
      card={false}
      flush
      extra={
        <Space>
          <Button icon={<EyeOutlined />} onClick={() => void handlePreview()} loading={generating}>
            生成预览
          </Button>
          <Tooltip title="重新加载配置">
            <Button icon={<ReloadOutlined />} onClick={() => void refresh()} />
          </Tooltip>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={() => void handleGenerate()}
            loading={writing}
            disabled={selectedPlatforms.length === 0 && !edgeEnabled}
          >
            生成并写入站点
          </Button>
        </Space>
      }
    >
      <div className="space-y-4">
        {/* 概览指标 */}
        <StatGrid columns={4}>
          <StatCard
            title="已选部署平台"
            value={selectedPlatforms.length}
            icon={<DeploymentUnitOutlined />}
            iconColor="#3366ff"
          />
          <StatCard
            title="边缘层"
            value={edgeEnabled ? '已启用' : '未启用'}
            icon={<GlobalOutlined />}
            iconColor={edgeEnabled ? '#52c41a' : '#8c8c8c'}
            tooltip="边缘层可提供回源控制、故障转移与全球加速"
          />
          <StatCard
            title="可用模板"
            value={templates.length}
            icon={<FileProtectOutlined />}
            iconColor="#722ed1"
          />
          <StatCard
            title="待生成文件"
            value={generatedPreview.length}
            icon={<CodeOutlined />}
            iconColor="#fa8c16"
            tooltip="最近一次预览生成的文件数量"
          />
        </StatGrid>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'platforms',
              label: (
                <span>
                  <DeploymentUnitOutlined /> 部署平台
                </span>
              ),
              children: (
                <div className="space-y-4">
                  <Alert
                    type="info"
                    showIcon
                    message="选择要部署到的平台"
                    description="可以同时选择多个平台。生成配置后，推送到代码仓库即可触发对应平台的自动构建与部署。"
                  />

                  <div
                    className="grid gap-4"
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}
                  >
                    {DEPLOY_PLATFORMS.map((platform) => (
                      <PlatformCard
                        key={platform.id}
                        platform={platform}
                        selected={selectedPlatforms.includes(platform.id)}
                        generatedCount={filesByPlatform.get(platform.id)?.length ?? 0}
                        onSelect={() => handleTogglePlatform(platform.id)}
                        onOpenDocs={(p) => void openWithSystem(p.officialUrl)}
                        onPreview={() => {
                          setSelectedPlatforms((prev) =>
                            prev.includes(platform.id) ? prev : [...prev, platform.id],
                          );
                          setActiveTab('platforms');
                          void handlePreview();
                        }}
                      />
                    ))}
                  </div>
                </div>
              ),
            },
            {
              key: 'config',
              label: (
                <span>
                  <SettingOutlined /> 构建与仓库
                </span>
              ),
              children: (
                <Row gutter={16}>
                  <Col xs={24} lg={14}>
                    <Card size="small">
                      <Form form={form} layout="vertical">
                        <FormSection title="代码仓库" description="配置文件中的仓库地址与平台信息">
                          <Row gutter={12}>
                            <Col span={12}>
                              <FormField name="repoPlatform" label="仓库平台">
                                <Radio.Group
                                  optionType="button"
                                  buttonStyle="solid"
                                  options={REPO_PLATFORMS.map((p) => ({
                                    label: p.name,
                                    value: p.id,
                                  }))}
                                />
                              </FormField>
                            </Col>
                            <Col span={12}>
                              <FormField
                                name="domain"
                                label="站点域名"
                                tooltip="用于生成 CNAME 文件与配置文件中的域名"
                                rules={[
                                  {
                                    validator: (_r, value: string) => {
                                      if (!value) return Promise.resolve();
                                      return isValidDomain(value)
                                        ? Promise.resolve()
                                        : Promise.reject(
                                            new Error('域名格式不正确，如 blog.example.com'),
                                          );
                                    },
                                  },
                                ]}
                              >
                                <Input placeholder="blog.example.com" className="hm-mono" />
                              </FormField>
                            </Col>
                          </Row>

                          <FormField
                            name="repoUrl"
                            label="远程仓库地址"
                            tooltip="可选。填写后会在配置文件中使用该地址；留空则由各平台自行关联仓库"
                            rules={[
                              {
                                validator: (_r, value: string) => {
                                  if (!value) return Promise.resolve();
                                  return isValidRepoUrl(value)
                                    ? Promise.resolve()
                                    : Promise.reject(new Error('仓库地址格式不正确'));
                                },
                              },
                            ]}
                          >
                            <Input
                              placeholder="git@github.com:username/blog.git"
                              className="hm-mono"
                              allowClear
                            />
                          </FormField>
                        </FormSection>

                        <Divider />

                        <FormSection title="构建配置" description="CI 环境中的 Node 版本与构建命令">
                          <Row gutter={12}>
                            <Col span={10}>
                              <FormField name="nodeVersion" label="Node 版本">
                                <Select
                                  options={NODE_VERSIONS.map((v) => ({
                                    label: v === 'lts/*' ? 'LTS 最新版' : `Node ${v}`,
                                    value: v,
                                  }))}
                                />
                              </FormField>
                            </Col>
                            <Col span={14}>
                              <FormField
                                name="buildCommand"
                                label="构建命令"
                                tooltip="在 CI 环境中执行的构建脚本"
                              >
                                <Select
                                  showSearch
                                  options={BUILD_COMMANDS.map((c) => ({
                                    label: c.label,
                                    value: c.value,
                                  }))}
                                  dropdownRender={(menu) => (
                                    <>
                                      {menu}
                                      <Divider className="my-1" />
                                      <div className="px-2 pb-1 text-xs hm-text-secondary">
                                        可直接在下方输入自定义命令
                                      </div>
                                    </>
                                  )}
                                />
                              </FormField>
                            </Col>
                          </Row>
                        </FormSection>

                        <Divider />

                        <FormSection
                          title="环境变量"
                          description="部署时注入 CI 环境，如部署 Token、统计代码 ID 等"
                        >
                          <Form.Item name="envVars" noStyle>
                            <EnvVarEditor />
                          </Form.Item>
                        </FormSection>

                        <Alert
                          type="info"
                          showIcon
                          message="安全提示"
                          description="标记为密钥的环境变量会在生成的配置中引用 CI 平台的 Secrets（如 ${{ secrets.XXX }}），不会明文写入仓库。"
                        />
                      </Form>
                    </Card>
                  </Col>

                  <Col xs={24} lg={10}>
                    <Card size="small" title="配置说明">
                      <Descriptions
                        size="small"
                        column={1}
                        items={[
                          {
                            key: 'domain',
                            label: '自定义域名',
                            children: '生成 CNAME 文件，部分平台还需在控制台绑定',
                          },
                          {
                            key: 'node',
                            label: 'Node 版本',
                            children: '写入 workflow 的 setup-node 步骤',
                          },
                          {
                            key: 'build',
                            label: '构建命令',
                            children: 'CI 中执行的脚本，通常为 hexo clean && hexo generate',
                          },
                          {
                            key: 'env',
                            label: '环境变量',
                            children: '密钥类变量将引用平台的 Secrets 机制',
                          },
                        ]}
                      />
                    </Card>

                    <Card size="small" title="支持的模板清单" className="mt-4">
                      <Collapse
                        ghost
                        items={templates.map((template) => ({
                          key: template.id,
                          label: (
                            <span className="flex items-center gap-2 text-sm">
                              <Tag className="m-0" style={{ fontSize: 11 }}>
                                {template.platform}
                              </Tag>
                              {template.name}
                            </span>
                          ),
                          children: (
                            <div className="space-y-1.5 text-xs">
                              <div className="hm-text-secondary">{template.description}</div>
                              <div className="flex flex-wrap gap-1">
                                {template.files.map((file) => (
                                  <Tag
                                    key={file}
                                    className="m-0 cursor-pointer hm-mono"
                                    style={{ fontSize: 11 }}
                                    onClick={() =>
                                      void copyToClipboard(file).then((ok) =>
                                        ok ? message.success('路径已复制') : undefined,
                                      )
                                    }
                                  >
                                    {file}
                                  </Tag>
                                ))}
                              </div>
                              <Button
                                type="link"
                                size="small"
                                className="!px-0"
                                onClick={() => void openWithSystem(template.officialUrl)}
                              >
                                查看官方文档
                              </Button>
                            </div>
                          ),
                        }))}
                      />
                    </Card>
                  </Col>
                </Row>
              ),
            },
            {
              key: 'edge',
              label: (
                <span>
                  <GlobalOutlined /> 边缘层配置
                </span>
              ),
              children: (
                <Row gutter={16}>
                  <Col xs={24} lg={14}>
                    <Card size="small">
                      <Form form={form} layout="vertical">
                        <FormSection
                          title="边缘层服务"
                          description="通过边缘节点加速访问，并提供智能回源与故障转移能力"
                        >
                          <div
                            className="mb-4 flex items-center justify-between rounded-lg border p-3"
                            style={{ borderColor: 'var(--hm-border)' }}
                          >
                            <div>
                              <div className="text-sm font-medium">启用边缘层配置</div>
                              <div className="mt-0.5 text-xs hm-text-secondary">
                                生成 EdgeOne 回源配置与 Cloudflare Worker 脚本
                              </div>
                            </div>
                            <Switch checked={edgeEnabled} onChange={setEdgeEnabled} />
                          </div>

                          {edgeEnabled ? (
                            <>
                              <FormField name="edgeProvider" label="边缘服务商">
                                <Radio.Group className="w-full">
                                  <div className="grid grid-cols-1 gap-2">
                                    {EDGE_PROVIDERS.map((provider) => (
                                      <Radio
                                        key={provider.id}
                                        value={provider.id}
                                        className="!mr-0"
                                      >
                                        <div className="ml-1">
                                          <div className="text-sm">{provider.name}</div>
                                          <div className="text-xs hm-text-secondary">
                                            {provider.description}
                                          </div>
                                        </div>
                                      </Radio>
                                    ))}
                                  </div>
                                </Radio.Group>
                              </FormField>

                              <FormField
                                name="edgeDomain"
                                label="边缘加速域名"
                                tooltip="用户在浏览器中访问的域名，需在边缘平台配置 CNAME"
                              >
                                <Input placeholder="www.example.com" className="hm-mono" />
                              </FormField>

                              <FormField
                                name="originStrategy"
                                label="回源策略"
                                tooltip="决定边缘节点如何访问源站"
                              >
                                <Select
                                  options={ORIGIN_STRATEGIES.map((s) => ({
                                    label: s.label,
                                    value: s.value,
                                  }))}
                                />
                              </FormField>
                            </>
                          ) : (
                            <Alert
                              type="info"
                              showIcon
                              message="边缘层未启用"
                              description="开启后可为国内海外用户分别配置加速域名与回源策略，提升访问速度与可用性。"
                            />
                          )}
                        </FormSection>
                      </Form>
                    </Card>
                  </Col>

                  <Col xs={24} lg={10}>
                    <Card size="small" title="回源策略说明">
                      <div className="space-y-3">
                        {ORIGIN_STRATEGIES.map((strategy) => (
                          <div
                            key={strategy.value}
                            className="rounded-lg border p-3"
                            style={{ borderColor: 'var(--hm-border)' }}
                          >
                            <div className="flex items-center gap-2">
                              <Tag color="blue" className="m-0">
                                {strategy.label}
                              </Tag>
                            </div>
                            <div className="mt-1.5 text-xs hm-text-secondary">
                              {strategy.description}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>

                    <Alert
                      className="mt-4"
                      type="warning"
                      showIcon
                      message="边缘层需要额外配置"
                      description={
                        <ul className="mt-1 mb-0 list-disc pl-4 text-xs leading-relaxed">
                          <li>EdgeOne：在腾讯云控制台添加加速域名并配置 CNAME</li>
                          <li>Cloudflare：Worker 需绑定 KV 命名空间用于健康状态记录</li>
                          <li>生成的配置文件需配合平台控制台使用，仅生成文件不会自动生效</li>
                        </ul>
                      }
                    />
                  </Col>
                </Row>
              ),
            },
            {
              key: 'steps',
              label: (
                <span>
                  <RocketOutlined /> 部署指南
                </span>
              ),
              children: (
                <Row gutter={16}>
                  <Col xs={24} lg={14}>
                    <Card size="small" title="部署流程">
                      <Steps
                        direction="vertical"
                        current={-1}
                        items={[
                          {
                            title: '生成配置文件',
                            description: '在「部署平台」中选择目标平台，点击「生成并写入站点」',
                            icon: <CodeOutlined />,
                          },
                          {
                            title: '提交并推送到仓库',
                            description: '在「Git 操作」页面提交改动并推送到远程仓库',
                            icon: <CloudUploadOutlined />,
                          },
                          {
                            title: '平台自动构建',
                            description: 'CI 平台检测到推送后自动执行构建命令',
                            icon: <DatabaseOutlined />,
                          },
                          {
                            title: '配置自定义域名',
                            description: '构建成功后，在平台控制台绑定域名并配置 DNS',
                            icon: <GlobalOutlined />,
                          },
                          {
                            title: '验证访问',
                            description: '通过线上域名访问站点，确认内容与样式正常',
                            icon: <CheckCircleOutlined />,
                          },
                        ]}
                      />
                    </Card>
                  </Col>

                  <Col xs={24} lg={10}>
                    <Card size="small" title="常见问题">
                      <Collapse
                        ghost
                        items={[
                          {
                            key: 'build-fail',
                            label: '构建失败怎么办？',
                            children: (
                              <div className="text-xs leading-relaxed hm-text-secondary">
                                先确认本地 hexo generate 能成功。CI 环境通常需要先执行 npm install /
                                npm ci 安装依赖，若使用了私有主题或插件，需要额外配置访问凭证。
                              </div>
                            ),
                          },
                          {
                            key: 'domain',
                            label: '自定义域名不生效？',
                            children: (
                              <div className="text-xs leading-relaxed hm-text-secondary">
                                检查三点：1) CNAME 文件已生成在 public 目录；2) DNS 已添加 CNAME
                                记录指向平台分配的域名；3) 平台控制台已绑定该域名并完成验证。
                              </div>
                            ),
                          },
                          {
                            key: '404',
                            label: '页面 404 但首页正常？',
                            children: (
                              <div className="text-xs leading-relaxed hm-text-secondary">
                                通常是 root（子路径）配置不一致。若站点部署在子目录，需要在
                                _config.yml 中将 root 设置为对应路径。
                              </div>
                            ),
                          },
                          {
                            key: 'cache',
                            label: '更新后样式没变化？',
                            children: (
                              <div className="text-xs leading-relaxed hm-text-secondary">
                                边缘节点与浏览器都有缓存。可先强制刷新（Ctrl/Cmd + Shift + R），
                                若仍有问题则在边缘平台执行缓存刷新。
                              </div>
                            ),
                          },
                        ]}
                      />
                    </Card>

                    <Card size="small" title="平台文档" className="mt-4">
                      <Space direction="vertical" className="w-full" size={6}>
                        {DEPLOY_PLATFORMS.map((platform) => (
                          <Button
                            key={platform.id}
                            block
                            size="small"
                            className="!justify-start"
                            icon={<InfoCircleOutlined />}
                            onClick={() => void openWithSystem(platform.officialUrl)}
                          >
                            {platform.name} 官方文档
                          </Button>
                        ))}
                      </Space>
                    </Card>
                  </Col>
                </Row>
              ),
            },
          ]}
        />

        {/* 已生成的配置文件 */}
        {generatedPreview.length > 0 ? (
          <Card
            size="small"
            title={`上次生成的文件（${generatedPreview.length}）`}
            extra={
              <Button size="small" type="link" onClick={() => setPreviewOpen(true)}>
                查看内容
              </Button>
            }
          >
            <div className="space-y-2">
              {[...filesByPlatform.entries()].map(([platform, files]) => (
                <div key={platform} className="flex items-start gap-3">
                  <Tag color="blue" className="m-0 mt-0.5">
                    {platform}
                  </Tag>
                  <div className="flex flex-wrap gap-1">
                    {files.map((file) => (
                      <Tag
                        key={file.path}
                        className="m-0 cursor-pointer hm-mono"
                        style={{ fontSize: 11 }}
                        onClick={() => setPreviewOpen(true)}
                      >
                        {file.path}
                      </Tag>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {fileCheck.length > 0 ? <FileCheckList items={fileCheck} /> : null}
      </div>

      {/* 配置预览弹窗 */}
      <ConfigPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        files={generatedPreview}
        sitePath={currentSite?.path}
        title="生成的部署配置"
        allowWrite={false}
      />
    </PageContainer>
  );
}

export default DeployPage;
