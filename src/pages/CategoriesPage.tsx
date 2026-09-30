/** 分类与标签管理 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Tabs,
  Tag,
  Tooltip,
  Tree,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import {
  DeleteOutlined,
  EditOutlined,
  MergeCellsOutlined,
  ReloadOutlined,
  SearchOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { EmptyState, PageContainer, StatCard, StatGrid } from '@/components';
import { useArticles } from '@/hooks';
import { useArticleStore, useSiteStore } from '@/stores';
import type { Article, Category, Tag as TagItem } from '@/types';
import { formatNumber, formatPercent, truncate } from '@/utils/format';

type TaxonomyKind = 'category' | 'tag';

/** 分类标签管理页面 */
export function CategoriesPage() {
  const { message, modal } = AntdApp.useApp();

  const currentSiteId = useSiteStore((s) => s.currentSiteId);
  const stats = useSiteStore((s) => s.stats);
  const fetchStats = useSiteStore((s) => s.fetchStats);

  const categories = useArticleStore((s) => s.categories);
  const tags = useArticleStore((s) => s.tags);
  const fetchTaxonomies = useArticleStore((s) => s.fetchTaxonomies);
  const renameCategory = useArticleStore((s) => s.renameCategory);
  const renameTag = useArticleStore((s) => s.renameTag);
  const deleteCategory = useArticleStore((s) => s.deleteCategory);
  const deleteTag = useArticleStore((s) => s.deleteTag);

  const { articles, loading: articlesLoading } = useArticles();

  const [kind, setKind] = useState<TaxonomyKind>('category');
  const [keyword, setKeyword] = useState('');
  const [activeName, setActiveName] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ kind: TaxonomyKind; name: string } | null>(null);
  const [merging, setMerging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [renameForm] = Form.useForm<{ newName: string }>();
  const [mergeForm] = Form.useForm<{ from: string[]; to: string }>();

  // 首次进入与站点切换时重新拉取
  useEffect(() => {
    if (currentSiteId === null) return;
    void fetchTaxonomies(currentSiteId);
    void fetchStats(currentSiteId);
  }, [currentSiteId, fetchTaxonomies, fetchStats]);

  const currentList: (Category | TagItem)[] = kind === 'category' ? categories : tags;

  const filtered = useMemo(() => {
    if (!keyword.trim()) return currentList;
    const lower = keyword.toLowerCase();
    return currentList.filter((item) => item.name.toLowerCase().includes(lower));
  }, [currentList, keyword]);

  const maxCount = useMemo(
    () => currentList.reduce((max, item) => Math.max(max, item.count), 0),
    [currentList],
  );

  /** 按分类/标签分组的文章 */
  const groupedArticles = useMemo(() => {
    if (!activeName) return [];
    return articles.filter((article) =>
      kind === 'category'
        ? article.categories.includes(activeName)
        : article.tags.includes(activeName),
    );
  }, [articles, activeName, kind]);

  /** 分类树（支持 Hexo 的多级分类 / 父子结构） */
  const categoryTree = useMemo<DataNode[]>(() => {
    return filtered.map((item) => ({
      key: item.name,
      title: (
        <span className="flex items-center justify-between gap-2">
          <span className="truncate">{item.name}</span>
          <Tag color="purple" className="m-0" style={{ fontSize: 11 }}>
            {item.count}
          </Tag>
        </span>
      ),
    }));
  }, [filtered]);

  const handleRename = async () => {
    if (!renaming || currentSiteId === null) return;

    try {
      const { newName } = await renameForm.validateFields();
      if (newName.trim() === renaming.name) {
        setRenaming(null);
        return;
      }

      setBusy(true);
      if (renaming.kind === 'category') {
        await renameCategory(currentSiteId, renaming.name, newName.trim());
      } else {
        await renameTag(currentSiteId, renaming.name, newName.trim());
      }

      message.success('重命名完成');
      setRenaming(null);
      if (activeName === renaming.name) setActiveName(newName.trim());
    } catch (e) {
      if (e instanceof Error && e.message) message.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = (item: Category | TagItem) => {
    if (currentSiteId === null) return;

    modal.confirm({
      title: `删除${kind === 'category' ? '分类' : '标签'}「${item.name}」？`,
      content: `将从 ${item.count} 篇文章中移除该${kind === 'category' ? '分类' : '标签'}，文章本身不会被删除。`,
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          if (kind === 'category') await deleteCategory(currentSiteId, item.name);
          else await deleteTag(currentSiteId, item.name);
          message.success('已移除');
          if (activeName === item.name) setActiveName(null);
        } catch (e) {
          message.error(e instanceof Error ? e.message : String(e));
        }
      },
    });
  };

  const handleMerge = async () => {
    if (currentSiteId === null) return;

    try {
      const { from, to } = await mergeForm.validateFields();
      if (from.length === 0) {
        message.warning('请选择要合并的项');
        return;
      }

      setBusy(true);

      for (const source of from) {
        if (source === to) continue;
        if (kind === 'category') {
          // eslint-disable-next-line no-await-in-loop
          await renameCategory(currentSiteId, source, to);
        } else {
          // eslint-disable-next-line no-await-in-loop
          await renameTag(currentSiteId, source, to);
        }
      }

      message.success('合并完成');
      setMerging(false);
      mergeForm.resetFields();
      void fetchTaxonomies(currentSiteId);
      void fetchStats(currentSiteId);
    } catch (e) {
      if (e instanceof Error && e.message) message.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const totalArticlesInList = useMemo(
    () => currentList.reduce((sum, item) => sum + item.count, 0),
    [currentList],
  );

  return (
    <PageContainer
      title="分类与标签"
      description={
        currentSiteId === null
          ? '请先在顶栏选择站点'
          : `分类 ${categories.length} 个 · 标签 ${tags.length} 个`
      }
      card={false}
      flush
      extra={
        <Space>
          <Button
            icon={<MergeCellsOutlined />}
            onClick={() => setMerging(true)}
            disabled={currentSiteId === null || currentList.length < 2}
          >
            合并
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              if (currentSiteId === null) return;
              void fetchTaxonomies(currentSiteId);
              void fetchStats(currentSiteId);
            }}
            disabled={currentSiteId === null}
          >
            刷新
          </Button>
        </Space>
      }
    >
      {currentSiteId === null ? (
        <div className="hm-surface">
          <EmptyState
            kind="articles"
            title="请先选择站点"
            description="在顶栏切换站点后管理分类与标签"
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* 汇总指标 */}
          <StatGrid columns={4}>
            <StatCard
              title="分类总数"
              value={categories.length}
              icon={<TagsOutlined />}
              iconColor="#722ed1"
            />
            <StatCard
              title="标签总数"
              value={tags.length}
              icon={<TagsOutlined />}
              iconColor="#3366ff"
            />
            <StatCard
              title="文章总数"
              value={formatNumber(stats?.articleCount ?? articles.length)}
              icon={<TagsOutlined />}
              iconColor="#52c41a"
            />
            <StatCard
              title="平均每篇标签数"
              value={
                (stats?.articleCount ?? articles.length) > 0
                  ? (
                      tags.reduce((sum, t) => sum + t.count, 0) /
                      (stats?.articleCount ?? articles.length)
                    ).toFixed(1)
                  : '0'
              }
              icon={<TagsOutlined />}
              iconColor="#fa8c16"
              tooltip="标签引用总次数 ÷ 文章总数"
            />
          </StatGrid>

          <Row gutter={16}>
            {/* 左：分类/标签列表 */}
            <Col xs={24} lg={11}>
              <Card
                size="small"
                styles={{ body: { padding: 0 } }}
                title={
                  <Tabs
                    size="small"
                    activeKey={kind}
                    onChange={(key) => {
                      setKind(key as TaxonomyKind);
                      setActiveName(null);
                      setKeyword('');
                    }}
                    items={[
                      { key: 'category', label: `分类 (${categories.length})` },
                      { key: 'tag', label: `标签 (${tags.length})` },
                    ]}
                  />
                }
              >
                <div className="p-3">
                  <Input
                    allowClear
                    size="small"
                    prefix={<SearchOutlined className="opacity-50" />}
                    placeholder={`搜索${kind === 'category' ? '分类' : '标签'}`}
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                  />
                </div>

                <div className="hm-scroll" style={{ maxHeight: 460 }}>
                  {filtered.length === 0 ? (
                    <EmptyState
                      kind={keyword ? 'search' : 'articles'}
                      compact
                      title={
                        keyword ? '没有匹配项' : `暂无${kind === 'category' ? '分类' : '标签'}`
                      }
                      description={
                        keyword
                          ? '换个关键词试试'
                          : '在文章元信息中设置分类与标签后会自动出现在这里'
                      }
                    />
                  ) : (
                    <List
                      size="small"
                      dataSource={filtered}
                      renderItem={(item) => (
                        <List.Item
                          className={`cursor-pointer px-3 transition-colors ${
                            activeName === item.name ? 'bg-brand-50' : ''
                          }`}
                          onClick={() => setActiveName(item.name)}
                          actions={[
                            <Tooltip title="重命名" key="rename">
                              <Button
                                type="text"
                                size="small"
                                icon={<EditOutlined />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenaming({ kind, name: item.name });
                                  renameForm.setFieldsValue({ newName: item.name });
                                }}
                              />
                            </Tooltip>,
                            <Tooltip title="删除" key="delete">
                              <Button
                                type="text"
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(item);
                                }}
                              />
                            </Tooltip>,
                          ]}
                        >
                          <div className="w-full">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm">{item.name}</span>
                              <span className="shrink-0 text-xs hm-text-secondary">
                                {item.count} 篇
                              </span>
                            </div>
                            <Progress
                              className="!mb-0 mt-1"
                              percent={maxCount > 0 ? (item.count / maxCount) * 100 : 0}
                              showInfo={false}
                              size="small"
                              strokeColor={kind === 'category' ? '#722ed1' : '#3366ff'}
                            />
                          </div>
                        </List.Item>
                      )}
                    />
                  )}
                </div>

                <div
                  className="border-t px-3 py-2 text-xs hm-text-secondary"
                  style={{ borderColor: 'var(--hm-border)' }}
                >
                  共 {filtered.length} 项 · 引用 {totalArticlesInList} 次
                </div>
              </Card>
            </Col>

            {/* 右：关联文章 */}
            <Col xs={24} lg={13}>
              <Card
                size="small"
                title={
                  activeName
                    ? `「${activeName}」下的文章`
                    : `选择左侧的${kind === 'category' ? '分类' : '标签'}查看关联文章`
                }
                extra={
                  activeName ? (
                    <Space size={4}>
                      <Tag color={kind === 'category' ? 'purple' : 'blue'} className="m-0">
                        {groupedArticles.length} 篇
                      </Tag>
                      <Button size="small" type="text" onClick={() => setActiveName(null)}>
                        清除选择
                      </Button>
                    </Space>
                  ) : null
                }
                styles={{ body: { padding: 0, minHeight: 320, maxHeight: 520, overflow: 'auto' } }}
              >
                {!activeName ? (
                  <div className="flex h-full items-center justify-center py-16">
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={
                        <span className="text-sm hm-text-secondary">
                          点击左侧列表项查看该{kind === 'category' ? '分类' : '标签'}下的所有文章
                        </span>
                      }
                    />
                  </div>
                ) : articlesLoading ? (
                  <div className="p-4 text-center text-sm hm-text-secondary">加载中…</div>
                ) : groupedArticles.length === 0 ? (
                  <EmptyState
                    kind="articles"
                    compact
                    title="没有关联文章"
                    description="该分类下暂无文章（可能是文章列表未加载完整）"
                  />
                ) : (
                  <List
                    size="small"
                    dataSource={groupedArticles}
                    renderItem={(article: Article) => (
                      <List.Item className="px-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {truncate(article.title, 42)}
                            </span>
                            {article.status === 'draft' ? (
                              <Tag className="m-0" style={{ fontSize: 11 }}>
                                草稿
                              </Tag>
                            ) : null}
                          </div>
                          <div className="mt-0.5 flex items-center gap-3 text-xs hm-text-secondary">
                            <span>{article.wordCount} 字</span>
                            {article.categories.length > 0 ? (
                              <span>
                                分类：{article.categories.slice(0, 2).join('、')}
                                {article.categories.length > 2 ? '…' : ''}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </List.Item>
                    )}
                  />
                )}
              </Card>

              {/* 标签云 */}
              {kind === 'tag' && tags.length > 0 ? (
                <Card size="small" title="标签云" className="mt-4">
                  <Space size={[6, 8]} wrap>
                    {tags.map((tag) => {
                      const ratio = maxCount > 0 ? tag.count / maxCount : 0;
                      const fontSize = 12 + ratio * 8;
                      return (
                        <Tag
                          key={tag.name}
                          color="blue"
                          className="m-0 cursor-pointer"
                          style={{ fontSize }}
                          onClick={() => setActiveName(tag.name)}
                        >
                          {tag.name}
                          <span className="ml-1 opacity-60">{tag.count}</span>
                        </Tag>
                      );
                    })}
                  </Space>
                </Card>
              ) : null}

              {categories.length > 0 && kind === 'category' ? (
                <Card size="small" title="分类层级" className="mt-4">
                  <Alert
                    className="mb-3"
                    type="info"
                    showIcon
                    message="Hexo 支持多级分类"
                    description="在文章的 categories 中使用「父级/子级」写法即可建立层级，此处按名称扁平展示。"
                  />
                  <Tree
                    treeData={categoryTree}
                    defaultExpandAll
                    showLine
                    selectable
                    onSelect={(keys) => {
                      if (keys.length > 0) setActiveName(String(keys[0]));
                    }}
                    className="bg-transparent"
                  />
                </Card>
              ) : null}
            </Col>
          </Row>

          {/* 使用提示 */}
          <Alert
            type="info"
            showIcon
            message="操作说明"
            description={
              <ul className="mt-1 mb-0 list-disc pl-4 text-xs leading-relaxed">
                <li>
                  重命名会把所有涉及该{kind === 'category' ? '分类' : '标签'}
                  的文章批量更新为新的名称
                </li>
                <li>合并功能等价于把多个源项依次重命名为目标项，适合清理拼写不统一的标签</li>
                <li>
                  删除操作只会从文章元信息中移除该{kind === 'category' ? '分类' : '标签'}
                  ，不会删除文章
                </li>
              </ul>
            }
          />
        </div>
      )}

      {/* 重命名弹窗 */}
      <Modal
        open={renaming !== null}
        title={`重命名${renaming?.kind === 'category' ? '分类' : '标签'}`}
        onCancel={() => setRenaming(null)}
        onOk={() => void handleRename()}
        confirmLoading={busy}
        okText="确认重命名"
        cancelText="取消"
        width={460}
      >
        <Form form={renameForm} layout="vertical" className="pt-2">
          <Form.Item label="原名称">
            <Input value={renaming?.name} disabled className="hm-mono" />
          </Form.Item>
          <Form.Item
            name="newName"
            label="新名称"
            rules={[
              { required: true, message: '请输入新名称' },
              { max: 60, message: '名称不能超过 60 个字符' },
            ]}
          >
            <Input autoFocus className="hm-mono" placeholder="请输入新的名称" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 合并弹窗 */}
      <Modal
        open={merging}
        title={`合并${kind === 'category' ? '分类' : '标签'}`}
        onCancel={() => setMerging(false)}
        onOk={() => void handleMerge()}
        confirmLoading={busy}
        okText="开始合并"
        cancelText="取消"
        width={520}
      >
        <Form form={mergeForm} layout="vertical" className="pt-2">
          <Alert
            className="mb-3"
            type="warning"
            showIcon
            message="合并操作会批量修改文章"
            description="合并后，所有使用源项的文章都会改用目标名称，源项将不再存在。"
          />

          <Form.Item
            name="from"
            label={`要合并的${kind === 'category' ? '分类' : '标签'}`}
            rules={[{ required: true, message: '请选择至少一项' }]}
          >
            <Select
              mode="multiple"
              placeholder="选择要合并掉的项"
              options={currentList.map((item) => ({
                label: `${item.name} (${item.count})`,
                value: item.name,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="to"
            label="合并到（目标名称）"
            rules={[{ required: true, message: '请填写或选择目标名称' }]}
          >
            <Select
              showSearch
              placeholder="选择已有项或输入新名称"
              mode="tags"
              maxCount={1}
              options={currentList.map((item) => ({
                label: item.name,
                value: item.name,
              }))}
              onChange={(values: string[]) => {
                if (values.length > 1) mergeForm.setFieldValue('to', values.slice(-1));
              }}
            />
          </Form.Item>

          <Divider className="my-2" />

          <div className="text-xs hm-text-secondary">
            当前占比：{formatPercent(filtered.length, currentList.length)} 的项被搜索条件筛出
          </div>
        </Form>
      </Modal>
    </PageContainer>
  );
}

export default CategoriesPage;
