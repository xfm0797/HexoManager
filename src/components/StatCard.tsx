/** 统计指标卡片 */

import type { ReactNode } from 'react';
import { Tooltip } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, InfoCircleOutlined } from '@ant-design/icons';

interface StatCardProps {
  /** 指标名称 */
  title: string;
  /** 指标值（已格式化） */
  value: ReactNode;
  /** 前缀图标 */
  icon?: ReactNode;
  /** 图标背景色 */
  iconColor?: string;
  /** 指标说明（hover 提示） */
  tooltip?: string;
  /** 环比变化百分比，正数上升、负数下降 */
  trend?: number | null;
  /** 变化趋势的语义：up 表示越大越好（绿），down 表示越大越好（红） */
  trendGoodWhen?: 'up' | 'down';
  /** 底部补充说明 */
  footer?: ReactNode;
  /** 加载中 */
  loading?: boolean;
}

export function StatCard({
  title,
  value,
  icon,
  iconColor = '#3366ff',
  tooltip,
  trend,
  trendGoodWhen = 'up',
  footer,
  loading = false,
}: StatCardProps) {
  const hasTrend = trend !== null && trend !== undefined && Number.isFinite(trend);
  const isUp = hasTrend && (trend as number) > 0;
  const isGood = hasTrend
    ? trendGoodWhen === 'up'
      ? (trend as number) > 0
      : (trend as number) < 0
    : false;

  return (
    <div className="hm-surface flex flex-col gap-3 p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm hm-text-secondary">
          <span>{title}</span>
          {tooltip ? (
            <Tooltip title={tooltip}>
              <InfoCircleOutlined className="text-xs opacity-60" />
            </Tooltip>
          ) : null}
        </div>
        {icon ? (
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-base"
            style={{ background: `${iconColor}1a`, color: iconColor }}
          >
            {icon}
          </span>
        ) : null}
      </div>

      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-semibold leading-none ${loading ? 'opacity-40' : ''}`}>
          {value}
        </span>
        {hasTrend ? (
          <span
            className={`inline-flex items-center gap-0.5 text-xs ${
              isGood ? 'text-green-600' : 'text-red-500'
            }`}
          >
            {isUp ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
            {Math.abs(trend as number).toFixed(1)}%
          </span>
        ) : null}
      </div>

      {footer ? <div className="text-xs hm-text-secondary">{footer}</div> : null}
    </div>
  );
}

interface StatGridProps {
  children: ReactNode;
  /** 每行列数 */
  columns?: number;
}

/** 指标卡片网格容器 */
export function StatGrid({ children, columns = 4 }: StatGridProps) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}
