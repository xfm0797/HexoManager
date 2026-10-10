/** Git 操作：状态、提交、推送、历史 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tabs,
  Tag,
  Timeline,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  BranchesOutlined,
  CheckCircleOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
  CodeOutlined,
  DeleteOutlined,
  DiffOutlined,
  ExportOutlined,
  FileAddOutlined,
  FileDoneOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SaveOutlined,
  SettingOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { CodeBlock, EmptyState, PageContainer, StatCard, StatGrid } from '@/components';
import { useGit } from '@/hooks';
import { useDeployStore, useSiteStore } from '@/stores';
import type { CommitLog, GitFileStatus } from '@/types';
import { formatDateTime, formatRelative } from '@/utils/format';
import { copyToClipboard, openWithSystem } from '@/utils/desktop';
import { validateCommitMessage } from '@/utils/validator';
import { useI18n } from '@/i18n';

/** Git 文件状态标记 */
function statusMark(
  status: GitFileStatus['worktree'] | GitFileStatus['index'],
  t: (zh: string) => string,
): {
  label: string;
  color: string;
} {
  const map: Record<string, { label: string; color: string }> = {
    M: { label: t('修改'), color: 'orange' },
    A: { label: t('新增'), color: 'green' },
    D: { label: t('删除'), color: 'red' },
    R: { label: t('重命名'), color: 'blue' },
    C: { label: t('复制'), color: 'cyan' },
    '?': { label: t('未跟踪'), color: 'default' },
    '!': { label: t('忽略'), color: 'default' },
    U: { label: t('冲突'), color: 'volcano' },
  };
  return map[status] ?? { label: status || '—', color: 'default' };
}

/** Git 操作页面 */
export function GitPage() {
  const { message, modal } = AntdApp.useApp();
  const { t } = useI18n();

  const currentSiteId = useSiteStore((s) => s.currentSiteId);
  const currentSite = useSiteStore((s) => s.sites.find((site) => site.id === s.currentSiteId));

  const {
    status,
    commits,
    diff,
    loading,
    busy,
    refresh,
    loadDiff,
    init,
    add,
    commit,
    push,
    pull,
    discard,
    stash,
    stashPop,
    setRemote,
  } = useGit(currentSiteId);

  const [commitMessage, setCommitMessage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [remoteForm] = Form.useForm<{ url: string; branch?: string }>();
  const [activeTab, setActiveTab] = useState('changes');
  const [diffOpen, setDiffOpen] = useState(false);

  // 切换站点时重置选择
  useEffect(() => {
    setSelectedFiles([]);
    setCommitMessage('');
  }, [currentSiteId]);

  /** 所有改动文件（含未跟踪） */
  const allChanges = useMemo(() => {
    if (!status) return [] as GitFileStatus[];
    return [
      ...status.staged.map((f) => ({ ...f, staged: true })),
      ...status.unstaged.map((f) => ({ ...f, staged: false })),
      ...status.untracked.map((f) => ({ ...f, staged: false })),
    ];
  }, [status]);

  const stagedCount = status?.staged.length ?? 0;
  const dirtyCount = (status?.unstaged.length ?? 0) + (status?.untracked.length ?? 0);

  const handleCommit = async () => {
    const error = validateCommitMessage(commitMessage);
    if (error) {
      message.warning(error);
      return;
    }

    if (stagedCount === 0 && dirtyCount > 0) {
      // 没有暂存内容时自动全选
      const confirmed = await new Promise<boolean>((resolve) => {
        modal.confirm({
          title: t('尚未暂存任何文件'),
          content: t('是否先暂存所有改动再提交？'),
          okText: t('暂存并提交'),
          cancelText: t('取消'),
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });

      if (!confirmed) return;
      await add();
    }

    try {
      await commit(commitMessage);
      setCommitMessage('');
      setSelectedFiles([]);
      await refresh();
    } catch {
      // 错误提示已在 useGit 内处理
    }
  };

  const handlePush = () => {
    if (!status?.remote) {
      message.warning(t('尚未配置远程仓库，请先设置'));
      setRemoteOpen(true);
      return;
    }

    modal.confirm({
      title: t('推送到远程仓库？'),
      content: (
        <div className="pt-1 text-sm">
          <div>
            {t('远程：')}
            <span className="hm-mono">{status.remote}</span>
          </div>
          <div className="mt-1">
            {t('分支：')}
            <span className="hm-mono">{status.branch ?? t('未知')}</span>
          </div>
        </div>
      ),
      okText: t('推送'),
      cancelText: t('取消'),
      onOk: () => push(),
    });
  };

  const handleRollback = (commitLog: CommitLog) => {
    modal.confirm({
      title: t('回滚到该提交？'),
      content: t('将执行 git reset --hard {hash}，之后的所有提交与其未保存的改动都会丢失。', {
        hash: commitLog.shortHash,
      }),
      okText: t('确认回滚'),
      okButtonProps: { danger: true },
      cancelText: t('取消'),
      onOk: () => useDeployStore.getState().rollback(currentSiteId as number, commitLog.hash),
    });
  };

  const fileColumns: ColumnsType<GitFileStatus> = [
    {
      title: t('文件'),
      dataIndex: 'path',
      key: 'path',
      render: (path: string) => (
        <span className="hm-mono truncate text-xs" title={path}>
          {path}
        </span>
      ),
    },
    {
      title: t('状态'),
      key: 'status',
      width: 110,
      render: (_v, file) => {
        const mark = statusMark(file.staged ? file.index : file.worktree, t);
        return (
          <Tag color={mark.color} className="m-0" style={{ fontSize: 11 }}>
            {mark.label}
          </Tag>
        );
      },
    },
    {
      title: t('暂存'),
      dataIndex: 'staged',
      key: 'staged',
      width: 70,
      render: (staged: boolean, file) =>
        staged ? (
          <CheckCircleOutlined className="text-green-600" />
        ) : (
          <Button type="link" size="small" className="!px-0" onClick={() => void add([file.path])}>
            {t('暂存')}
          </Button>
        ),
    },
    {
      title: t('操作'),
      key: 'actions',
      width: 90,
      render: (_v, file) => (
        <Tooltip title={t('放弃该文件的改动')}>
          <Popconfirm
            title={t('放弃改动？')}
            description={t('该文件的未提交修改将被还原，不可恢复。')}
            okText={t('放弃')}
            cancelText={t('取消')}
            okButtonProps={{ danger: true }}
            onConfirm={() => void discard([file.path])}
          >
            <Button type="text" size="small" danger icon={<UndoOutlined />} />
          </Popconfirm>
        </Tooltip>
      ),
    },
  ];

  return (
    <PageContainer
      title={t('Git 操作')}
      description={
        currentSite ? (
          <span>
            {currentSite.name} ·{' '}
            {status?.isRepo ? (
              <span className="hm-mono text-xs">
                {status.branch ?? t('未知分支')}
                {status.ahead > 0 ? t(' · 领先 {count}', { count: status.ahead }) : ''}
                {status.behind > 0 ? t(' · 落后 {count}', { count: status.behind }) : ''}
              </span>
            ) : (
              t('尚未初始化 Git 仓库')
            )}
          </span>
        ) : (
          t('请先选择站点')
        )
      }
      card={false}
      flush
      badge={
        status?.isRepo ? (
          status.clean ? (
            <Tag color="green" className="m-0" icon={<CheckCircleOutlined />}>
              {t('工作区干净')}
            </Tag>
          ) : (
            <Tag color="orange" className="m-0">
              {t('{count} 个改动待处理', { count: stagedCount + dirtyCount })}
            </Tag>
          )
        ) : null
      }
      extra={
        <Space>
          <Tooltip title={t('刷新状态')}>
            <Button icon={<ReloadOutlined />} onClick={() => void refresh()} loading={loading} />
          </Tooltip>
          <Button
            icon={<SettingOutlined />}
            onClick={() => {
              remoteForm.setFieldsValue({
                url: status?.remote ?? '',
                branch: status?.branch ?? 'main',
              });
              setRemoteOpen(true);
            }}
            disabled={currentSiteId === null}
          >
            {t('远程仓库')}
          </Button>
          <Button
            type="primary"
            icon={<CloudUploadOutlined />}
            onClick={handlePush}
            loading={busy}
            disabled={!status?.isRepo}
          >
            {t('推送')}
          </Button>
        </Space>
      }
    >
      {currentSiteId === null ? (
        <div className="hm-surface">
          <EmptyState
            kind="articles"
            title={t('请先选择站点')}
            description={t('在顶栏选择站点后管理其 Git 仓库')}
          />
        </div>
      ) : !status?.isRepo ? (
        <div className="hm-surface">
          <EmptyState
            kind="sites"
            title={t('该站点尚未初始化 Git 仓库')}
            description={t('初始化后即可使用版本管理功能，便于追踪改动与回滚。')}
            actionText={t('初始化 Git 仓库')}
            onAction={() => void init()}
            onRefresh={() => void refresh()}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* 状态概览 */}
          <StatGrid columns={4}>
            <StatCard
              title={t('当前分支')}
              value={status.branch ?? t('未知')}
              icon={<BranchesOutlined />}
              iconColor="#3366ff"
              footer={
                status.ahead > 0 || status.behind > 0
                  ? t('领先 {ahead} / 落后 {behind}', {
                      ahead: status.ahead,
                      behind: status.behind,
                    })
                  : t('与远程同步')
              }
            />
            <StatCard
              title={t('已暂存')}
              value={stagedCount}
              icon={<FileDoneOutlined />}
              iconColor="#52c41a"
              tooltip={t('已执行 git add 的文件数量')}
            />
            <StatCard
              title={t('未暂存')}
              value={dirtyCount}
              icon={<FileAddOutlined />}
              iconColor="#fa8c16"
              tooltip={t('已修改或未跟踪的文件数量')}
            />
            <StatCard
              title={t('提交总数')}
              value={commits.length}
              icon={<HistoryOutlined />}
              iconColor="#722ed1"
              footer={
                commits[0]
                  ? t('最近提交于 {time}', { time: formatRelative(commits[0].date) })
                  : t('暂无提交')
              }
            />
          </StatGrid>

          <Row gutter={16}>
            {/* 左：改动与提交 */}
            <Col xs={24} lg={14}>
              <Card
                size="small"
                title={
                  <Tabs
                    size="small"
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={[
                      { key: 'changes', label: t('改动 ({count})', { count: allChanges.length }) },
                      { key: 'history', label: t('历史 ({count})', { count: commits.length }) },
                    ]}
                    className="!mb-0"
                  />
                }
                styles={{ body: { padding: 0 } }}
              >
                {activeTab === 'changes' ? (
                  <>
                    {/* 批量操作 */}
                    {allChanges.length > 0 ? (
                      <div
                        className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2"
                        style={{ borderColor: 'var(--hm-border)' }}
                      >
                        <Space size={6}>
                          <Button
                            size="small"
                            icon={<PlusOutlined />}
                            onClick={() => void add()}
                            loading={busy}
                          >
                            {t('暂存全部')}
                          </Button>
                          <Button
                            size="small"
                            icon={<DiffOutlined />}
                            onClick={() => {
                              void loadDiff();
                              setDiffOpen(true);
                            }}
                          >
                            {t('查看差异')}
                          </Button>
                          <Tooltip title={t('暂存当前改动以便切换分支')}>
                            <Button
                              size="small"
                              icon={<SaveOutlined />}
                              onClick={() => void stash()}
                            >
                              {t('暂存栈')}
                            </Button>
                          </Tooltip>
                          <Tooltip title={t('恢复最近一次暂存的改动')}>
                            <Button
                              size="small"
                              icon={<RollbackOutlined />}
                              onClick={() => void stashPop()}
                            >
                              {t('恢复')}
                            </Button>
                          </Tooltip>
                        </Space>

                        <Popconfirm
                          title={t('放弃所有改动？')}
                          description={t('所有未提交的修改都会被还原，此操作不可撤销。')}
                          okText={t('全部放弃')}
                          cancelText={t('取消')}
                          okButtonProps={{ danger: true }}
                          onConfirm={() => void discard()}
                        >
                          <Button size="small" danger icon={<DeleteOutlined />}>
                            {t('放弃全部')}
                          </Button>
                        </Popconfirm>
                      </div>
                    ) : null}

                    <Table
                      rowKey="path"
                      size="small"
                      columns={fileColumns}
                      dataSource={allChanges}
                      pagination={allChanges.length > 15 ? { pageSize: 15 } : false}
                      rowSelection={{
                        selectedRowKeys: selectedFiles,
                        onChange: (keys) => setSelectedFiles(keys as string[]),
                        getCheckboxProps: (record) => ({ disabled: record.staged }),
                      }}
                      locale={{
                        emptyText: (
                          <div className="py-12 text-center">
                            <CheckCircleOutlined className="text-3xl text-green-500" />
                            <div className="mt-2 text-sm">{t('工作区干净，没有待提交的改动')}</div>
                            <div className="mt-1 text-xs hm-text-secondary">
                              {t('最近提交：')}
                              {commits[0]?.message ?? t('暂无')}
                            </div>
                          </div>
                        ),
                      }}
                    />

                    {/* 提交区 */}
                    <div
                      className="space-y-2 border-t p-3"
                      style={{ borderColor: 'var(--hm-border)' }}
                    >
                      <Input.TextArea
                        value={commitMessage}
                        onChange={(e) => setCommitMessage(e.target.value)}
                        placeholder={t('提交信息，如 feat: 新增文章《React 18 实践》')}
                        rows={2}
                        maxLength={200}
                        showCount
                      />

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Space size={4} wrap>
                          <span className="text-xs hm-text-secondary">{t('常用前缀：')}</span>
                          {[
                            { label: 'feat', desc: t('新功能') },
                            { label: 'fix', desc: t('修复') },
                            { label: 'docs', desc: t('文档') },
                            { label: 'style', desc: t('格式') },
                            { label: 'refactor', desc: t('重构') },
                            { label: 'chore', desc: t('杂项') },
                          ].map((item) => (
                            <Tooltip key={item.label} title={item.desc}>
                              <Tag
                                className="m-0 cursor-pointer hm-mono"
                                style={{ fontSize: 11 }}
                                onClick={() =>
                                  setCommitMessage((prev) =>
                                    prev.startsWith(`${item.label}:`)
                                      ? prev
                                      : `${item.label}: ${prev}`,
                                  )
                                }
                              >
                                {item.label}
                              </Tag>
                            </Tooltip>
                          ))}
                        </Space>

                        <Space size={6}>
                          <span className="text-xs hm-text-secondary">
                            {stagedCount > 0
                              ? t('将提交 {count} 个已暂存文件', { count: stagedCount })
                              : t('未暂存文件，提交时将自动暂存全部')}
                          </span>
                          <Button
                            type="primary"
                            icon={<SaveOutlined />}
                            loading={busy}
                            onClick={() => void handleCommit()}
                            disabled={!commitMessage.trim() && allChanges.length === 0}
                          >
                            {t('提交')}
                          </Button>
                        </Space>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="hm-scroll" style={{ maxHeight: 560 }}>
                    {commits.length === 0 ? (
                      <EmptyState kind="logs" compact title={t('暂无提交记录')} />
                    ) : (
                      <List
                        size="small"
                        dataSource={commits}
                        renderItem={(item: CommitLog) => (
                          <List.Item className="px-3">
                            <div className="w-full">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm">{item.message}</div>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs hm-text-secondary">
                                    <Tag
                                      className="m-0 cursor-pointer hm-mono"
                                      style={{ fontSize: 11 }}
                                      onClick={() =>
                                        void copyToClipboard(item.hash).then((ok) =>
                                          ok ? message.success(t('哈希已复制')) : undefined,
                                        )
                                      }
                                    >
                                      {item.shortHash}
                                    </Tag>
                                    <span>{item.author}</span>
                                    <span>{formatDateTime(item.date)}</span>
                                  </div>
                                </div>

                                <Popconfirm
                                  title={t('回滚到该提交？')}
                                  description={t('之后的提交会被丢弃，操作不可撤销。')}
                                  okText={t('回滚')}
                                  cancelText={t('取消')}
                                  okButtonProps={{ danger: true }}
                                  onConfirm={() => handleRollback(item)}
                                >
                                  <Tooltip title={t('回滚到此提交')}>
                                    <Button type="text" size="small" icon={<RollbackOutlined />} />
                                  </Tooltip>
                                </Popconfirm>
                              </div>
                            </div>
                          </List.Item>
                        )}
                      />
                    )}
                  </div>
                )}
              </Card>
            </Col>

            {/* 右：仓库信息 */}
            <Col xs={24} lg={10}>
              <Card size="small" title={t('仓库信息')}>
                <Descriptions
                  size="small"
                  column={1}
                  items={[
                    {
                      key: 'path',
                      label: t('仓库路径'),
                      children: (
                        <span className="hm-mono text-xs break-all">{currentSite?.path}</span>
                      ),
                    },
                    {
                      key: 'remote',
                      label: t('远程仓库'),
                      children: status.remote ? (
                        <span className="hm-mono text-xs break-all">{status.remote}</span>
                      ) : (
                        <span className="hm-text-secondary">{t('未配置')}</span>
                      ),
                    },
                    {
                      key: 'branch',
                      label: t('当前分支'),
                      children: <span className="hm-mono">{status.branch ?? t('未知')}</span>,
                    },
                    {
                      key: 'state',
                      label: t('同步状态'),
                      children:
                        status.ahead > 0 || status.behind > 0 ? (
                          <Space size={4}>
                            {status.ahead > 0 ? (
                              <Tag color="blue" className="m-0">
                                {t('领先 {count}', { count: status.ahead })}
                              </Tag>
                            ) : null}
                            {status.behind > 0 ? (
                              <Tag color="orange" className="m-0">
                                {t('落后 {count}', { count: status.behind })}
                              </Tag>
                            ) : null}
                          </Space>
                        ) : (
                          <Tag color="green" className="m-0">
                            {t('已同步')}
                          </Tag>
                        ),
                    },
                  ]}
                />

                <Divider className="my-3" />

                <Space direction="vertical" className="w-full" size={6}>
                  <Button
                    block
                    size="small"
                    icon={<CloudDownloadOutlined />}
                    onClick={() => void pull()}
                    loading={busy}
                  >
                    {t('拉取远程更新')}
                  </Button>
                  <Button
                    block
                    size="small"
                    icon={<CloudUploadOutlined />}
                    onClick={handlePush}
                    loading={busy}
                  >
                    {t('推送到远程')}
                  </Button>
                  <Button
                    block
                    size="small"
                    icon={<DiffOutlined />}
                    onClick={() => {
                      void loadDiff();
                      setDiffOpen(true);
                    }}
                  >
                    {t('查看工作区差异')}
                  </Button>
                  <Button
                    block
                    size="small"
                    icon={<FolderOpenOutlined />}
                    onClick={() => void openWithSystem(currentSite?.path ?? '')}
                  >
                    {t('打开仓库目录')}
                  </Button>
                </Space>
              </Card>

              <Card size="small" title={t('提交统计')} className="mt-4">
                <Row gutter={12}>
                  <Col span={12}>
                    <Statistic
                      title={t('提交数')}
                      value={commits.length}
                      valueStyle={{ fontSize: 18 }}
                      prefix={<HistoryOutlined className="text-brand-500" />}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title={t('参与作者')}
                      value={new Set(commits.map((c) => c.author)).size}
                      valueStyle={{ fontSize: 18 }}
                      prefix={<CodeOutlined className="text-purple-500" />}
                    />
                  </Col>
                </Row>

                {commits.length > 0 ? (
                  <div className="mt-3">
                    <div className="mb-2 text-xs hm-text-secondary">{t('最近 5 次提交')}</div>
                    <Timeline
                      items={commits.slice(0, 5).map((item) => ({
                        children: (
                          <div>
                            <div className="text-xs">{item.message}</div>
                            <div className="text-[11px] hm-text-secondary">
                              {item.shortHash} · {formatRelative(item.date)}
                            </div>
                          </div>
                        ),
                      }))}
                    />
                  </div>
                ) : null}
              </Card>

              <Alert
                className="mt-4"
                type="info"
                showIcon
                message={t('Git 工作流建议')}
                description={
                  <ul className="mt-1 mb-0 list-disc pl-4 text-xs leading-relaxed">
                    <li>{t('写作完成后先提交，再推送到远程触发 CI 部署')}</li>
                    <li>{t('提交信息建议使用「type: 描述」格式，便于生成变更日志')}</li>
                    <li>{t('推送前如提示需先拉取，说明远程有新提交，请先执行拉取')}</li>
                    <li>{t('大规模改动前可以使用「暂存栈」保存当前进度')}</li>
                  </ul>
                }
              />
            </Col>
          </Row>
        </div>
      )}

      {/* 远程仓库设置 */}
      <Modal
        open={remoteOpen}
        title={t('远程仓库设置')}
        onCancel={() => setRemoteOpen(false)}
        onOk={async () => {
          try {
            const values = await remoteForm.validateFields();
            await setRemote(values.url, values.branch);
            setRemoteOpen(false);
          } catch {
            // 校验失败
          }
        }}
        okText={t('保存')}
        cancelText={t('取消')}
        width={560}
      >
        <Form form={remoteForm} layout="vertical" className="pt-2">
          <Form.Item
            name="url"
            label={t('远程仓库地址')}
            rules={[{ required: true, message: t('请输入仓库地址') }]}
            extra={t(
              '支持 HTTPS（https://github.com/user/repo.git）与 SSH（git@github.com:user/repo.git）两种格式',
            )}
          >
            <Input placeholder="git@github.com:username/blog.git" className="hm-mono" allowClear />
          </Form.Item>

          <Form.Item
            name="branch"
            label={t('分支名称')}
            extra={t('默认 main，若仓库使用 master 请改为 master')}
          >
            <Select
              options={[
                { label: 'main', value: 'main' },
                { label: 'master', value: 'master' },
                { label: 'gh-pages', value: 'gh-pages' },
              ]}
              mode="tags"
              maxCount={1}
              placeholder="main"
            />
          </Form.Item>

          <Alert
            type="info"
            showIcon
            message={t('关于认证')}
            description={t(
              '首次推送时，Git 可能会要求输入账号密码或使用已配置的 SSH 密钥。建议提前在系统层面配置好 Git 凭据。',
            )}
          />
        </Form>
      </Modal>

      {/* 差异查看 */}
      <Modal
        open={diffOpen}
        title={t('工作区差异')}
        onCancel={() => setDiffOpen(false)}
        width={900}
        footer={
          <Space>
            <Button
              icon={<ExportOutlined />}
              onClick={async () => {
                const target = await import('@/utils/desktop').then((m) =>
                  m.pickSavePath({
                    title: t('导出差异'),
                    defaultPath: 'changes.diff',
                    filters: [{ name: 'Diff', extensions: ['diff', 'patch'] }],
                  }),
                );
                if (!target) return;
                const { fileService } = await import('@/services');
                await fileService.write(target, diff);
                message.success(t('差异已导出'));
              }}
            >
              {t('导出')}
            </Button>
            <Button onClick={() => void loadDiff()}>{t('刷新')}</Button>
            <Button type="primary" onClick={() => setDiffOpen(false)}>
              {t('关闭')}
            </Button>
          </Space>
        }
      >
        {diff ? (
          <CodeBlock code={diff} language="plaintext" maxHeight={520} lineNumbers />
        ) : (
          <div className="flex justify-center py-12">
            <Spin tip={t('正在读取差异…')} />
          </div>
        )}
      </Modal>
    </PageContainer>
  );
}

export default GitPage;
