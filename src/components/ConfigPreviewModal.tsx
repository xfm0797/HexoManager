/** 配置预览弹窗：展示生成的配置文件内容 */

import { useMemo, useState } from 'react';
import { Alert, App as AntdApp, Button, Modal, Space, Tabs, Tag, Tooltip } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import type { GeneratedFile } from '@/types';
import { CodeEditor, type EditorLanguage } from './CodeEditor';
import { pickDirectory } from '@/utils/desktop';
import { copyToClipboard } from '@/utils/desktop';
import { fileService } from '@/services';
import { joinPath } from '@/utils/slug';

interface ConfigPreviewModalProps {
  open: boolean;
  onClose: () => void;
  /** 待展示的文件 */
  files: GeneratedFile[];
  /** 生成目标站点目录（用于「写入文件」操作） */
  sitePath?: string;
  /** 标题 */
  title?: string;
  /** 是否展示写入按钮 */
  allowWrite?: boolean;
  /** 写入完成回调 */
  onWritten?: (files: GeneratedFile[]) => void;
}

/** 根据文件扩展名推断编辑器语言 */
function languageOf(path: string): EditorLanguage {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'yml' || ext === 'yaml') return 'yaml';
  if (ext === 'json') return 'json';
  if (ext === 'md') return 'markdown';
  if (ext === 'js') return 'javascript';
  if (ext === 'toml') return 'toml';
  return 'plaintext';
}

/**
 * 配置预览弹窗。
 * 按文件分 Tab 展示内容，支持复制与写入磁盘。
 */
export function ConfigPreviewModal({
  open,
  onClose,
  files,
  sitePath,
  title = '配置预览',
  allowWrite = true,
  onWritten,
}: ConfigPreviewModalProps) {
  const { message } = AntdApp.useApp();
  const [activeKey, setActiveKey] = useState<string>('');
  const [writing, setWriting] = useState(false);

  const current = useMemo(
    () => files.find((f) => f.path === activeKey) ?? files[0],
    [files, activeKey],
  );

  const handleCopy = async (file: GeneratedFile) => {
    const ok = await copyToClipboard(file.content);
    if (ok) message.success('已复制文件内容');
    else message.error('复制失败');
  };

  const handleWrite = async () => {
    const targetDir = sitePath ?? (await pickDirectory('选择写入位置'));
    if (!targetDir) return;

    setWriting(true);
    try {
      for (const file of files) {
        const target = joinPath(targetDir, file.path);
        // 确保父目录存在
        const segments = file.path.split('/');
        if (segments.length > 1) {
          let dir = targetDir;
          for (const segment of segments.slice(0, -1)) {
            dir = joinPath(dir, segment);
            // mkdir 已存在时不报错（后端实现幂等）
            // eslint-disable-next-line no-await-in-loop
            await fileService.mkdir(dir).catch(() => undefined);
          }
        }
        // eslint-disable-next-line no-await-in-loop
        await fileService.write(target, file.content);
      }
      message.success(`已写入 ${files.length} 个文件`);
      onWritten?.(files);
      onClose();
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setWriting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={title}
      width={900}
      destroyOnClose
      footer={
        <div className="flex items-center justify-between">
          <span className="text-xs hm-text-secondary">
            共 {files.length} 个文件
            {sitePath ? (
              <>
                {' · '}写入位置：<span className="hm-mono">{sitePath}</span>
              </>
            ) : null}
          </span>
          <Space>
            <Button onClick={onClose}>关闭</Button>
            {current ? (
              <Button icon={<CopyOutlined />} onClick={() => handleCopy(current)}>
                复制当前
              </Button>
            ) : null}
            {allowWrite ? (
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                loading={writing}
                disabled={files.length === 0}
                onClick={handleWrite}
              >
                {sitePath ? '写入站点目录' : '选择目录并写入'}
              </Button>
            ) : null}
          </Space>
        </div>
      }
    >
      {files.length === 0 ? (
        <Alert type="info" showIcon message="没有可预览的配置文件" />
      ) : (
        <Tabs
          activeKey={current?.path}
          onChange={setActiveKey}
          items={files.map((file) => ({
            key: file.path,
            label: (
              <span className="flex items-center gap-1.5">
                <span className="hm-mono text-xs">{file.path}</span>
                <Tag className="m-0" style={{ fontSize: 10 }}>
                  {file.platform}
                </Tag>
              </span>
            ),
            children: (
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs hm-text-secondary">{file.description}</span>
                  <Tooltip title="复制内容">
                    <Button
                      size="small"
                      type="text"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopy(file)}
                    />
                  </Tooltip>
                </div>
                <CodeEditor
                  value={file.content}
                  language={languageOf(file.path)}
                  height={420}
                  readOnly
                  showStatusBar={false}
                />
              </div>
            ),
          }))}
        />
      )}
    </Modal>
  );
}

interface FileCheckListProps {
  /** [路径, 是否存在] */
  items: [string, boolean][];
}

/** 已存在文件检查结果列表 */
export function FileCheckList({ items }: FileCheckListProps) {
  if (items.length === 0) return null;

  const existing = items.filter(([, exists]) => exists);

  return (
    <Alert
      type={existing.length > 0 ? 'warning' : 'success'}
      showIcon
      message={
        existing.length > 0
          ? `检测到 ${existing.length} 个已有文件将被覆盖`
          : '目标目录中没有同名文件，可安全生成'
      }
      description={
        existing.length > 0 ? (
          <ul className="mt-1 mb-0 list-none space-y-0.5 p-0 text-xs">
            {items.map(([path, exists]) => (
              <li key={path} className="flex items-center gap-1.5">
                {exists ? (
                  <CloseCircleOutlined className="text-orange-500" />
                ) : (
                  <CheckCircleOutlined className="text-green-500" />
                )}
                <span className="hm-mono">{path}</span>
                <span className="hm-text-secondary">{exists ? '已存在，将被覆盖' : '新建'}</span>
              </li>
            ))}
          </ul>
        ) : undefined
      }
    />
  );
}
