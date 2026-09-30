/** Markdown 实时预览 */

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMemo } from 'react';
import { Empty } from 'antd';
import { parseFrontMatter } from '@/utils/markdown';

interface MarkdownPreviewProps {
  /** 完整 Markdown 内容（含 Front Matter） */
  content: string;
  /** 是否渲染 Front Matter 作为元信息表 */
  showFrontMatter?: boolean;
  /** 自定义类名 */
  className?: string;
}

/** 将 Front Matter 渲染为键值表 */
function FrontMatterTable({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return null;

  const renderValue = (value: unknown): string => {
    if (Array.isArray(value)) return value.map((v) => String(v)).join('、');
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <table className="mb-5 w-full border-collapse text-sm">
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key}>
            <td
              className="w-32 border px-3 py-1.5 align-top font-medium hm-text-secondary"
              style={{ borderColor: 'var(--hm-border)' }}
            >
              {key}
            </td>
            <td
              className="border px-3 py-1.5 break-all"
              style={{ borderColor: 'var(--hm-border)' }}
            >
              {renderValue(value)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Markdown 预览渲染器 */
export function MarkdownPreview({
  content,
  showFrontMatter = true,
  className = '',
}: MarkdownPreviewProps) {
  const { frontMatter, body, hasFrontMatter } = useMemo(() => parseFrontMatter(content), [content]);

  if (!body.trim()) {
    return (
      <div className="flex h-full items-center justify-center py-16">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <span className="text-sm hm-text-secondary">开始输入内容，这里会实时预览</span>
          }
        />
      </div>
    );
  }

  return (
    <div className={`hm-markdown px-1 ${className}`}>
      {showFrontMatter && hasFrontMatter ? <FrontMatterTable data={frontMatter} /> : null}
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 外链一律在新窗口打开
          a: ({ href, children, ...props }) => (
            <a href={href} target="_blank" rel="noreferrer noopener" {...props}>
              {children}
            </a>
          ),
        }}
      >
        {body}
      </Markdown>
    </div>
  );
}
