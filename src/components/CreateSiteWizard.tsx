/** 创建站点向导：四步表单 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App as AntdApp,
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Tag,
  Alert as AntdAlert,
} from 'antd';
import {
  CheckCircleOutlined,
  CloudServerOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { CreateSiteInput, EnvCheck } from '@/types';
import { hexoService } from '@/services';
import { useSiteStore } from '@/stores';
import {
  validateAbsolutePath,
  validateNodeVersion,
  validateSiteName,
  isValidRepoUrl,
} from '@/utils/validator';
import { basenameOfPath } from '@/utils/slug';
import { WizardSteps } from './WizardSteps';
import { FormField, FormSection } from './FormField';
import { PathPicker } from './PathPicker';
import { StatusDot } from './StatusBadge';
import { REPO_PLATFORMS } from '@/constants';

interface CreateSiteWizardProps {
  open: boolean;
  onClose: () => void;
  /** 创建成功回调 */
  onCreated?: (siteId: number) => void;
}

/** 向导表单数据结构 */
interface WizardForm {
  name: string;
  description?: string;
  path: string;
  nodeVersion?: string;
  theme?: string;
  domain?: string;
  initGit?: boolean;
  repoUrl?: string;
  branch?: string;
}

const INITIAL_VALUES: WizardForm = {
  name: '',
  path: '',
  initGit: false,
  branch: 'main',
};

/**
 * 创建站点向导。
 * 四步：基本信息 → 存放位置 → 仓库与部署 → 确认创建。
 */
export function CreateSiteWizard({ open, onClose, onCreated }: CreateSiteWizardProps) {
  const [form] = Form.useForm<WizardForm>();
  const { message } = AntdApp.useApp();
  const createSite = useSiteStore((s) => s.createSite);

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [env, setEnv] = useState<EnvCheck | null>(null);
  const [checkingEnv, setCheckingEnv] = useState(false);
  const [pathTaken, setPathTaken] = useState(false);

  const path = Form.useWatch('path', form);
  const name = Form.useWatch('name', form);
  const initGit = Form.useWatch('initGit', form);
  const nodeVersion = Form.useWatch('nodeVersion', form);
  const repoUrl = Form.useWatch('repoUrl', form);

  // 重置状态
  useEffect(() => {
    if (open) {
      form.setFieldsValue(INITIAL_VALUES);
      setStep(0);
      setEnv(null);
      setPathTaken(false);
    }
  }, [open, form]);

  /** 检测指定目录的环境 */
  const checkEnv = useCallback(async (targetPath: string) => {
    if (!targetPath) return;
    setCheckingEnv(true);
    try {
      const result = await hexoService.checkEnv(targetPath);
      setEnv(result);
    } catch {
      setEnv(null);
    } finally {
      setCheckingEnv(false);
    }
  }, []);

  // 进入第二步时自动检测环境
  useEffect(() => {
    if (step === 1 && path) void checkEnv(path);
  }, [step, path, checkEnv]);

  const handleNext = async () => {
    try {
      if (step === 0) {
        await form.validateFields(['name', 'description']);
      } else if (step === 1) {
        await form.validateFields(['path', 'nodeVersion']);
      } else if (step === 2) {
        if (initGit) await form.validateFields(['repoUrl', 'branch']);
        else await form.validateFields(['domain']);
      }
      setStep((s) => Math.min(s + 1, 3));
    } catch {
      // 校验失败保持当前步骤
    }
  };

  const handlePrev = () => setStep((s) => Math.max(0, s - 1));

  const handleSubmit = async () => {
    const values = form.getFieldsValue();

    if (pathTaken) {
      message.error('该目录已被其他站点占用，请更换目录');
      setStep(1);
      return;
    }

    setSubmitting(true);
    try {
      const input: CreateSiteInput = {
        name: values.name.trim(),
        path: values.path.trim(),
        description: values.description?.trim() || undefined,
        domain: values.domain?.trim() || undefined,
        theme: values.theme?.trim() || undefined,
        nodeVersion: values.nodeVersion || undefined,
        repoUrl: values.initGit ? values.repoUrl?.trim() : undefined,
        branch: values.initGit ? values.branch || 'main' : undefined,
      };

      const site = await createSite(input);
      message.success(`站点「${site.name}」创建成功`);
      onCreated?.(site.id);
      onClose();
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  /** 从路径推导站点名（用户未填写时） */
  const handlePathPicked = (picked: string) => {
    const currentName = form.getFieldValue('name');
    if (!currentName) {
      form.setFieldValue('name', basenameOfPath(picked));
    }
    void checkEnv(picked);
  };

  const repoPlatformOptions = useMemo(
    () =>
      REPO_PLATFORMS.map((platform) => ({
        label: platform.name,
        value: platform.id,
      })),
    [],
  );

  const [repoPlatform, setRepoPlatform] = useState<string>('github');

  // 环境问题汇总（第二步展示）
  const envIssues = env ? env.issues : [];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={720}
      title="创建 Hexo 站点"
      destroyOnClose
      maskClosable={false}
      footer={
        <div className="flex items-center justify-between">
          <span className="text-xs hm-text-secondary">第 {step + 1} / 4 步</span>
          <Space>
            {step > 0 ? <Button onClick={handlePrev}>上一步</Button> : null}
            <Button onClick={onClose}>取消</Button>
            {step < 3 ? (
              <Button type="primary" onClick={handleNext}>
                下一步
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={submitting}
                onClick={handleSubmit}
              >
                确认创建
              </Button>
            )}
          </Space>
        </div>
      }
    >
      <div className="mb-5">
        <WizardSteps current={step} />
      </div>

      <Form form={form} layout="vertical" initialValues={INITIAL_VALUES} requiredMark={false}>
        {/* 第一步：基本信息 */}
        <div style={{ display: step === 0 ? 'block' : 'none' }}>
          <FormSection title="站点基本信息" description="用于在管理工具中标识这个站点">
            <FormField
              name="name"
              label="站点名称"
              required
              tooltip="展示在站点列表与顶栏切换器中，可随时修改"
              rules={[
                {
                  validator: (_rule, value: string) =>
                    validateSiteName(value ?? '') === null
                      ? Promise.resolve()
                      : Promise.reject(new Error(validateSiteName(value ?? '') as string)),
                },
              ]}
            >
              <Input placeholder="如：我的技术博客" maxLength={60} showCount autoFocus />
            </FormField>

            <FormField
              name="description"
              label="站点描述"
              tooltip="可选，记录站点用途便于日后识别"
              rules={[{ max: 200, message: '描述不能超过 200 个字符' }]}
            >
              <Input.TextArea
                placeholder="如：记录前端与云原生相关的技术笔记"
                rows={3}
                maxLength={200}
                showCount
              />
            </FormField>
          </FormSection>
        </div>

        {/* 第二步：存放位置 */}
        <div style={{ display: step === 1 ? 'block' : 'none' }}>
          <FormSection
            title="站点存放位置"
            description="站点将创建在该目录下，请确保选择空目录或新建目录"
          >
            <FormField
              name="path"
              label="站点目录"
              required
              tooltip="Hexo 站点的根目录，会在此目录执行 hexo init"
              rules={[
                {
                  validator: (_rule, value: string) => {
                    const error = validateAbsolutePath(value ?? '');
                    return error ? Promise.reject(new Error(error)) : Promise.resolve();
                  },
                },
              ]}
            >
              <PathPicker
                mode="directory"
                placeholder="选择或输入站点目录的绝对路径"
                onPicked={handlePathPicked}
              />
            </FormField>

            <FormField
              name="nodeVersion"
              label="Node 版本"
              tooltip="留空使用系统默认版本；如选择具体版本，部署配置中会写入对应版本号"
              rules={[
                {
                  validator: (_rule, value: string) =>
                    validateNodeVersion(value ?? '') === null
                      ? Promise.resolve()
                      : Promise.reject(new Error(validateNodeVersion(value ?? '') as string)),
                },
              ]}
            >
              <Select
                placeholder="使用系统默认版本"
                allowClear
                showSearch
                options={[
                  { label: '使用系统默认版本', value: 'system' },
                  { label: 'Node 18 LTS', value: '18' },
                  { label: 'Node 20 LTS', value: '20' },
                  { label: 'Node 22 LTS', value: '22' },
                ]}
              />
            </FormField>

            <FormField
              name="theme"
              label="初始主题"
              tooltip="可选，创建后自动安装并启用该主题（需网络可用）"
            >
              <Input placeholder="如：fluid、next、butterfly" />
            </FormField>

            {/* 环境检测结果 */}
            {path ? (
              <div className="mt-2">
                {checkingEnv ? (
                  <Alert
                    type="info"
                    showIcon
                    message="正在检测环境…"
                    icon={<CloudServerOutlined />}
                  />
                ) : env ? (
                  <div
                    className="rounded-lg border p-3"
                    style={{ borderColor: 'var(--hm-border)' }}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium">环境检测结果</span>
                      {env.ready ? (
                        <Tag color="green" className="m-0">
                          环境就绪
                        </Tag>
                      ) : (
                        <Tag color="orange" className="m-0">
                          存在待处理项
                        </Tag>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="hm-text-secondary">Node.js</span>
                        <span className="hm-mono">{env.nodeVersion ?? '未安装'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="hm-text-secondary">npm</span>
                        <span className="hm-mono">{env.npmVersion ?? '未安装'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="hm-text-secondary">Git</span>
                        <span className="hm-mono">{env.gitVersion ?? '未安装'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="hm-text-secondary">Hexo CLI</span>
                        <span className="hm-mono">{env.hexoVersion ?? '未全局安装'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="hm-text-secondary">已有 Hexo 站点</span>
                        <StatusDot
                          color={env.isHexoSite ? '#52c41a' : '#d9d9d9'}
                          text={env.isHexoSite ? '是' : '否'}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="hm-text-secondary">依赖已安装</span>
                        <StatusDot
                          color={env.hasNodeModules ? '#52c41a' : '#faad14'}
                          text={env.hasNodeModules ? '是' : '否'}
                        />
                      </div>
                    </div>

                    {envIssues.length > 0 ? (
                      <ul className="mt-3 mb-0 list-none space-y-1 p-0 text-xs text-orange-600">
                        {envIssues.map((issue, index) => (
                          <li key={index} className="flex items-start gap-1.5">
                            <ExclamationCircleOutlined className="mt-0.5 shrink-0" />
                            <span>{issue}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : (
                  <Alert type="warning" showIcon message="环境检测失败，请确认目录可访问" />
                )}
              </div>
            ) : null}

            <Checkbox
              className="mt-3"
              onChange={(e) => setPathTaken(e.target.checked)}
              checked={pathTaken}
            >
              <span className="text-xs hm-text-secondary">
                该目录已被其他站点占用（如确认无冲突可不勾选）
              </span>
            </Checkbox>
          </FormSection>
        </div>

        {/* 第三步：仓库与部署 */}
        <div style={{ display: step === 2 ? 'block' : 'none' }}>
          <FormSection title="仓库与部署" description="可选配置，创建后也可在「部署配置」页面补充">
            <FormField name="initGit" label="初始化 Git 仓库" valuePropName="checked">
              <Checkbox>在站点目录中执行 git init 并关联远程仓库</Checkbox>
            </FormField>

            <FormField
              name="domain"
              label="站点域名"
              tooltip="用于生成部署配置中的域名与 CNAME 文件"
            >
              <Input placeholder="如：blog.example.com" className="hm-mono" />
            </FormField>

            {initGit ? (
              <>
                <Form.Item label="仓库平台">
                  <Radio.Group
                    value={repoPlatform}
                    onChange={(e) => setRepoPlatform(e.target.value as string)}
                    optionType="button"
                    buttonStyle="solid"
                    options={repoPlatformOptions}
                  />
                </Form.Item>

                <FormField
                  name="repoUrl"
                  label="远程仓库地址"
                  tooltip="支持 HTTPS 与 SSH 格式"
                  rules={[
                    {
                      validator: (_rule, value: string) => {
                        if (!value) return Promise.resolve();
                        return isValidRepoUrl(value)
                          ? Promise.resolve()
                          : Promise.reject(new Error('请输入有效的仓库地址'));
                      },
                    },
                  ]}
                >
                  <Input placeholder="git@github.com:username/blog.git" className="hm-mono" />
                </FormField>

                <FormField name="branch" label="默认分支">
                  <Input placeholder="main" className="hm-mono" />
                </FormField>
              </>
            ) : null}
          </FormSection>
        </div>

        {/* 第四步：确认 */}
        <div style={{ display: step === 3 ? 'block' : 'none' }}>
          <FormSection title="确认信息" description="请核对以下内容，确认无误后点击「确认创建」">
            <div className="rounded-lg border" style={{ borderColor: 'var(--hm-border)' }}>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {[
                    ['站点名称', name || '—'],
                    ['站点目录', path || '—'],
                    ['站点描述', form.getFieldValue('description') || '—'],
                    [
                      'Node 版本',
                      nodeVersion && nodeVersion !== 'system' ? nodeVersion : '系统默认',
                    ],
                    ['初始主题', form.getFieldValue('theme') || '默认主题'],
                    ['站点域名', form.getFieldValue('domain') || '—'],
                    [
                      'Git 仓库',
                      initGit
                        ? `${repoUrl || '未填写'}（${form.getFieldValue('branch') || 'main'}）`
                        : '不初始化',
                    ],
                  ].map(([label, value]) => (
                    <tr
                      key={label}
                      className="border-b last:border-b-0"
                      style={{ borderColor: 'var(--hm-border)' }}
                    >
                      <td className="w-28 px-3 py-2 align-top hm-text-secondary">{label}</td>
                      <td className="px-3 py-2 break-all hm-mono text-xs">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {env && !env.ready ? (
              <AntdAlert
                className="mt-3"
                type="warning"
                showIcon
                message="环境未完全就绪"
                description="仍可创建站点，但建议先安装缺失的依赖（如 Node.js、Hexo CLI）"
              />
            ) : null}

            {pathTaken ? (
              <AntdAlert
                className="mt-3"
                type="error"
                showIcon
                message="目录冲突"
                description="该目录已被其他站点使用，请返回上一步更换目录"
              />
            ) : null}
          </FormSection>
        </div>
      </Form>
    </Modal>
  );
}
