/** 文件树：站点目录浏览 */

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Dropdown, Empty, Input, Spin, Tooltip, Tree } from 'antd';
import type { DataNode, TreeProps } from 'antd/es/tree';
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileMarkdownOutlined,
  FileOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  PictureOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { FileTreeNode } from '@/types';
import { formatFileSize } from '@/utils/format';
import { fileExtension } from '@/utils/slug';

interface FileTreeProps {
  /** 根节点 */
  tree: FileTreeNode | null;
  loading?: boolean;
  /** 当前选中的路径 */
  selectedPath?: string;
  onSelect: (node: FileTreeNode) => void;
  onOpen?: (node: FileTreeNode) => void;
  onReveal?: (node: FileTreeNode) => void;
  onRename?: (node: FileTreeNode) => void;
  onDelete?: (node: FileTreeNode) => void;
  onCreate?: (parent: FileTreeNode) => void;
  onRefresh?: () => void;
  /** 默认展开的层级 */
  defaultExpandDepth?: number;
  className?: string;
}

/** 根据扩展名选择图标 */
function iconForNode(node: FileTreeNode): React.ReactNode {
  if (node.isDir) return <FolderOpenOutlined className="text-amber-500" />;

  const ext = fileExtension(node.name);
  if (ext === 'md' || ext === 'markdown')
    return <FileMarkdownOutlined className="text-brand-500" />;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(ext)) {
    return <PictureOutlined className="text-purple-500" />;
  }
  if (['yml', 'yaml', 'json', 'toml'].includes(ext))
    return <FileTextOutlined className="text-green-600" />;
  return <FileOutlined className="text-gray-400" />;
}

/** 将后端文件树转为 antd Tree 数据（独立工具函数，供外部复用） */
export function toTreeData(node: FileTreeNode, depth: number, maxDepth: number): DataNode[] {
  const children =
    node.isDir && depth < maxDepth
      ? node.children.map((child: FileTreeNode) => toTreeData(child, depth + 1, maxDepth)).flat()
      : undefined;

  return [
    {
      key: node.path,
      title: node.name,
      icon: iconForNode(node),
      isLeaf: !node.isDir,
      children,
    },
  ];
}

/**
 * 文件树组件。
 * 支持搜索过滤、右键操作与目录展开。
 */
export function FileTree({
  tree,
  loading = false,
  selectedPath,
  onSelect,
  onOpen,
  onReveal,
  onRename,
  onDelete,
  onCreate,
  onRefresh,
  defaultExpandDepth = 2,
  className = '',
}: FileTreeProps) {
  const [keyword, setKeyword] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);

  const allNodes = useMemo(() => {
    const map = new Map<string, FileTreeNode>();
    const walk = (node: FileTreeNode) => {
      map.set(node.path, node);
      node.children.forEach(walk);
    };
    if (tree) walk(tree);
    return map;
  }, [tree]);

  // 搜索：命中节点及其所有父级
  const matchedKeys = useMemo(() => {
    if (!keyword.trim()) return null;
    const lower = keyword.toLowerCase();
    const keys = new Set<string>();

    for (const [path, node] of allNodes) {
      if (node.name.toLowerCase().includes(lower)) {
        keys.add(path);
        // 补齐所有父级路径
        let current = path;
        while (current.includes('/')) {
          current = current.slice(0, current.lastIndexOf('/'));
          if (allNodes.has(current)) keys.add(current);
        }
      }
    }
    return keys;
  }, [keyword, allNodes]);

  const treeData = useMemo(() => {
    if (!tree) return [];

    const filterNode = (node: FileTreeNode, depth: number): DataNode[] => {
      const isMatched = !matchedKeys || matchedKeys.has(node.path);

      if (node.isDir) {
        const children = node.children
          .map((child: FileTreeNode) => filterNode(child, depth + 1))
          .flat();
        if (!isMatched && children.length === 0) return [];

        return [
          {
            key: node.path,
            title: node.name,
            icon: iconForNode(node),
            children,
          },
        ];
      }

      if (!isMatched) return [];
      return [
        {
          key: node.path,
          title: (
            <span className="flex items-center justify-between gap-2">
              <span className="truncate">{node.name}</span>
              <span className="shrink-0 text-[11px] hm-text-secondary">
                {formatFileSize(node.size)}
              </span>
            </span>
          ),
          icon: iconForNode(node),
          isLeaf: true,
        },
      ];
    };

    return tree.children.map((child: FileTreeNode) => filterNode(child, 1)).flat();
  }, [tree, matchedKeys]);

  // 搜索时自动展开全部命中节点
  const effectiveExpanded = matchedKeys ? [...matchedKeys] : expandedKeys;

  // 首次挂载时按 defaultExpandDepth 展开目录
  useEffect(() => {
    if (!tree || keyword) return;
    const keys: string[] = [];
    const walk = (node: FileTreeNode, depth: number) => {
      if (depth > defaultExpandDepth) return;
      if (node.isDir) keys.push(node.path);
      node.children.forEach((child: FileTreeNode) => walk(child, depth + 1));
    };
    tree.children.forEach((child: FileTreeNode) => walk(child, 1));
    setExpandedKeys(keys);
    // 仅在文件树变化时重算
  }, [tree, defaultExpandDepth, keyword]);

  const handleSelect: TreeProps['onSelect'] = (keys) => {
    const path = keys[0] as string | undefined;
    if (!path) return;
    const node = allNodes.get(path);
    if (node) onSelect(node);
  };

  const handleDoubleClick: TreeProps['onDoubleClick'] = (_e, node) => {
    const target = allNodes.get(node.key as string);
    if (target && !target.isDir) onOpen?.(target);
  };

  const selectedNode = selectedPath ? allNodes.get(selectedPath) : undefined;

  const contextMenu = (node: FileTreeNode | undefined) => ({
    items: [
      ...(node?.isDir
        ? [{ key: 'create', label: '新建文件', icon: <PlusOutlined />, disabled: !onCreate }]
        : []),
      {
        key: 'open',
        label: '在编辑器打开',
        icon: <EyeOutlined />,
        disabled: !onOpen || node?.isDir,
      },
      {
        key: 'reveal',
        label: '在文件管理器中显示',
        icon: <FolderOpenOutlined />,
        disabled: !onReveal,
      },
      { type: 'divider' as const },
      { key: 'rename', label: '重命名', icon: <EditOutlined />, disabled: !onRename },
      { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, disabled: !onDelete },
    ],
    onClick: ({ key }: { key: string }) => {
      if (!node) return;
      if (key === 'create') onCreate?.(node);
      else if (key === 'open') onOpen?.(node);
      else if (key === 'reveal') onReveal?.(node);
      else if (key === 'rename') onRename?.(node);
      else if (key === 'delete') onDelete?.(node);
    },
  });

  return (
    <div className={`flex h-full flex-col ${className}`}>
      {/* 搜索与工具栏 */}
      <div className="mb-2 flex items-center gap-2">
        <Input
          size="small"
          allowClear
          prefix={<SearchOutlined className="opacity-50" />}
          placeholder="搜索文件"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <Tooltip title="刷新">
          <Button
            size="small"
            type="text"
            icon={<ReloadOutlined />}
            onClick={onRefresh}
            loading={loading}
          />
        </Tooltip>
      </div>

      {tree && tree.children.length > 0 ? (
        <>
          <div className="mb-1 flex items-center justify-between text-xs hm-text-secondary">
            <span className="truncate hm-mono" title={tree.path}>
              {tree.name}
            </span>
            <Badge
              count={allNodes.size - 1}
              showZero
              overflowCount={9999}
              style={{ backgroundColor: 'rgba(140,148,160,0.25)', color: 'inherit' }}
            />
          </div>

          <div className="hm-scroll flex-1">
            {loading ? (
              <div className="flex justify-center py-8">
                <Spin size="small" />
              </div>
            ) : treeData.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<span className="text-xs">没有匹配的文件</span>}
              />
            ) : (
              <Dropdown menu={contextMenu(selectedNode)} trigger={['contextMenu']}>
                <div>
                  <Tree
                    showIcon
                    blockNode
                    treeData={treeData}
                    selectedKeys={selectedPath ? [selectedPath] : []}
                    expandedKeys={effectiveExpanded}
                    defaultExpandedKeys={[]}
                    onExpand={(keys) => setExpandedKeys(keys)}
                    onSelect={handleSelect}
                    onDoubleClick={handleDoubleClick}
                    className="bg-transparent"
                    style={{ background: 'transparent', fontSize: 13 }}
                  />
                </div>
              </Dropdown>
            )}
          </div>
        </>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<span className="text-xs hm-text-secondary">目录为空或未加载</span>}
          className="mt-8"
        />
      )}

      <div className="mt-2 text-[11px] hm-text-secondary opacity-70">
        提示：双击文件可在编辑器中打开，右键查看更多操作
      </div>
    </div>
  );
}

export type { FileTreeProps };
export type { FileTreeNode };
