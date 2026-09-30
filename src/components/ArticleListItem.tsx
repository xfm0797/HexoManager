/** 文章列表项 */

import { Dropdown, Tag, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FireOutlined,
  MoreOutlined,
  PushpinOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import type { Article } from '@/types';
import { formatRelative, truncate } from '@/utils/format';
import { estimateReadingTime } from '@/utils/markdown';
import { TagList } from './TagInput';

interface ArticleListItemProps {
  article: Article;
  active?: boolean;
  onOpen: (article: Article) => void;
  onPublish?: (article: Article) => void;
  onUnpublish?: (article: Article) => void;
  onDuplicate?: (article: Article) => void;
  onDelete?: (article: Article) => void;
  /** 是否为当前编辑中的文章（且未保存） */
  dirty?: boolean;
}

/** 文章列表项 */
export function ArticleListItem({
  article,
  active = false,
  onOpen,
  onPublish,
  onUnpublish,
  onDuplicate,
  onDelete,
  dirty = false,
}: ArticleListItemProps) {
  const isDraft = article.status === 'draft';

  const menuItems: MenuProps['items'] = [
    { key: 'open', label: isDraft ? '编辑草稿' : '编辑文章', icon: <EditOutlined /> },
    { type: 'divider' },
    isDraft
      ? { key: 'publish', label: '发布文章', icon: <CheckCircleOutlined />, disabled: !onPublish }
      : {
          key: 'unpublish',
          label: '转为草稿',
          icon: <UndoOutlined />,
          disabled: !onUnpublish,
        },
    { key: 'duplicate', label: '复制文章', icon: <CopyOutlined />, disabled: !onDuplicate },
    { type: 'divider' },
    {
      key: 'delete',
      label: '删除文章',
      icon: <DeleteOutlined />,
      danger: true,
      disabled: !onDelete,
    },
  ];

  const handleMenuClick: MenuProps['onClick'] = ({ key, domEvent }) => {
    domEvent.stopPropagation();
    switch (key) {
      case 'open':
        onOpen(article);
        break;
      case 'publish':
        onPublish?.(article);
        break;
      case 'unpublish':
        onUnpublish?.(article);
        break;
      case 'duplicate':
        onDuplicate?.(article);
        break;
      case 'delete':
        onDelete?.(article);
        break;
      default:
        break;
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(article)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen(article);
      }}
      className={`group cursor-pointer border-b px-4 py-3 transition-colors last:border-b-0 ${
        active ? 'bg-brand-50' : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.03]'
      }`}
      style={{ borderColor: 'var(--hm-border)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* 标题行 */}
          <div className="flex items-center gap-2">
            {article.isTop ? (
              <Tooltip title="置顶">
                <PushpinOutlined className="shrink-0 text-orange-500" />
              </Tooltip>
            ) : null}
            <span className="truncate font-medium" title={article.title}>
              {truncate(article.title, 48)}
            </span>
            {isDraft ? (
              <Tag color="default" className="m-0 shrink-0" style={{ fontSize: 11 }}>
                草稿
              </Tag>
            ) : (
              <Tag color="green" className="m-0 shrink-0" style={{ fontSize: 11 }}>
                已发布
              </Tag>
            )}
            {dirty ? (
              <Tooltip title="有未保存的修改">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
              </Tooltip>
            ) : null}
          </div>

          {/* 摘要 */}
          {article.excerpt ? (
            <p className="mt-1 mb-0 text-xs hm-text-secondary" title={article.excerpt}>
              {truncate(article.excerpt.replace(/\s+/g, ' '), 110)}
            </p>
          ) : null}

          {/* 元信息 */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs hm-text-secondary">
            <span>{formatRelative(article.updatedAt ?? article.createdAt)}</span>
            <span>{article.wordCount} 字</span>
            <span>约 {estimateReadingTime(article.content ?? '')} 分钟</span>
            {article.categories.length > 0 ? (
              <TagList values={article.categories} color="purple" max={2} />
            ) : null}
            {article.tags.length > 0 ? (
              <TagList values={article.tags} color="blue" max={3} />
            ) : null}
          </div>
        </div>

        {/* 操作区 */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Tooltip title="编辑">
            <span
              role="button"
              tabIndex={-1}
              className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(article);
              }}
            >
              <EditOutlined />
            </span>
          </Tooltip>

          <Tooltip title={isDraft ? '发布' : '查看'}>
            <span
              role="button"
              tabIndex={-1}
              className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10"
              onClick={(e) => {
                e.stopPropagation();
                if (isDraft) onPublish?.(article);
                else onOpen(article);
              }}
            >
              {isDraft ? <CheckCircleOutlined /> : <EyeOutlined />}
            </span>
          </Tooltip>

          <Dropdown
            menu={{ items: menuItems, onClick: handleMenuClick }}
            trigger={['click']}
            placement="bottomRight"
          >
            <span
              role="button"
              tabIndex={-1}
              className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreOutlined />
            </span>
          </Dropdown>
        </div>
      </div>

      {/* 右下角时间戳（草稿显示创建时间，已发布显示发布时间） */}
      <div className="mt-1 flex items-center justify-end gap-1 text-[11px] hm-text-secondary opacity-70">
        {isDraft ? <ClockCircleOutlined /> : <FireOutlined />}
        <span>
          {isDraft
            ? `创建于 ${formatRelative(article.createdAt)}`
            : `发布于 ${formatRelative(article.publishedAt ?? article.createdAt)}`}
        </span>
      </div>
    </div>
  );
}
