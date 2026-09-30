/** 终端风格日志查看器 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Segmented, Tooltip } from 'antd';
import {
  ArrowDownOutlined,
  ClearOutlined,
  CopyOutlined,
  DownloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { App as AntdApp } from 'antd';
import { copyToClipboard } from '@/utils/desktop';
import { pickSavePath } from '@/utils/desktop';
import { fileService } from '@/services';

interface LogViewerProps {
  /** 日志行 */
  lines: string[];
  /** 容器高度 */
  height?: number | string;
  /** 空状态文案 */
  emptyText?: string;
  /** 是否展示工具栏 */
  toolbar?: boolean;
  /** 标题 */
  title?: string;
  /** 是否自动滚动到底部 */
  autoScroll?: boolean;
  /** 是否正在执行（展示光标动画） */
  running?: boolean;
  /** 导出时的默认文件名 */
  exportFileName?: string;
}

type LevelFilter = 'all' | 'error' | 'warn';

/** 判断日志行的级别（用于着色） */
function lineLevel(line: string): 'error' | 'warn' | 'info' | 'success' | 'command' {
  const lower = line.toLowerCase();
  if (line.trimStart().startsWith('$')) return 'command';
  if (
    lower.includes('error') ||
    lower.includes('[错误]') ||
    lower.includes('failed') ||
    lower.includes('fatal') ||
    lower.includes('异常')
  ) {
    return 'error';
  }
  if (lower.includes('warn') || lower.includes('警告')) return 'warn';
  if (lower.includes('success') || lower.includes('完成') || lower.includes('✔')) return 'success';
  return 'info';
}

const LEVEL_COLOR: Record<ReturnType<typeof lineLevel>, string> = {
  error: '#ff7875',
  warn: '#ffc53d',
  success: '#95de64',
  command: '#69b1ff',
  info: '#d9d9d9',
};

/**
 * 日志查看器。
 * 支持级别筛选、关键字搜索、复制与导出。
 */
export function LogViewer({
  lines,
  height = 420,
  emptyText = '暂无日志输出',
  toolbar = true,
  title,
  autoScroll = true,
  running = false,
  exportFileName = 'build-log.txt',
}: LogViewerProps) {
  const { message } = AntdApp.useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState<LevelFilter>('all');
  const [keyword, setKeyword] = useState('');
  const [follow, setFollow] = useState(true);

  const filtered = useMemo(() => {
    return lines.filter((line) => {
      const lv = lineLevel(line);
      if (level === 'error' && lv !== 'error') return false;
      if (level === 'warn' && lv !== 'warn' && lv !== 'error') return false;
      if (keyword && !line.toLowerCase().includes(keyword.toLowerCase())) return false;
      return true;
    });
  }, [lines, level, keyword]);

  // 自动滚动到底部
  useEffect(() => {
    if (!autoScroll || !follow) return;
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filtered, autoScroll, follow]);

  // 用户手动上滚时暂停跟随
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setFollow(atBottom);
  };

  const handleCopy = async () => {
    const ok = await copyToClipboard(lines.join('\n'));
    if (ok) message.success('日志已复制');
    else message.error('复制失败');
  };

  const handleExport = async () => {
    try {
      const target = await pickSavePath({
        title: '导出日志',
        defaultPath: exportFileName,
        filters: [{ name: '文本文件', extensions: ['txt', 'log'] }],
      });
      if (!target) return;

      const header = [
        `# HexoManager 日志导出`,
        `# 时间：${new Date().toLocaleString('zh-CN')}`,
        `# 行数：${lines.length}`,
        '',
      ].join('\n');

      await fileService.write(target, `${header}${lines.join('\n')}\n`);
      message.success('日志已导出');
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  const errorCount = useMemo(
    () => lines.filter((line) => lineLevel(line) === 'error').length,
    [lines],
  );

  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg border"
      style={{ borderColor: 'var(--hm-border)' }}
    >
      {toolbar ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2"
          style={{ borderColor: 'var(--hm-border)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{title ?? '运行日志'}</span>
            <span className="text-xs hm-text-secondary">
              {lines.length} 行
              {errorCount > 0 ? (
                <span className="ml-1 text-red-500">· {errorCount} 处错误</span>
              ) : null}
            </span>
            {running ? (
              <span className="inline-flex items-center gap-1 text-xs text-brand-500">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
                执行中
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Segmented
              size="small"
              value={level}
              onChange={(v) => setLevel(v as LevelFilter)}
              options={[
                { label: '全部', value: 'all' },
                { label: '警告+', value: 'warn' },
                { label: '仅错误', value: 'error' },
              ]}
            />
            <Input
              size="small"
              allowClear
              prefix={<SearchOutlined className="opacity-50" />}
              placeholder="搜索日志"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ width: 150 }}
            />
            <Tooltip title="复制全部">
              <Button size="small" type="text" icon={<CopyOutlined />} onClick={handleCopy} />
            </Tooltip>
            <Tooltip title="导出为文件">
              <Button size="small" type="text" icon={<DownloadOutlined />} onClick={handleExport} />
            </Tooltip>
            <Tooltip title="清空视图">
              <Button
                size="small"
                type="text"
                icon={<ClearOutlined />}
                onClick={() => {
                  setKeyword('');
                  setLevel('all');
                }}
              />
            </Tooltip>
          </div>
        </div>
      ) : null}

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="hm-scroll hm-mono flex-1 p-3 text-xs leading-relaxed"
        style={{ height, background: '#1e1e1e' }}
      >
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-500">{emptyText}</div>
        ) : (
          filtered.map((line, index) => (
            <div
              key={index}
              className="whitespace-pre-wrap break-all"
              style={{ color: LEVEL_COLOR[lineLevel(line)] }}
            >
              {line || '\u00A0'}
            </div>
          ))
        )}
      </div>

      {!follow && filtered.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            setFollow(true);
            const el = containerRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
          className="flex items-center justify-center gap-1 border-t py-1 text-xs hm-text-secondary transition hover:text-brand-500"
          style={{ borderColor: 'var(--hm-border)' }}
        >
          <ArrowDownOutlined /> 回到底部
        </button>
      ) : null}
    </div>
  );
}
