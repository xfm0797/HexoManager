/** 状态徽标：站点状态、部署状态等统一渲染 */

import { Badge, Tag } from 'antd';
import { DEPLOY_STATUS_META, SITE_STATUS_META } from '@/constants';

interface SiteStatusBadgeProps {
  status?: string | null;
  /** 是否使用 Tag 样式（默认使用 Badge 圆点） */
  asTag?: boolean;
}

/** 站点状态徽标 */
export function SiteStatusBadge({ status, asTag = false }: SiteStatusBadgeProps) {
  const meta = SITE_STATUS_META[status ?? 'active'] ?? SITE_STATUS_META.active;

  if (asTag) {
    return (
      <Tag color={meta.color} className="m-0">
        {meta.label}
      </Tag>
    );
  }

  return <Badge status={meta.badge} text={meta.label} />;
}

interface DeployStatusBadgeProps {
  status: string;
  asTag?: boolean;
}

/** 部署状态徽标 */
export function DeployStatusBadge({ status, asTag = false }: DeployStatusBadgeProps) {
  const meta = DEPLOY_STATUS_META[status] ?? DEPLOY_STATUS_META.pending;

  if (asTag) {
    return (
      <Tag color={meta.color} className="m-0">
        {meta.label}
      </Tag>
    );
  }

  return <Badge status={meta.badge} text={meta.label} />;
}

interface PlatformBadgeProps {
  /** 徽标文字，如 GH / CF */
  badge: string;
  /** 主题色 */
  color: string;
  /** 名称 */
  name?: string;
  /** 尺寸 */
  size?: 'small' | 'default' | 'large';
  /** 是否展示名称 */
  showName?: boolean;
}

/** 平台方块徽标（用于平台清单与卡片） */
export function PlatformBadge({
  badge,
  color,
  name,
  size = 'default',
  showName = true,
}: PlatformBadgeProps) {
  const dimension = size === 'small' ? 20 : size === 'large' ? 36 : 28;
  const fontSize = size === 'small' ? 10 : size === 'large' ? 14 : 12;

  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-md font-semibold text-white"
        style={{
          width: dimension,
          height: dimension,
          fontSize,
          background: color,
          letterSpacing: '0.02em',
        }}
      >
        {badge}
      </span>
      {showName && name ? <span className="text-sm">{name}</span> : null}
    </span>
  );
}

interface StatusDotProps {
  color: string;
  pulse?: boolean;
  text?: string;
}

/** 呼吸状态点（用于运行中的进程） */
export function StatusDot({ color, pulse = false, text }: StatusDotProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative inline-flex" style={{ width: 8, height: 8 }}>
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {pulse ? (
          <span
            className="absolute inset-0 animate-ping rounded-full opacity-60"
            style={{ background: color }}
          />
        ) : null}
      </span>
      {text ? <span className="text-xs hm-text-secondary">{text}</span> : null}
    </span>
  );
}
