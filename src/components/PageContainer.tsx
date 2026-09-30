/** 页面级容器：统一标题、描述、操作区与内容间距 */

import type { ReactNode } from 'react';

interface PageContainerProps {
  title?: ReactNode;
  description?: ReactNode;
  /** 右上角操作区 */
  extra?: ReactNode;
  /** 标题左侧标签，如状态徽标 */
  badge?: ReactNode;
  /** 是否使用卡片容器包裹内容 */
  card?: boolean;
  /** 内容区自定义类名 */
  className?: string;
  /** 是否去除内边距（用于表格类整页布局） */
  flush?: boolean;
  children: ReactNode;
}

/**
 * 页面容器。
 * 统一各页面的标题排版与滚动行为，避免每个页面各写一套。
 */
export function PageContainer({
  title,
  description,
  extra,
  badge,
  card = true,
  className = '',
  flush = false,
  children,
}: PageContainerProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {title ? (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="m-0 truncate text-xl font-semibold">{title}</h1>
              {badge}
            </div>
            {description ? (
              <p className="mt-1 mb-0 text-sm hm-text-secondary">{description}</p>
            ) : null}
          </div>
          {extra ? <div className="flex shrink-0 items-center gap-2">{extra}</div> : null}
        </header>
      ) : null}

      <div
        className={[
          'flex-1 hm-scroll',
          card ? 'hm-surface' : '',
          card && !flush ? 'p-5' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </div>
    </div>
  );
}
