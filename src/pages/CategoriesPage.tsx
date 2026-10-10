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
import { useI18n } from '@/i18n';

type TaxonomyKind = 'category' | 'tag';

/** 分类标签管理页面 */
export function CategoriesPage() {
  const { message, modal } = AntdApp.useApp();
  const { t } = useI18n();

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

  // 「分类 / 标签」在文案里的称呼随当前页签变化
  const kindLabel = kind === 'category' ? t('分类') : t('标签');

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

      message.success(t('重命名完成'));
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
      title: t('删除{kind}「{name}」？', { kind: kindLabel, name: item.name }),
      content: t('将从 {count} 篇文章中移除该{kind}，文章本身不会被删除。', {
        count: item.count,
        kind: kindLabel,
      }),
      okText: t('确认删除'),
      okButtonProps: { danger: true },
      cancelText: t('取消'),
      onOk: async () => {
        try {
          if (kind === 'category') await deleteCategory(currentSiteId, item.name);
          else await deleteTag(currentSiteId, item.name);
          message.success(t('已移除'));
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
        message.warning(t('请选择要合并的项'));
        return;
      }

      setBusy(true);

      for (const source of from) {
        if (source === to) continue;
        if (kind === 'category') {
          await renameCategory(currentSiteId, source, to);
        } else {
          await renameTag(currentSiteId, source, to);
        }
      }

      message.success(t('合并完成'));
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
      title={t('分类与标签')}
      description={
        currentSiteId === null
          ? t('请先在顶栏选择站点')
          : t('分类 {categories} 个 · 标签 {tags} 个', {
              categories: categories.length,
              tags: tags.length,
            })
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
            {t('合并')}
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
            {t('刷新')}
          </Button>
        </Space>
      }
    >
      {currentSiteId === null ? (
        <div className="hm-surface">
          <EmptyState
            kind="articles"
            title={t('请先选择站点')}
            description={t('在顶栏切换站点后管理分类与标签')}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* 汇总指标 */}
          <StatGrid columns={4}>
            <StatCard
              title={t('分类总数')}
              value={categories.length}
              icon={<TagsOutlined />}
              iconColor="#722ed1"
            />
            <StatCard
              title={t('标签总数')}
              value={tags.length}
              icon={<TagsOutlined />}
              iconColor="#3366ff"
            />
            <StatCard
              title={t('文章总数')}
              value={formatNumber(stats?.articleCount ?? articles.length)}
              icon={<TagsOutlined />}
              iconColor="#52c41a"
            />
            <StatCard
              title={t('平均每篇标签数')}
              value={
                (stats?.articleCount ?? articles.length) > 0
                  ? (
                      tags.reduce((sum, item) => sum + item.count, 0) /
                      (stats?.articleCount ?? articles.length)
                    ).toFixed(1)
                  : '0'
              }
              icon={<TagsOutlined />}
              iconColor="#fa8c16"
              tooltip={t('标签引用总次数 ÷ 文章总数')}
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
                      { key: 'category', label: t('分类 ({count})', { count: categories.length }) },
                      { key: 'tag', label: t('标签 ({count})', { count: tags.length }) },
                    ]}
                  />
                }
              >
                <div className="p-3">
                  <Input
                    allowClear
                    size="small"
                    prefix={<SearchOutlined className="opacity-50" />}
                    placeholder={t('搜索{kind}', { kind: kindLabel })}
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                  />
                </div>

                <div className="hm-scroll" style={{ maxHeight: 460 }}>
                  {filtered.length === 0 ? (
                    <EmptyState
                      kind={keyword ? 'search' : 'articles'}
                      compact
                      title={keyword ? t('没有匹配项') : t('暂无{kind}', { kind: kindLabel })}
                      description={
                        keyword
                          ? t('换个关键词试试')
                          : t('在文章元信息中设置分类与标签后会自动出现在这里')
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
                            <Tooltip title={t('重命名')} key="rename">
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
                            <Tooltip title={t('删除')} key="delete">
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
                                {t('{count} 篇', { count: item.count })}
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
                  {t('共 {count} 项 · 引用 {refs} 次', {
                    count: filtered.length,
                    refs: totalArticlesInList,
                  })}
                </div>
              </Card>
            </Col>

            {/* 右：关联文章 */}
            <Col xs={24} lg={13}>
              <Card
                size="small"
                title={
                  activeName
                    ? t('「{name}」下的文章', { name: activeName })
                    : t('选择左侧的{kind}查看关联文章', { kind: kindLabel })
                }
                extra={
                  activeName ? (
                    <Space size={4}>
                      <Tag color={kind === 'category' ? 'purple' : 'blue'} className="m-0">
                        {t('{count} 篇', { count: groupedArticles.length })}
                      </Tag>
                      <Button size="small" type="text" onClick={() => setActiveName(null)}>
                        {t('清除选择')}
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
                          {t('点击左侧列表项查看该{kind}下的所有文章', { kind: kindLabel })}
                        </span>
                      }
                    />
                  </div>
                ) : articlesLoading ? (
                  <div className="p-4 text-center text-sm hm-text-secondary">{t('加载中…')}</div>
                ) : groupedArticles.length === 0 ? (
                  <EmptyState
                    kind="articles"
                    compact
                    title={t('没有关联文章')}
                    description={t('该{kind}下暂无文章（可能是文章列表未加载完整）', {
                      kind: kindLabel,
                    })}
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
                                {t('草稿')}
                              </Tag>
                            ) : null}
                          </div>
                          <div className="mt-0.5 flex items-center gap-3 text-xs hm-text-secondary">
                            <span>{t('{count} 字', { count: article.wordCount })}</span>
                            {article.categories.length > 0 ? (
                              <span>
                                {t('分类：{list}', {
                                  list: `${article.categories.slice(0, 2).join('、')}${
                                    article.categories.length > 2 ? '…' : ''
                                  }`,
                                })}
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
                <Card size="small" title={t('标签云')} className="mt-4">
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
                <Card size="small" title={t('分类层级')} className="mt-4">
                  <Alert
                    className="mb-3"
                    type="info"
                    showIcon
                    message={t('Hexo 支持多级分类')}
                    description={t(
                      '在文章的 categories 中使用「父级/子级」写法即可建立层级，此处按名称扁平展示。',
                    )}
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
            message={t('操作说明')}
            description={
              <ul className="mt-1 mb-0 list-disc pl-4 text-xs leading-relaxed">
                <li>
                  {t('重命名会把所有涉及该{kind}的文章批量更新为新的名称', { kind: kindLabel })}
                </li>
                <li>{t('合并功能等价于把多个源项依次重命名为目标项，适合清理拼写不统一的标签')}</li>
                <li>{t('删除操作只会从文章元信息中移除该{kind}，不会删除文章', { kind: kindLabel })}</li>
              </ul>
            }
          />
        </div>
      )}

      {/* 重命名弹窗 */}
      <Modal
        open={renaming !== null}
        title={t('重命名{kind}', { kind: renaming?.kind === 'category' ? t('分类') : t('标签') })}
        onCancel={() => setRenaming(null)}
        onOk={() => void handleRename()}
        confirmLoading={busy}
        okText={t('确认重命名')}
        cancelText={t('取消')}
        width={460}
      >
        <Form form={renameForm} layout="vertical" className="pt-2">
          <Form.Item label={t('原名称')}>
            <Input value={renaming?.name} disabled className="hm-mono" />
          </Form.Item>
          <Form.Item
            name="newName"
            label={t('新名称')}
            rules={[
              { required: true, message: t('请输入新名称') },
              { max: 60, message: t('名称不能超过 60 个字符') },
            ]}
          >
            <Input autoFocus className="hm-mono" placeholder={t('请输入新的名称')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 合并弹窗 */}
      <Modal
        open={merging}
        title={t('合并{kind}', { kind: kindLabel })}
        onCancel={() => setMerging(false)}
        onOk={() => void handleMerge()}
        confirmLoading={busy}
        okText={t('开始合并')}
        cancelText={t('取消')}
        width={520}
      >
        <Form form={mergeForm} layout="vertical" className="pt-2">
          <Alert
            className="mb-3"
            type="warning"
            showIcon
            message={t('合并操作会批量修改文章')}
            description={t('合并后，所有使用源项的文章都会改用目标名称，源项将不再存在。')}
          />

          <Form.Item
            name="from"
            label={t('要合并的{kind}', { kind: kindLabel })}
            rules={[{ required: true, message: t('请选择至少一项') }]}
          >
            <Select
              mode="multiple"
              placeholder={t('选择要合并掉的项')}
              options={currentList.map((item) => ({
                label: `${item.name} (${item.count})`,
                value: item.name,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="to"
            label={t('合并到（目标名称）')}
            rules={[{ required: true, message: t('请填写或选择目标名称') }]}
          >
            <Select
              showSearch
              placeholder={t('选择已有项或输入新名称')}
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
            {t('当前占比：{percent} 的项被搜索条件筛出', {
              percent: formatPercent(filtered.length, currentList.length),
            })}
          </div>
        </Form>
      </Modal>
    </PageContainer>
  );
}

export default CategoriesPage;
