/** 文件管理：站点目录浏览与编辑 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App as AntdApp,
  Breadcrumb,
  Button,
  Col,
  Dropdown,
  Empty,
  Input,
  Row,
  Segmented,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import {
  AppstoreOutlined,
  CodeOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileAddOutlined,
  FileOutlined,
  FileTextOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  ReloadOutlined,
  SaveOutlined,
  SearchOutlined,
  TableOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { CodeEditor, EmptyState, FileTree, PageContainer } from '@/components';
import { useSiteStore } from '@/stores';
import { fileService, siteService } from '@/services';
import type { FileInfo, FileTreeNode } from '@/types';
import { formatDateTime, formatFileSize } from '@/utils/format';
import {
  baseName,
  dirName,
  fileExtension,
  isMarkdownFile,
  joinPath,
  relativePath,
} from '@/utils/slug';
import { openWithSystem, copyToClipboard } from '@/utils/desktop';

type ViewMode = 'list' | 'editor';

/** 根据扩展名推断编辑器语言 */
function languageOfFile(
  path: string,
): 'yaml' | 'json' | 'markdown' | 'javascript' | 'toml' | 'plaintext' {
  const ext = fileExtension(path);
  if (ext === 'yml' || ext === 'yaml') return 'yaml';
  if (ext === 'json') return 'json';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs' || ext === 'ts') return 'javascript';
  if (ext === 'toml' || ext === 'ini' || ext === 'conf') return 'toml';
  return 'plaintext';
}

/** 判断文件是否可编辑（文本类） */
function isEditable(path: string): boolean {
  const ext = fileExtension(path);
  return [
    'md',
    'markdown',
    'mdx',
    'yml',
    'yaml',
    'json',
    'js',
    'mjs',
    'cjs',
    'ts',
    'tsx',
    'jsx',
    'css',
    'scss',
    'less',
    'html',
    'htm',
    'ejs',
    'txt',
    'toml',
    'ini',
    'conf',
    'xml',
    'svg',
    'gitignore',
    'env',
  ].includes(ext);
}

/** 文件管理页面 */
export function FilesPage() {
  const { message, modal } = AntdApp.useApp();

  const currentSiteId = useSiteStore((s) => s.currentSiteId);
  const currentSite = useSiteStore((s) => s.sites.find((site) => site.id === s.currentSiteId));

  const [tree, setTree] = useState<FileTreeNode | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedDir, setSelectedDir] = useState<string | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  /** 树加载失败信息：非空时不允许回退到「目录为空」的空态，避免误导 */
  const [treeError, setTreeError] = useState<string | null>(null);

  // 编辑器状态
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [saving, setSaving] = useState(false);

  const dirty = editingFile !== null && fileContent !== originalContent;

  /** 加载站点文件树 */
  const loadTree = useCallback(async () => {
    if (currentSiteId === null) return;
    setTreeLoading(true);
    setTreeError(null);
    try {
      const result = await siteService.fileTree(currentSiteId, 3);
      setTree(result);
      // 首次加载（或原选中目录已不存在）时落到树根，避免选到一个空路径
      setSelectedDir((prev) => {
        if (prev === null) return result.path;
        let exists = false;
        const walk = (node: FileTreeNode) => {
          if (node.isDir && node.path === prev) exists = true;
          node.children.forEach(walk);
        };
        walk(result);
        return exists ? prev : result.path;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTreeError(msg);
      message.error(msg);
    } finally {
      setTreeLoading(false);
    }
  }, [currentSiteId, message]);

  /** 加载目录内容 */
  const loadDir = useCallback(
    async (dirPath: string) => {
      setFilesLoading(true);
      try {
        const result = await fileService.list(dirPath);
        setFiles(result);
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
        setFiles([]);
      } finally {
        setFilesLoading(false);
      }
    },
    [message],
  );

  useEffect(() => {
    if (currentSiteId === null) {
      setTree(null);
      setTreeError(null);
      return;
    }
    void loadTree();
  }, [currentSiteId, loadTree]);

  // 站点切换时重置目录选中，交由 loadTree 回填根目录
  useEffect(() => {
    setSelectedDir(null);
    setFiles([]);
  }, [currentSiteId]);

  useEffect(() => {
    if (selectedDir !== null) void loadDir(selectedDir);
  }, [selectedDir, loadDir]);

  const visibleFiles = useMemo(() => {
    let list = files;
    if (!showHidden) {
      list = list.filter((f) => !f.name.startsWith('.'));
    }
    if (keyword.trim()) {
      const lower = keyword.toLowerCase();
      list = list.filter((f) => f.name.toLowerCase().includes(lower));
    }
    // 目录在前，其余按名称排序
    return [...list].sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
  }, [files, showHidden, keyword]);

  const rootPath = tree?.path ?? currentSite?.path ?? '';

  const breadcrumbs = useMemo(() => {
    if (!selectedDir || !rootPath) return [];
    const relative = relativePath(selectedDir, rootPath);
    const segments = relative ? relative.split('/').filter(Boolean) : [];

    const items: { label: string; path: string }[] = [
      { label: baseName(rootPath), path: rootPath },
    ];
    let accumulated = rootPath;

    for (const segment of segments) {
      accumulated = joinPath(accumulated, segment);
      items.push({ label: segment, path: accumulated });
    }
    return items;
  }, [selectedDir, rootPath]);

  /** 打开文件 */
  const openFile = async (info: FileInfo) => {
    if (info.isDir) {
      setSelectedDir(info.path);
      return;
    }

    if (!isEditable(info.path)) {
      // 不可编辑的文件直接用系统程序打开
      try {
        await openWithSystem(info.path);
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
      }
      return;
    }

    try {
      const content = await fileService.read(info.path);
      setEditingFile(info.path);
      setFileContent(content);
      setOriginalContent(content);
      setViewMode('editor');
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  /** 保存文件 */
  const handleSave = async () => {
    if (editingFile === null) return;
    setSaving(true);
    try {
      await fileService.write(editingFile, fileContent);
      setOriginalContent(fileContent);
      message.success('文件已保存');
      await loadDir(dirName(editingFile));
      await loadTree();
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  /** 新建文件 */
  const handleCreateFile = async (dirPath: string) => {
    const nameRef = { value: '' };

    modal.confirm({
      title: '新建文件',
      width: 460,
      content: (
        <div className="pt-2">
          <div className="mb-1 text-xs hm-text-secondary">文件路径</div>
          <Input
            autoFocus
            placeholder="如 about.md 或 posts/hello.md"
            className="hm-mono"
            onChange={(e) => {
              nameRef.value = e.target.value;
            }}
          />
        </div>
      ),
      okText: '创建',
      cancelText: '取消',
      onOk: async () => {
        if (!nameRef.value.trim()) {
          message.warning('请输入文件名');
          throw new Error('未输入文件名');
        }

        const target = joinPath(dirPath, nameRef.value.trim());
        try {
          await fileService.write(target, '');
          message.success('文件已创建');
          await loadDir(dirPath);
          await loadTree();
          await openFile({
            name: baseName(target),
            path: target,
            isDir: false,
            size: 0,
            modifiedAt: null,
            extension: fileExtension(target),
          });
        } catch (e) {
          message.error(e instanceof Error ? e.message : String(e));
          throw e;
        }
      },
    });
  };

  /** 新建目录 */
  const handleCreateDir = async (dirPath: string) => {
    const nameRef = { value: '' };

    modal.confirm({
      title: '新建目录',
      width: 460,
      content: (
        <div className="pt-2">
          <div className="mb-1 text-xs hm-text-secondary">目录名称</div>
          <Input
            autoFocus
            placeholder="如 images"
            className="hm-mono"
            onChange={(e) => {
              nameRef.value = e.target.value;
            }}
          />
        </div>
      ),
      okText: '创建',
      cancelText: '取消',
      onOk: async () => {
        if (!nameRef.value.trim()) {
          message.warning('请输入目录名称');
          throw new Error('未输入目录名称');
        }

        try {
          await fileService.mkdir(joinPath(dirPath, nameRef.value.trim()));
          message.success('目录已创建');
          await loadDir(dirPath);
          await loadTree();
        } catch (e) {
          message.error(e instanceof Error ? e.message : String(e));
          throw e;
        }
      },
    });
  };

  /** 重命名 */
  const handleRename = async (info: FileInfo) => {
    const nameRef = { value: info.name };

    modal.confirm({
      title: `重命名「${info.name}」`,
      width: 460,
      content: (
        <div className="pt-2">
          <Input
            autoFocus
            defaultValue={info.name}
            className="hm-mono"
            onChange={(e) => {
              nameRef.value = e.target.value;
            }}
          />
        </div>
      ),
      okText: '重命名',
      cancelText: '取消',
      onOk: async () => {
        const nextName = nameRef.value.trim();
        if (!nextName || nextName === info.name) return;

        try {
          await fileService.rename(info.path, joinPath(dirName(info.path), nextName));
          message.success('已重命名');
          await loadDir(dirName(info.path));
          await loadTree();
        } catch (e) {
          message.error(e instanceof Error ? e.message : String(e));
          throw e;
        }
      },
    });
  };

  /** 删除 */
  const handleDelete = (info: FileInfo) => {
    modal.confirm({
      title: `删除「${info.name}」？`,
      content: info.isDir
        ? '目录必须为空才能删除，其中的文件请先单独处理。'
        : '删除后不可恢复，请确认已提交到 Git 或已备份。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await fileService.remove(info.path);
          message.success('已删除');
          if (editingFile === info.path) {
            setEditingFile(null);
            setViewMode('list');
          }
          await loadDir(selectedDir ?? dirName(info.path));
          await loadTree();
        } catch (e) {
          message.error(e instanceof Error ? e.message : String(e));
          throw e;
        }
      },
    });
  };

  const columns: ColumnsType<FileInfo> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, info) => (
        <span
          className="flex cursor-pointer items-center gap-2 hover:text-brand-500"
          onClick={() => void openFile(info)}
        >
          {info.isDir ? (
            <FolderOutlined className="text-amber-500" />
          ) : isMarkdownFile(name) ? (
            <FileTextOutlined className="text-brand-500" />
          ) : isEditable(name) ? (
            <CodeOutlined className="text-green-600" />
          ) : (
            <FileOutlined className="text-gray-400" />
          )}
          <span className="truncate">{name}</span>
        </span>
      ),
    },
    {
      title: '类型',
      key: 'type',
      width: 100,
      render: (_v, info) =>
        info.isDir ? (
          <Tag className="m-0">目录</Tag>
        ) : (
          <Tag className="m-0 hm-mono" style={{ fontSize: 11 }}>
            {fileExtension(info.name) || '无扩展名'}
          </Tag>
        ),
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: (size: number, info) =>
        info.isDir ? <span className="hm-text-secondary">—</span> : formatFileSize(size),
    },
    {
      title: '修改时间',
      dataIndex: 'modifiedAt',
      key: 'modifiedAt',
      width: 160,
      render: (value: string | null) => (
        <span className="text-xs hm-text-secondary">{formatDateTime(value)}</span>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 130,
      render: (_v, info) => (
        <Space size={2}>
          {isEditable(info.name) && !info.isDir ? (
            <Tooltip title="编辑">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => void openFile(info)}
              />
            </Tooltip>
          ) : !info.isDir ? (
            <Tooltip title="用系统程序打开">
              <Button
                type="text"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => void openWithSystem(info.path)}
              />
            </Tooltip>
          ) : null}
          <Tooltip title="重命名">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => void handleRename(info)}
            />
          </Tooltip>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                {
                  key: 'copy',
                  label: '复制路径',
                  icon: <CopyOutlined />,
                },
                ...(info.isDir
                  ? [
                      { key: 'newfile', label: '在此新建文件', icon: <FileAddOutlined /> },
                      { key: 'newdir', label: '在此新建目录', icon: <FolderAddOutlined /> },
                    ]
                  : []),
                { type: 'divider' as const },
                { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true },
              ],
              onClick: ({ key }) => {
                if (key === 'copy') {
                  void copyToClipboard(info.path).then((ok) =>
                    ok ? message.success('路径已复制') : message.error('复制失败'),
                  );
                } else if (key === 'newfile') {
                  void handleCreateFile(info.path);
                } else if (key === 'newdir') {
                  void handleCreateDir(info.path);
                } else if (key === 'delete') {
                  handleDelete(info);
                }
              },
            }}
          >
            <Button type="text" size="small" icon={<AppstoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  const treeContextMenu: MenuProps['items'] = [
    { key: 'createFile', label: '新建文件', icon: <FileAddOutlined /> },
    { key: 'createDir', label: '新建目录', icon: <FolderAddOutlined /> },
  ];

  if (currentSiteId === null) {
    return (
      <PageContainer title="文件管理">
        <EmptyState
          kind="files"
          title="请先选择站点"
          description="在顶栏选择站点后浏览其目录结构"
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="文件管理"
      description={
        <span>
          {currentSite?.name} · <span className="hm-mono text-xs">{rootPath}</span>
        </span>
      }
      card={false}
      flush
      extra={
        <Space>
          <Segmented
            value={viewMode}
            onChange={(v) => setViewMode(v as ViewMode)}
            options={[
              { label: '列表', value: 'list', icon: <TableOutlined /> },
              {
                label: '编辑器',
                value: 'editor',
                icon: <CodeOutlined />,
                disabled: editingFile === null,
              },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void loadTree()} loading={treeLoading}>
            刷新
          </Button>
          <Button icon={<FolderOpenOutlined />} onClick={() => void openWithSystem(rootPath)}>
            打开目录
          </Button>
        </Space>
      }
    >
      <Row gutter={16} className="h-full">
        {/* 左：文件树 */}
        <Col xs={24} lg={7} className="h-full">
          <div className="hm-surface h-full p-3">
            <Dropdown
              menu={{
                items: treeContextMenu,
                onClick: ({ key }) => {
                  const target = selectedDir ?? rootPath;
                  if (key === 'createFile') void handleCreateFile(target);
                  else void handleCreateDir(target);
                },
              }}
            >
              <Button size="small" block className="mb-2" icon={<FolderAddOutlined />}>
                当前目录下新建
              </Button>
            </Dropdown>

            <FileTree
              tree={tree}
              loading={treeLoading}
              selectedPath={selectedDir ?? undefined}
              onSelect={(node) => {
                setSelectedDir(node.isDir ? node.path : dirName(node.path));
                if (!node.isDir) {
                  void openFile({
                    name: node.name,
                    path: node.path,
                    isDir: false,
                    size: node.size,
                    modifiedAt: null,
                    extension: fileExtension(node.name),
                  });
                }
              }}
              onOpen={(node) =>
                void openFile({
                  name: node.name,
                  path: node.path,
                  isDir: false,
                  size: node.size,
                  modifiedAt: null,
                  extension: fileExtension(node.name),
                })
              }
              onReveal={(node) => void openWithSystem(node.path)}
              onRename={(node) =>
                void handleRename({
                  name: node.name,
                  path: node.path,
                  isDir: node.isDir,
                  size: node.size,
                  modifiedAt: null,
                  extension: fileExtension(node.name),
                })
              }
              onDelete={(node) =>
                handleDelete({
                  name: node.name,
                  path: node.path,
                  isDir: node.isDir,
                  size: node.size,
                  modifiedAt: null,
                  extension: fileExtension(node.name),
                })
              }
              onCreate={(node) => void handleCreateFile(node.path)}
              onRefresh={() => void loadTree()}
            />
          </div>
        </Col>

        {/* 右：列表 / 编辑器 */}
        <Col xs={24} lg={17} className="h-full">
          <div className="hm-surface flex h-full flex-col overflow-hidden">
            {viewMode === 'list' ? (
              <>
                {/* 路径与工具栏 */}
                <div
                  className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5"
                  style={{ borderColor: 'var(--hm-border)' }}
                >
                  <Breadcrumb
                    separator="/"
                    items={breadcrumbs.map((item) => ({
                      key: item.path,
                      title: (
                        <span
                          className={`cursor-pointer hm-mono text-xs ${
                            item.path === selectedDir ? 'text-brand-500' : ''
                          }`}
                          onClick={() => setSelectedDir(item.path)}
                        >
                          {item.label}
                        </span>
                      ),
                    }))}
                  />

                  <Space size={8}>
                    <Input
                      size="small"
                      allowClear
                      prefix={<SearchOutlined className="opacity-50" />}
                      placeholder="过滤文件"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      style={{ width: 160 }}
                    />
                    <Tooltip title="显示隐藏文件">
                      <Space size={4}>
                        <Switch size="small" checked={showHidden} onChange={setShowHidden} />
                        <span className="text-xs hm-text-secondary">隐藏文件</span>
                      </Space>
                    </Tooltip>
                    <Tooltip title="新建文件">
                      <Button
                        size="small"
                        icon={<FileAddOutlined />}
                        onClick={() => void handleCreateFile(selectedDir ?? rootPath)}
                      />
                    </Tooltip>
                    <Tooltip title="新建目录">
                      <Button
                        size="small"
                        icon={<FolderAddOutlined />}
                        onClick={() => void handleCreateDir(selectedDir ?? rootPath)}
                      />
                    </Tooltip>
                  </Space>
                </div>

                <div className="flex-1 overflow-auto">
                  <Table
                    rowKey="path"
                    size="small"
                    columns={columns}
                    dataSource={visibleFiles}
                    loading={filesLoading}
                    pagination={visibleFiles.length > 50 ? { pageSize: 50 } : false}
                    locale={{
                      emptyText: (
                        <EmptyState
                          kind={keyword ? 'search' : 'files'}
                          compact
                          onRefresh={() => void loadDir(selectedDir ?? rootPath)}
                        />
                      ),
                    }}
                  />
                </div>

                <div
                  className="border-t px-4 py-1.5 text-xs hm-text-secondary"
                  style={{ borderColor: 'var(--hm-border)' }}
                >
                  {visibleFiles.length} 项 · 目录 {visibleFiles.filter((f) => f.isDir).length} 个 ·
                  文件 {visibleFiles.filter((f) => !f.isDir).length} 个
                </div>
              </>
            ) : (
              <>
                {/* 编辑器工具条 */}
                <div
                  className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2"
                  style={{ borderColor: 'var(--hm-border)' }}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <FileTextOutlined className="text-brand-500" />
                    <span className="hm-mono truncate text-xs" title={editingFile ?? ''}>
                      {editingFile ? relativePath(editingFile, rootPath) : '未选择文件'}
                    </span>
                    {dirty ? (
                      <Tag color="orange" className="m-0" style={{ fontSize: 11 }}>
                        未保存
                      </Tag>
                    ) : (
                      <Tag color="green" className="m-0" style={{ fontSize: 11 }}>
                        已保存
                      </Tag>
                    )}
                  </div>

                  <Space size={6}>
                    {editingFile && isMarkdownFile(editingFile) ? (
                      <Button size="small" onClick={() => setViewMode('list')}>
                        返回列表
                      </Button>
                    ) : null}
                    <Button
                      size="small"
                      icon={<UndoOutlined />}
                      disabled={!dirty}
                      onClick={() => setFileContent(originalContent)}
                    >
                      撤销
                    </Button>
                    <Button
                      size="small"
                      icon={<SaveOutlined />}
                      type="primary"
                      loading={saving}
                      disabled={!dirty}
                      onClick={() => void handleSave()}
                    >
                      保存
                    </Button>
                    <Button size="small" onClick={() => setViewMode('list')}>
                      关闭
                    </Button>
                  </Space>
                </div>

                {editingFile ? (
                  <div className="min-h-0 flex-1">
                    <CodeEditor
                      value={fileContent}
                      onChange={setFileContent}
                      language={languageOfFile(editingFile)}
                      height="100%"
                      className="h-full !rounded-none !border-0"
                    />
                  </div>
                ) : (
                  <div className="flex flex-1 items-center justify-center">
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未选择文件" />
                  </div>
                )}
              </>
            )}
          </div>
        </Col>
      </Row>

      {treeLoading && !tree ? (
        <div className="flex justify-center py-8">
          <Spin />
        </div>
      ) : null}

      {treeError ? (
        <Alert
          className="mt-4"
          type="error"
          showIcon
          message="文件树加载失败"
          description={<span className="hm-mono text-xs break-all">{treeError}</span>}
          action={
            <Button size="small" onClick={() => void loadTree()}>
              重试
            </Button>
          }
        />
      ) : null}

      <Alert
        className="mt-4"
        type="info"
        showIcon
        message="文件操作提示"
        description={
          <ul className="mt-1 mb-0 list-disc pl-4 text-xs leading-relaxed">
            <li>双击文件树中的文件可直接在编辑器中打开；右键可执行重命名、删除等操作</li>
            <li>非文本文件（图片、压缩包等）会使用系统默认程序打开</li>
            <li>修改重要文件前建议先在「Git 操作」页面提交一次，便于回滚</li>
          </ul>
        }
      />
    </PageContainer>
  );
}

export default FilesPage;
