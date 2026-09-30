/** 部署平台卡片 */

import { Button, Space, Tag, Tooltip } from 'antd';
import {
  CheckCircleOutlined,
  ExportOutlined,
  EyeOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { DeployPlatformMeta } from '@/constants';
import { PlatformBadge } from './StatusBadge';

interface PlatformCardProps {
  platform: DeployPlatformMeta;
  /** 是否已选择 */
  selected?: boolean;
  /** 已生成配置文件数量（0 表示未生成） */
  generatedCount?: number;
  onSelect?: (platform: DeployPlatformMeta) => void;
  onPreview?: (platform: DeployPlatformMeta) => void;
  onOpenDocs?: (platform: DeployPlatformMeta) => void;
  onGenerate?: (platform: DeployPlatformMeta) => void;
  disabled?: boolean;
}

/** 部署平台卡片：选择平台并触发配置生成 */
export function PlatformCard({
  platform,
  selected = false,
  generatedCount = 0,
  onSelect,
  onPreview,
  onOpenDocs,
  onGenerate,
  disabled = false,
}: PlatformCardProps) {
  return (
    <div
      className={`hm-surface flex flex-col p-4 transition-all ${
        selected ? 'ring-2 ring-brand-500' : 'hover:shadow-md'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <PlatformBadge badge={platform.badge} color={platform.color} name={platform.name} />
        {selected ? (
          <Tag color="blue" className="m-0" icon={<CheckCircleOutlined />}>
            已选
          </Tag>
        ) : generatedCount > 0 ? (
          <Tag color="green" className="m-0">
            已生成 {generatedCount}
          </Tag>
        ) : null}
      </div>

      <p className="mt-2 mb-0 flex-1 text-xs leading-relaxed hm-text-secondary">
        {platform.description}
      </p>

      <div className="mt-2 flex items-center gap-2 text-[11px] hm-text-secondary">
        <Tag className="m-0" style={{ fontSize: 11 }}>
          {platform.supportsCustomDomain ? '支持自定义域名' : '不支持自定义域名'}
        </Tag>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <Space size={4}>
          {onPreview ? (
            <Tooltip title="预览生成的配置文件">
              <Button
                size="small"
                type="text"
                icon={<EyeOutlined />}
                onClick={() => onPreview(platform)}
              />
            </Tooltip>
          ) : null}
          {onOpenDocs ? (
            <Tooltip title="打开官方文档">
              <Button
                size="small"
                type="text"
                icon={<ExportOutlined />}
                onClick={() => onOpenDocs(platform)}
              />
            </Tooltip>
          ) : null}
        </Space>

        {onGenerate ? (
          <Button
            size="small"
            type="primary"
            ghost
            icon={<ThunderboltOutlined />}
            onClick={() => onGenerate(platform)}
            disabled={disabled}
          >
            生成配置
          </Button>
        ) : null}

        {onSelect ? (
          <Button
            size="small"
            type={selected ? 'default' : 'primary'}
            onClick={() => onSelect(platform)}
            disabled={disabled}
          >
            {selected ? '已选择' : '选择'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

interface PlatformGridProps {
  children: React.ReactNode;
  columns?: number;
}

/** 平台卡片网格 */
export function PlatformGrid({ children, columns = 3 }: PlatformGridProps) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}
