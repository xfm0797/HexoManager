/** 空状态：统一各处的「暂无数据」展示 */

import { Button, Empty } from 'antd';
import type { ReactNode } from 'react';
import { InboxOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { EmptyStateKind } from '@/types';

const PRESETS: Record<EmptyStateKind, { title: string; description: string; icon: ReactNode }> = {
  sites: {
    title: '还没有站点',
    description: '创建一个新的 Hexo 站点，或导入本地已有的站点目录开始管理。',
    icon: <InboxOutlined />,
  },
  articles: {
    title: '暂无文章',
    description: '新建一篇文章或导入 Markdown 文件，开始你的写作。',
    icon: <InboxOutlined />,
  },
  themes: {
    title: '暂无主题',
    description: '从主题市场安装一个主题，或手动放入 themes 目录后刷新。',
    icon: <InboxOutlined />,
  },
  logs: {
    title: '暂无记录',
    description: '执行一次部署后，这里会展示完整的部署日志与结果。',
    icon: <InboxOutlined />,
  },
  search: {
    title: '没有匹配结果',
    description: '换个关键词试试，或清空筛选条件查看全部内容。',
    icon: <SearchOutlined />,
  },
  files: {
    title: '目录为空',
    description: '该目录下还没有文件。',
    icon: <InboxOutlined />,
  },
};

interface EmptyStateProps {
  /** 预设场景 */
  kind?: EmptyStateKind;
  /** 覆盖标题 */
  title?: string;
  /** 覆盖描述 */
  description?: string;
  /** 主操作按钮文案 */
  actionText?: string;
  /** 主操作回调 */
  onAction?: () => void;
  /** 刷新回调（展示次要按钮） */
  onRefresh?: () => void;
  /** 自定义图标 */
  icon?: ReactNode;
  /** 紧凑模式（用于卡片内部） */
  compact?: boolean;
}

export function EmptyState({
  kind = 'sites',
  title,
  description,
  actionText,
  onAction,
  onRefresh,
  icon,
  compact = false,
}: EmptyStateProps) {
  const preset = PRESETS[kind];

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? 'py-8' : 'py-16'
      }`}
    >
      <Empty
        image={icon ?? preset.icon}
        imageStyle={{ height: compact ? 48 : 64, fontSize: compact ? 40 : 56, opacity: 0.65 }}
        description={
          <div>
            <div className="text-base font-medium">{title ?? preset.title}</div>
            <div className="mt-1 max-w-sm text-sm hm-text-secondary">
              {description ?? preset.description}
            </div>
          </div>
        }
      >
        <div className="flex items-center justify-center gap-2">
          {actionText && onAction ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={onAction}>
              {actionText}
            </Button>
          ) : null}
          {onRefresh ? (
            <Button icon={<ReloadOutlined />} onClick={onRefresh}>
              刷新
            </Button>
          ) : null}
        </div>
      </Empty>
    </div>
  );
}
