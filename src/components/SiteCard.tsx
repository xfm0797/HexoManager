/** 站点卡片 */

import { Dropdown, Tooltip } from 'antd';
import {
  CheckOutlined,
  CloudServerOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  ExportOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  MoreOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useMemo } from 'react';
import type { Site } from '@/types';
import { formatRelative, gradientFromString, initialsOf, truncate } from '@/utils/format';
import { SiteStatusBadge } from './StatusBadge';

interface SiteCardProps {
  site: Site;
  active?: boolean;
  onSelect: (site: Site) => void;
  onEdit?: (site: Site) => void;
  onOpenFolder?: (site: Site) => void;
  onDeploy?: (site: Site) => void;
  onDuplicate?: (site: Site) => void;
  onExport?: (site: Site) => void;
  onDelete?: (site: Site) => void;
}

/** 站点卡片：展示站点概览信息与快捷操作 */
export function SiteCard({
  site,
  active = false,
  onSelect,
  onEdit,
  onOpenFolder,
  onDeploy,
  onDuplicate,
  onExport,
  onDelete,
}: SiteCardProps) {
  const [from, to] = useMemo(() => gradientFromString(site.name), [site.name]);

  const menuItems: MenuProps['items'] = [
    { key: 'edit', label: '编辑信息', icon: <EditOutlined />, disabled: !onEdit },
    {
      key: 'folder',
      label: '打开目录',
      icon: <FolderOpenOutlined />,
      disabled: !onOpenFolder,
    },
    { type: 'divider' },
    { key: 'deploy', label: '立即部署', icon: <RocketOutlined />, disabled: !onDeploy },
    { key: 'duplicate', label: '复制站点', icon: <CopyOutlined />, disabled: !onDuplicate },
    { key: 'export', label: '备份导出', icon: <ExportOutlined />, disabled: !onExport },
    { type: 'divider' },
    {
      key: 'delete',
      label: '删除站点',
      icon: <DeleteOutlined />,
      danger: true,
      disabled: !onDelete,
    },
  ];

  const handleMenuClick: MenuProps['onClick'] = ({ key, domEvent }) => {
    domEvent.stopPropagation();
    switch (key) {
      case 'edit':
        onEdit?.(site);
        break;
      case 'folder':
        onOpenFolder?.(site);
        break;
      case 'deploy':
        onDeploy?.(site);
        break;
      case 'duplicate':
        onDuplicate?.(site);
        break;
      case 'export':
        onExport?.(site);
        break;
      case 'delete':
        onDelete?.(site);
        break;
      default:
        break;
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(site)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect(site);
      }}
      className={`hm-surface group relative cursor-pointer overflow-hidden p-0 transition-all ${
        active ? 'ring-2 ring-brand-500' : 'hover:shadow-md'
      }`}
    >
      {/* 顶部渐变头图 */}
      <div
        className="relative flex h-20 items-center justify-between px-4"
        style={{ background: `linear-gradient(120deg, ${from}, ${to})` }}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/25 text-lg font-semibold text-white backdrop-blur">
          {initialsOf(site.name)}
        </span>

        <div className="flex items-center gap-1">
          {active ? (
            <Tooltip title="当前站点">
              <span className="inline-flex h-6 items-center gap-1 rounded-full bg-white/25 px-2 text-xs text-white backdrop-blur">
                <CheckOutlined /> 当前
              </span>
            </Tooltip>
          ) : null}
          <span onClick={(e) => e.stopPropagation()}>
            <Dropdown
              menu={{ items: menuItems, onClick: handleMenuClick }}
              trigger={['click']}
              placement="bottomRight"
            >
              <span className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-white/90 transition hover:bg-white/20">
                <MoreOutlined />
              </span>
            </Dropdown>
          </span>
        </div>
      </div>

      {/* 站名与描述 */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="m-0 truncate text-base font-semibold" title={site.name}>
            {site.name}
          </h3>
          <SiteStatusBadge status={site.status} />
        </div>

        {site.description ? (
          <p className="mt-1 mb-0 text-sm hm-text-secondary" title={site.description}>
            {truncate(site.description, 56)}
          </p>
        ) : (
          <p className="mt-1 mb-0 text-sm hm-text-secondary opacity-60">
            {truncate(site.domain ?? site.path, 56)}
          </p>
        )}

        {/* 统计信息 */}
        <div className="mt-3 flex items-center gap-4 text-xs hm-text-secondary">
          <span className="inline-flex items-center gap-1">
            <FileTextOutlined /> {site.articleCount} 篇
          </span>
          <span className="inline-flex items-center gap-1">
            <EditOutlined /> {site.draftCount} 草稿
          </span>
          <span className="inline-flex items-center gap-1 truncate">
            <CloudServerOutlined />
            <span className="truncate" title={site.theme ?? '未指定主题'}>
              {site.theme ?? '未指定主题'}
            </span>
          </span>
        </div>

        {/* 底部路径与部署时间 */}
        <div
          className="mt-3 flex items-center justify-between border-t pt-2 text-xs hm-text-secondary"
          style={{ borderColor: 'var(--hm-border)' }}
        >
          <Tooltip title={site.path}>
            <span className="truncate hm-mono" style={{ maxWidth: 160 }}>
              {site.path}
            </span>
          </Tooltip>
          <span>
            {site.lastDeployAt ? `部署于 ${formatRelative(site.lastDeployAt)}` : '尚未部署'}
          </span>
        </div>
      </div>
    </div>
  );
}
