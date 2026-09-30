/** 加载状态与骨架屏 */

import { Spin, Skeleton } from 'antd';

interface LoadingProps {
  /** 提示文案 */
  tip?: string;
  /** 尺寸 */
  size?: 'small' | 'default' | 'large';
  /** 占满父容器高度 */
  full?: boolean;
  /** 是否展示在半透明遮罩上 */
  overlay?: boolean;
}

/** 居中加载指示器 */
export function Loading({
  tip = '加载中…',
  size = 'default',
  full = false,
  overlay = false,
}: LoadingProps) {
  const content = (
    <div className={`flex flex-col items-center justify-center gap-3 ${full ? 'h-full' : 'py-16'}`}>
      <Spin size={size} />
      {tip ? <span className="text-sm hm-text-secondary">{tip}</span> : null}
    </div>
  );

  if (overlay) {
    return (
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-sm">
        {content}
      </div>
    );
  }

  return content;
}

interface SkeletonListProps {
  /** 行数 */
  rows?: number;
  /** 列数（卡片网格布局） */
  columns?: number;
  /** 每项高度 */
  itemHeight?: number;
}

/** 卡片网格骨架屏 */
export function SkeletonGrid({ rows = 2, columns = 3, itemHeight = 132 }: SkeletonListProps) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: rows * columns }).map((_, index) => (
        <div key={index} className="hm-surface p-4">
          <Skeleton active paragraph={{ rows: Math.max(1, Math.round(itemHeight / 48)) }} />
        </div>
      ))}
    </div>
  );
}

/** 表格骨架屏 */
export function SkeletonTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton
          key={index}
          active
          title={false}
          paragraph={{ rows: 1, width: `${70 + ((index * 7) % 30)}%` }}
        />
      ))}
    </div>
  );
}
