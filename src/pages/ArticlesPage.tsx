/** 文章管理：列表 + Monaco 编辑器 + 实时预览 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  App as AntdApp,
  Button,
  Checkbox,
  Divider,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Radio,
  Segmented,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Timeline,
  Tooltip,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  BgColorsOutlined,
  ClockCircleOutlined,
  EditOutlined,
  EyeOutlined,
  FileAddOutlined,
  HistoryOutlined,
  ImportOutlined,
  LayoutOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  SearchOutlined,
  SplitCellsOutlined,
  ThunderboltOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import {
  ArticleListItem,
  CodeEditor,
  EmptyState,
  ErrorState,
  FrontMatterTemplatesPanel,
  MarkdownPreview,
  PageContainer,
  SkeletonTable,
  TagInput,
} from '@/components';
import { useArticleEditor, useArticleHistory, useArticles } from '@/hooks';
import { useArticleStore, useSiteStore, useTemplateStore } from '@/stores';
import { articleService } from '@/services';
import type { Article, TemplateBodyMode, UpdateArticleInput } from '@/types';
import { formatDateTime, formatRelative, truncate } from '@/utils/format';
import { countWords, extractExcerpt } from '@/utils/markdown';
import { pickFiles } from '@/utils/desktop';

type EditorLayout = 'edit' | 'split' | 'preview';

/** 记住上次选用的模板，下次新建文章时默认带上 */
const LAST_TEMPLATE_KEY = 'hexo-manager:last-front-matter-template';

function readLastTemplateId(): number | null {
  try {
    const raw = localStorage.getItem(LAST_TEMPLATE_KEY);
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

function writeLastTemplateId(id: number | null) {
  try {
    if (id === null) localStorage.removeItem(LAST_TEMPLATE_KEY);
    else localStorage.setItem(LAST_TEMPLATE_KEY, String(id));
  } catch {
    // localStorage 不可用时忽略
  }
}

/** 文章管理页面 */
export function ArticlesPage() {
  const { message, modal } = AntdApp.useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  const currentSiteId = useSiteStore((s) => s.currentSiteId);
  const { articles, total, page, limit, loading, error, query, setQuery, paginate, refresh } =
    useArticles({ autoFetch: true });

  const categories = useArticleStore((s) => s.categories);
  const tags = useArticleStore((s) => s.tags);
  const fetchTaxonomies = useArticleStore((s) => s.fetchTaxonomies);
  const createArticle = useArticleStore((s) => s.createArticle);
  const deleteArticle = useArticleStore((s) => s.deleteArticle);
  const publishArticle = useArticleStore((s) => s.publishArticle);
  const unpublishArticle = useArticleStore((s) => s.unpublishArticle);
  const saveArticle = useArticleStore((s) => s.saveArticle);
  const importArticles = useArticleStore((s) => s.importArticles);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [layout, setLayout] = useState<EditorLayout>('split');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTemplateId, setNewTemplateId] = useState<number | null>(() => readLastTemplateId());
  const [creating, setCreating] = useState(false);
  const [autoSave, setAutoSave] = useState(true);

  // ---- Front Matter 模板 ----
  const templates = useTemplateStore((s) => s.templates);
  const fetchTemplates = useTemplateStore((s) => s.fetchTemplates);
  const applyTemplate = useTemplateStore((s) => s.applyTemplate);
  const markTemplateUsed = useTemplateStore((s) => s.markUsed);
  const [templateManageOpen, setTemplateManageOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyTemplateId, setApplyTemplateId] = useState<number | null>(null);
  const [applyOverwrite, setApplyOverwrite] = useState(false);
  const [applyBodyMode, setApplyBodyMode] = useState<TemplateBodyMode>('none');
  const [applying, setApplying] = useState(false);

  const [metaForm] = Form.useForm<UpdateArticleInput>();

  const { draft, dirty, saving, patch, reset, reload } = useArticleEditor(editingId);
  const { history, loading: historyLoading } = useArticleHistory(historyOpen ? editingId : null);

  const autoSaveTimer = useRef<number | null>(null);
  const lastSavedRef = useRef<string>('');

  // 进入页面时拉取分类、标签与模板
  useEffect(() => {
    if (currentSiteId !== null) void fetchTaxonomies(currentSiteId);
  }, [currentSiteId, fetchTaxonomies]);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  // 模板加载完成后校正「上次使用」的选择（模板可能已被删除）
  useEffect(() => {
    if (templates.length === 0) return;
    setNewTemplateId((prev) => {
      if (prev !== null && templates.some((t) => t.id === prev)) return prev;
      const fallback = readLastTemplateId();
      return fallback !== null && templates.some((t) => t.id === fallback) ? fallback : null;
    });
  }, [templates]);

  // 支持 URL 直接打开某篇文章
  useEffect(() => {
    const articleParam = searchParams.get('article');
    if (articleParam) {
      const id = Number(articleParam);
      if (Number.isFinite(id)) {
        setEditingId(id);
        setEditorOpen(true);
      }
      searchParams.delete('article');
      setSearchParams(searchParams, { replace: true });
      return;
    }

    if (searchParams.get('action') === 'new') {
      setCreating(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // 草稿内容同步到元信息表单
  useEffect(() => {
    if (draft && editorOpen) {
      metaForm.setFieldsValue({
        title: draft.title,
        excerpt: draft.excerpt ?? '',
        categories: draft.categories ?? [],
        tags: draft.tags ?? [],
        coverImage: draft.coverImage ?? '',
        isTop: draft.isTop ?? false,
        allowComment: draft.allowComment ?? true,
        status: draft.status,
      });
      lastSavedRef.current = draft.content ?? '';
    }
  }, [draft, editorOpen, metaForm]);

  const fullContent = useMemo(() => {
    if (!draft) return '';
    return draft.content ?? '';
  }, [draft]);

  const wordCount = useMemo(() => countWords(fullContent), [fullContent]);

  /** 执行保存 */
  const doSave = useCallback(
    async (silent = false) => {
      if (editingId === null) return;

      const values = metaForm.getFieldsValue();
      const updates: UpdateArticleInput = {
        title: values.title ?? draft.title,
        content: draft.content ?? '',
        excerpt: values.excerpt || extractExcerpt(draft.content ?? ''),
        categories: values.categories ?? [],
        tags: values.tags ?? [],
        coverImage: values.coverImage ?? '',
        isTop: values.isTop ?? false,
        allowComment: values.allowComment ?? true,
        status: values.status ?? draft.status,
      };

      try {
        await saveArticle(editingId, updates, { silent });
        lastSavedRef.current = updates.content ?? '';
        if (!silent) {
          message.success('文章已保存');
          await fetchTaxonomies(currentSiteId as number);
        }
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
      }
    },
    [editingId, metaForm, draft, saveArticle, message, fetchTaxonomies, currentSiteId],
  );

  // 自动保存
  useEffect(() => {
    if (!autoSave || !dirty || editingId === null || !editorOpen) return;

    if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = window.setTimeout(() => {
      if ((draft.content ?? '') !== lastSavedRef.current) {
        void doSave(true);
      }
    }, 30000);

    return () => {
      if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
    };
  }, [autoSave, dirty, editingId, editorOpen, draft.content, doSave]);

  // Ctrl+S 保存
  useEffect(() => {
    if (!editorOpen) return;

    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void doSave(false);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editorOpen, doSave]);

  const handleOpen = (article: Article) => {
    setEditingId(article.id);
    setEditorOpen(true);
  };

  const handleCreate = async () => {
    if (currentSiteId === null) {
      message.warning('请先选择站点');
      return;
    }
    if (!newTitle.trim()) {
      message.warning('请输入文章标题');
      return;
    }

    try {
      const article = await createArticle(currentSiteId, newTitle.trim(), {
        templateId: newTemplateId,
      });
      if (newTemplateId !== null) markTemplateUsed(newTemplateId);
      writeLastTemplateId(newTemplateId);
      message.success(newTemplateId ? '文章已创建并套用模板' : '文章已创建');
      setCreating(false);
      setNewTitle('');
      setEditingId(article.id);
      setEditorOpen(true);
      await fetchTaxonomies(currentSiteId);
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleCreateDraft = async () => {
    if (currentSiteId === null) return;
    if (!newTitle.trim()) {
      message.warning('请输入文章标题');
      return;
    }

    try {
      const article = await createArticle(currentSiteId, newTitle.trim(), {
        isDraft: true,
        templateId: newTemplateId,
      });
      if (newTemplateId !== null) markTemplateUsed(newTemplateId);
      writeLastTemplateId(newTemplateId);
      message.success(newTemplateId ? '草稿已创建并套用模板' : '草稿已创建');
      setCreating(false);
      setNewTitle('');
      setEditingId(article.id);
      setEditorOpen(true);
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  /** 打开「套用模板」对话框 */
  const openApplyDialog = () => {
    setApplyTemplateId(newTemplateId ?? templates[0]?.id ?? null);
    setApplyOverwrite(false);
    setApplyBodyMode('none');
    setApplyOpen(true);
  };

  /** 把模板套用到当前编辑的文章（后端直接改文件，需整体重载草稿） */
  const handleApplyTemplate = async () => {
    if (editingId === null) return;
    if (applyTemplateId === null) {
      message.warning('请选择要套用的模板');
      return;
    }

    setApplying(true);
    try {
      const result = await applyTemplate({
        articleId: editingId,
        templateId: applyTemplateId,
        overwrite: applyOverwrite,
        bodyMode: applyBodyMode,
      });

      await reload();
      writeLastTemplateId(applyTemplateId);
      setApplyOpen(false);

      const parts: string[] = [];
      if (result.appliedFields.length > 0) {
        parts.push(`字段 ${result.appliedFields.map((f) => f).join('、')}`);
      }
      if (result.bodyChanged) parts.push('正文骨架');

      if (parts.length === 0) {
        message.info('模板已套用，但所有字段都已存在且正文未改动');
      } else {
        message.success(`已套用模板：写入${parts.join('，')}`);
      }
      await fetchTaxonomies(currentSiteId as number);
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  };

  const handleDelete = (article: Article) => {
    modal.confirm({
      title: '删除文章？',
      content: `「${truncate(article.title, 30)}」将被永久删除，此操作不可撤销。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteArticle(article.id);
          message.success('文章已删除');
          if (editingId === article.id) {
            setEditorOpen(false);
            setEditingId(null);
          }
        } catch (e) {
          message.error(e instanceof Error ? e.message : String(e));
        }
      },
    });
  };

  const handlePublish = async (article: Article) => {
    try {
      await publishArticle(article.id);
      message.success('文章已发布');
      await fetchTaxonomies(currentSiteId as number);
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleUnpublish = async (article: Article) => {
    try {
      await unpublishArticle(article.id);
      message.success('已转为草稿');
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDuplicate = async (article: Article) => {
    if (currentSiteId === null) return;
    try {
      const created = await articleService.create(currentSiteId, `${article.title} 副本`);
      await articleService.update(created.id, {
        content: article.content ?? '',
        categories: article.categories,
        tags: article.tags,
        status: 'draft',
      });
      message.success('文章副本已创建（草稿状态）');
      await refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleImport = async () => {
    if (currentSiteId === null) {
      message.warning('请先选择站点');
      return;
    }

    const files = await pickFiles({
      title: '选择要导入的 Markdown 文件',
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mkd'] }],
    });
    if (files.length === 0) return;

    setImporting(true);
    try {
      const count = await importArticles(currentSiteId, files);
      message.success(`成功导入 ${count} 篇文章`);
      await fetchTaxonomies(currentSiteId);
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  const handleCloseEditor = () => {
    if (dirty) {
      modal.confirm({
        title: '有未保存的修改',
        content: '关闭编辑器将丢失未保存的内容，确定继续吗？',
        okText: '放弃修改',
        okButtonProps: { danger: true },
        cancelText: '继续编辑',
        onOk: () => {
          setEditorOpen(false);
          setEditingId(null);
        },
      });
      return;
    }
    setEditorOpen(false);
    setEditingId(null);
  };

  const subMenu: MenuProps['items'] = [
    { key: 'post', label: '新建文章', icon: <FileAddOutlined /> },
    { key: 'draft', label: '新建草稿', icon: <EditOutlined /> },
  ];

  const statusFilter = query.status ?? 'all';

  return (
    <PageContainer
      title="文章管理"
      description={
        currentSiteId === null
          ? '请先在顶栏选择站点'
          : `共 ${total} 篇${
              query.status === 'draft'
                ? '草稿'
                : query.status === 'published'
                  ? '已发布文章'
                  : '文章'
            }`
      }
      card={false}
      flush
      extra={
        <Space>
          <Tooltip title="维护写新文章时常用的 Front Matter 字段">
            <Button
              icon={<ThunderboltOutlined />}
              onClick={() => {
                setTemplateManageOpen(true);
                void fetchTemplates({ force: true });
              }}
            >
              写作模板
            </Button>
          </Tooltip>
          <Button
            icon={<ImportOutlined />}
            onClick={() => void handleImport()}
            loading={importing}
            disabled={currentSiteId === null}
          >
            导入 Markdown
          </Button>
          <Dropdown.Button
            type="primary"
            icon={<FileAddOutlined />}
            menu={{
              items: subMenu,
              onClick: ({ key }) => {
                setCreating(true);
                if (key === 'draft') setNewTitle('');
              },
            }}
            onClick={() => setCreating(true)}
            disabled={currentSiteId === null}
          >
            新建文章
          </Dropdown.Button>
        </Space>
      }
    >
      <div className="flex h-full gap-4">
        {/* 左侧：筛选 + 列表 */}
        <div className="hm-surface flex w-[400px] shrink-0 flex-col overflow-hidden">
          {/* 筛选区 */}
          <div className="space-y-3 border-b p-4" style={{ borderColor: 'var(--hm-border)' }}>
            <Input
              allowClear
              placeholder="搜索标题、内容"
              prefix={<SearchOutlined className="opacity-50" />}
              value={query.query ?? ''}
              onChange={(e) => void setQuery({ query: e.target.value })}
            />

            <Segmented
              block
              size="small"
              value={statusFilter}
              onChange={(v) => void setQuery({ status: v === 'all' ? undefined : String(v) })}
              options={[
                { label: '全部', value: 'all' },
                { label: '已发布', value: 'published' },
                { label: '草稿', value: 'draft' },
              ]}
            />

            <Space size={8} className="w-full">
              <Select
                size="small"
                allowClear
                placeholder="全部分类"
                style={{ width: 140 }}
                value={query.category}
                onChange={(v) => void setQuery({ category: v })}
                options={categories.map((c) => ({
                  label: `${c.name} (${c.count})`,
                  value: c.name,
                }))}
              />
              <Select
                size="small"
                allowClear
                placeholder="全部标签"
                style={{ width: 140 }}
                value={query.tag}
                onChange={(v) => void setQuery({ tag: v })}
                options={tags.map((t) => ({ label: `${t.name} (${t.count})`, value: t.name }))}
              />
              <Tooltip title="刷新">
                <Button
                  size="small"
                  type="text"
                  icon={<ReloadOutlined />}
                  onClick={() => void refresh()}
                />
              </Tooltip>
            </Space>
          </div>

          {/* 文章列表 */}
          <div className="flex-1 overflow-auto">
            {currentSiteId === null ? (
              <EmptyState
                kind="articles"
                compact
                title="请先选择站点"
                description="在顶栏切换站点后查看其文章"
              />
            ) : loading && articles.length === 0 ? (
              <div className="p-4">
                <SkeletonTable rows={6} />
              </div>
            ) : error && articles.length === 0 ? (
              <div className="p-4">
                <ErrorState compact message={error} onRetry={() => void refresh()} />
              </div>
            ) : articles.length === 0 ? (
              <EmptyState
                kind={query.query || query.category || query.tag ? 'search' : 'articles'}
                compact
                actionText={query.query ? undefined : '新建文章'}
                onAction={query.query ? undefined : () => setCreating(true)}
              />
            ) : (
              articles.map((article) => (
                <ArticleListItem
                  key={article.id}
                  article={article}
                  active={article.id === editingId}
                  dirty={article.id === editingId && dirty}
                  onOpen={handleOpen}
                  onPublish={(a) => void handlePublish(a)}
                  onUnpublish={(a) => void handleUnpublish(a)}
                  onDuplicate={(a) => void handleDuplicate(a)}
                  onDelete={handleDelete}
                />
              ))
            )}
          </div>

          {/* 分页 */}
          {total > limit ? (
            <div
              className="flex items-center justify-between border-t px-4 py-2 text-xs hm-text-secondary"
              style={{ borderColor: 'var(--hm-border)' }}
            >
              <span>
                第 {page} 页 · 共 {Math.ceil(total / limit)} 页
              </span>
              <Space size={4}>
                <Button
                  size="small"
                  type="text"
                  disabled={page <= 1}
                  onClick={() => void paginate(page - 1)}
                >
                  上一页
                </Button>
                <Button
                  size="small"
                  type="text"
                  disabled={page >= Math.ceil(total / limit)}
                  onClick={() => void paginate(page + 1)}
                >
                  下一页
                </Button>
              </Space>
            </div>
          ) : null}
        </div>

        {/* 右侧：编辑器 / 引导 */}
        <div className="hm-surface flex min-w-0 flex-1 flex-col overflow-hidden">
          {!editorOpen || editingId === null ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <div>
                    <div className="text-base">选择一篇文章开始编辑</div>
                    <div className="mt-1 text-xs hm-text-secondary">
                      支持实时 Markdown 预览、自动保存（Ctrl/Cmd + S 手动保存）
                    </div>
                  </div>
                }
              >
                <Space>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => setCreating(true)}
                    disabled={currentSiteId === null}
                  >
                    新建文章
                  </Button>
                  <Button
                    icon={<ImportOutlined />}
                    onClick={() => void handleImport()}
                    disabled={currentSiteId === null}
                  >
                    导入
                  </Button>
                </Space>
              </Empty>
            </div>
          ) : (
            <>
              {/* 编辑器工具条 */}
              <div
                className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2"
                style={{ borderColor: 'var(--hm-border)' }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Input
                    variant="borderless"
                    value={draft.title ?? ''}
                    onChange={(e) => patch({ title: e.target.value })}
                    placeholder="文章标题"
                    className="!px-0 text-base font-medium"
                    style={{ width: 260 }}
                  />
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
                  <Segmented
                    size="small"
                    value={layout}
                    onChange={(v) => setLayout(v as EditorLayout)}
                    options={[
                      { label: '编辑', value: 'edit', icon: <EditOutlined /> },
                      { label: '分栏', value: 'split', icon: <SplitCellsOutlined /> },
                      { label: '预览', value: 'preview', icon: <EyeOutlined /> },
                    ]}
                  />

                  <Tooltip title="套用 Front Matter 模板">
                    <Button
                      size="small"
                      icon={<ThunderboltOutlined />}
                      onClick={openApplyDialog}
                      disabled={templates.length === 0}
                    />
                  </Tooltip>
                  <Tooltip title="文章元信息">
                    <Button
                      size="small"
                      icon={<LayoutOutlined />}
                      onClick={() => setMetaOpen(true)}
                    />
                  </Tooltip>
                  <Tooltip title="历史版本">
                    <Button
                      size="small"
                      icon={<HistoryOutlined />}
                      onClick={() => setHistoryOpen(true)}
                    />
                  </Tooltip>
                  <Tooltip title="重新加载（丢弃未保存修改）">
                    <Button
                      size="small"
                      icon={<UndoOutlined />}
                      onClick={() => {
                        reset();
                        message.info('已恢复到上次保存的版本');
                      }}
                      disabled={!dirty}
                    />
                  </Tooltip>
                  <Tooltip title={autoSave ? '自动保存已开启' : '自动保存已关闭'}>
                    <Button
                      size="small"
                      type={autoSave ? 'primary' : 'default'}
                      ghost={autoSave}
                      icon={<ClockCircleOutlined />}
                      onClick={() => {
                        setAutoSave((v) => !v);
                        message.info(autoSave ? '已关闭自动保存' : '已开启自动保存（30 秒）');
                      }}
                    />
                  </Tooltip>
                  <Button
                    size="small"
                    type="primary"
                    icon={<SaveOutlined />}
                    loading={saving}
                    onClick={() => void doSave(false)}
                  >
                    保存
                  </Button>
                  <Button size="small" onClick={handleCloseEditor}>
                    关闭
                  </Button>
                </Space>
              </div>

              {/* 编辑区 */}
              <div className="flex min-h-0 flex-1">
                {layout !== 'preview' ? (
                  <div
                    className={`min-w-0 ${layout === 'split' ? 'w-1/2 border-r' : 'flex-1'}`}
                    style={{ borderColor: 'var(--hm-border)' }}
                  >
                    <CodeEditor
                      value={fullContent}
                      onChange={(value) => patch({ content: value })}
                      language="markdown"
                      height="100%"
                      wordWrap
                      className="h-full !rounded-none !border-0"
                    />
                  </div>
                ) : null}

                {layout !== 'edit' ? (
                  <div className={`min-w-0 ${layout === 'split' ? 'w-1/2' : 'flex-1'}`}>
                    <div className="hm-scroll h-full p-4">
                      <MarkdownPreview content={fullContent} />
                    </div>
                  </div>
                ) : null}
              </div>

              {/* 状态栏 */}
              <div
                className="flex items-center justify-between border-t px-4 py-1.5 text-xs hm-text-secondary"
                style={{ borderColor: 'var(--hm-border)' }}
              >
                <Space size={12}>
                  <span>{wordCount} 字</span>
                  <span>{fullContent.length} 字符</span>
                  <span>{fullContent.split('\n').length} 行</span>
                  {draft.slug ? <span className="hm-mono">{draft.slug}</span> : null}
                </Space>
                <Space size={12}>
                  <span>{draft.status === 'draft' ? '草稿' : '已发布'}</span>
                  <span>更新于 {formatRelative(draft.updatedAt)}</span>
                </Space>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 新建文章弹窗 */}
      <Modal
        open={creating}
        title="新建文章"
        onCancel={() => {
          setCreating(false);
          setNewTitle('');
        }}
        width={520}
        footer={
          <Space>
            <Button
              onClick={() => {
                setCreating(false);
                setNewTitle('');
              }}
            >
              取消
            </Button>
            <Button onClick={() => void handleCreateDraft()}>创建草稿</Button>
            <Button type="primary" onClick={() => void handleCreate()}>
              创建并编辑
            </Button>
          </Space>
        }
      >
        <div className="space-y-3 pt-2">
          <div>
            <div className="mb-1.5 text-sm">文章标题</div>
            <Input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onPressEnter={() => void handleCreate()}
              placeholder="如：React 18 并发特性实践"
              maxLength={120}
              showCount
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm">Front Matter 模板</span>
              <Button
                type="link"
                size="small"
                className="!px-0"
                onClick={() => setTemplateManageOpen(true)}
              >
                管理模板
              </Button>
            </div>
            <Select
              allowClear
              className="w-full"
              placeholder="不使用模板（只写入标题、日期、分类、标签）"
              value={newTemplateId ?? undefined}
              onChange={(v) => {
                setNewTemplateId(v ?? null);
                writeLastTemplateId(v ?? null);
              }}
              options={templates.map((t) => ({
                value: t.id,
                label: (
                  <span className="flex items-center gap-2">
                    <span>{t.icon || '📄'}</span>
                    <span>{t.name}</span>
                    {t.description ? (
                      <span className="truncate text-xs opacity-60">{t.description}</span>
                    ) : null}
                  </span>
                ),
              }))}
            />
            {(() => {
              const selected = templates.find((t) => t.id === newTemplateId);
              if (!selected) return null;
              const keys = Object.keys(selected.fields ?? {});
              return (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {keys.length === 0 ? (
                    <span className="text-xs hm-text-secondary">该模板没有自定义字段</span>
                  ) : (
                    keys.map((k) => (
                      <Tag key={k} className="m-0 hm-mono" style={{ fontSize: 11 }}>
                        {k}
                      </Tag>
                    ))
                  )}
                  {selected.body ? (
                    <Tag color="blue" className="m-0" style={{ fontSize: 11 }}>
                      含正文骨架
                    </Tag>
                  ) : null}
                </div>
              );
            })()}
          </div>

          <Alert
            type="info"
            showIcon
            message="文件将创建在 source/_posts 目录下"
            description="标题会自动转换为 URL 友好的文件名（保留中文）。创建后可在编辑器中补充分类、标签与正文。"
          />

          {categories.length > 0 ? (
            <div>
              <div className="mb-1.5 text-xs hm-text-secondary">已有分类（仅供参考）</div>
              <Space size={4} wrap>
                {categories.slice(0, 10).map((c) => (
                  <Tag key={c.name} className="m-0" style={{ fontSize: 11 }}>
                    {c.name}
                  </Tag>
                ))}
              </Space>
            </div>
          ) : null}
        </div>
      </Modal>

      {/* 套用模板对话框 */}
      <Modal
        open={applyOpen}
        title="套用 Front Matter 模板"
        width={560}
        onCancel={() => setApplyOpen(false)}
        footer={
          <Space>
            <Button onClick={() => setApplyOpen(false)}>取消</Button>
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              loading={applying}
              disabled={applyTemplateId === null}
              onClick={() => void handleApplyTemplate()}
            >
              套用
            </Button>
          </Space>
        }
      >
        <div className="space-y-4 pt-2">
          <div>
            <div className="mb-1.5 text-sm">选择模板</div>
            <Select
              className="w-full"
              placeholder="请选择模板"
              value={applyTemplateId ?? undefined}
              onChange={(v) => setApplyTemplateId(v)}
              options={templates.map((t) => ({
                value: t.id,
                label: `${t.icon || '📄'} ${t.name}${t.description ? ` · ${t.description}` : ''}`,
              }))}
            />
          </div>

          {(() => {
            const selected = templates.find((t) => t.id === applyTemplateId);
            if (!selected) return null;
            const entries = Object.entries(selected.fields ?? {});
            return (
              <div>
                <div className="mb-1.5 text-sm">将写入的字段</div>
                {entries.length === 0 ? (
                  <div className="text-xs hm-text-secondary">该模板没有自定义字段</div>
                ) : (
                  <div className="max-h-40 space-y-1 overflow-auto rounded border p-2" style={{ borderColor: 'var(--hm-border)' }}>
                    {entries.map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-3 text-xs">
                        <span className="hm-mono">{k}</span>
                        <span className="hm-mono truncate hm-text-secondary">
                          {JSON.stringify(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          <Checkbox
            checked={applyOverwrite}
            onChange={(e) => setApplyOverwrite(e.target.checked)}
          >
            <span className="text-sm">覆盖已有同名字段</span>
            <div className="text-xs hm-text-secondary">
              不勾选时只补齐缺失或为空的字段，已有内容一律保留
            </div>
          </Checkbox>

          <div>
            <div className="mb-1.5 text-sm">正文处理</div>
            <Radio.Group
              value={applyBodyMode}
              onChange={(e) => setApplyBodyMode(e.target.value as TemplateBodyMode)}
            >
              <Space direction="vertical" size={4}>
                <Radio value="none">
                  <span className="text-sm">保持正文不变</span>
                  <span className="ml-2 text-xs hm-text-secondary">推荐</span>
                </Radio>
                <Radio value="append">
                  <span className="text-sm">在正文末尾追加骨架</span>
                </Radio>
                <Radio value="replace">
                  <span className="text-sm">用骨架替换正文</span>
                  <span className="ml-2 text-xs text-orange-500">会丢失现有内容</span>
                </Radio>
              </Space>
            </Radio.Group>
          </div>

          {dirty ? (
            <Alert
              type="warning"
              showIcon
              message="当前有未保存的改动"
              description="套用模板会直接改写磁盘文件并重新载入编辑器，未保存的正文修改将丢失。建议先保存。"
            />
          ) : null}
        </div>
      </Modal>

      {/* 模板管理抽屉 */}
      <Drawer
        open={templateManageOpen}
        onClose={() => setTemplateManageOpen(false)}
        title="写作模板"
        width={760}
        destroyOnClose
      >
        <FrontMatterTemplatesPanel />
      </Drawer>

      {/* 元信息抽屉 */}
      <Drawer
        open={metaOpen}
        onClose={() => setMetaOpen(false)}
        title="文章元信息"
        width={440}
        extra={
          <Button
            type="primary"
            size="small"
            onClick={() => {
              void doSave(false);
              setMetaOpen(false);
            }}
          >
            保存
          </Button>
        }
      >
        <Form form={metaForm} layout="vertical">
          <Form.Item name="title" label="标题">
            <Input onChange={(e) => patch({ title: e.target.value })} />
          </Form.Item>

          <Form.Item name="excerpt" label="摘要" extra="留空时将自动从正文首段提取">
            <Input.TextArea rows={3} maxLength={300} showCount />
          </Form.Item>

          <Form.Item
            name="categories"
            label="分类"
            extra="按住 Ctrl 可多选；也可直接输入新分类后回车"
          >
            <TagInput options={categories} color="purple" placeholder="选择或输入分类" />
          </Form.Item>

          <Form.Item name="tags" label="标签">
            <TagInput options={tags} color="blue" placeholder="选择或输入标签" />
          </Form.Item>

          <Form.Item name="coverImage" label="封面图" extra="图片路径或外链 URL">
            <Input
              placeholder="/images/cover.jpg"
              className="hm-mono"
              prefix={<BgColorsOutlined />}
            />
          </Form.Item>

          <Divider className="my-3" />

          <Form.Item name="status" label="文章状态">
            <Select
              options={[
                { label: '已发布', value: 'published' },
                { label: '草稿', value: 'draft' },
              ]}
            />
          </Form.Item>

          <Form.Item name="isTop" label="置顶" valuePropName="checked">
            <Switch checkedChildren="置顶" unCheckedChildren="普通" />
          </Form.Item>

          <Form.Item name="allowComment" label="允许评论" valuePropName="checked">
            <Switch checkedChildren="允许" unCheckedChildren="关闭" />
          </Form.Item>

          <Divider className="my-3" />

          <div className="space-y-2 text-xs hm-text-secondary">
            <div className="flex justify-between">
              <span>文件名</span>
              <span className="hm-mono">{draft.filePath?.split('/').pop() ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Slug</span>
              <span className="hm-mono">{draft.slug ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>创建时间</span>
              <span>{formatDateTime(draft.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span>更新时间</span>
              <span>{formatDateTime(draft.updatedAt)}</span>
            </div>
            <div className="flex justify-between">
              <span>字数</span>
              <span>{wordCount}</span>
            </div>
          </div>
        </Form>
      </Drawer>

      {/* 历史版本抽屉 */}
      <Drawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="历史版本（基于 Git）"
        width={480}
      >
        {historyLoading ? (
          <div className="flex justify-center py-12">
            <Spin />
          </div>
        ) : history.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div className="text-sm hm-text-secondary">
                暂无历史记录
                <div className="mt-1 text-xs">文章所在目录需要是一个 Git 仓库，且有提交记录</div>
              </div>
            }
          />
        ) : (
          <Timeline
            items={history.map((commit) => ({
              children: (
                <div>
                  <div className="flex items-center gap-2">
                    <Tag className="m-0 hm-mono" style={{ fontSize: 11 }}>
                      {commit.shortHash}
                    </Tag>
                    <span className="text-xs hm-text-secondary">{formatRelative(commit.date)}</span>
                  </div>
                  <div className="mt-1 text-sm">{commit.message}</div>
                  <div className="mt-0.5 text-xs hm-text-secondary">{commit.author}</div>
                  <Button
                    type="link"
                    size="small"
                    className="!px-0"
                    onClick={async () => {
                      if (editingId === null) return;
                      try {
                        const content = await articleService.atCommit(editingId, commit.hash);
                        patch({ content });
                        message.success(`已载入 ${commit.shortHash} 版本内容，保存后生效`);
                        setHistoryOpen(false);
                      } catch (e) {
                        message.error(e instanceof Error ? e.message : String(e));
                      }
                    }}
                  >
                    载入此版本
                  </Button>
                </div>
              ),
            }))}
          />
        )}
      </Drawer>
    </PageContainer>
  );
}

export default ArticlesPage;
