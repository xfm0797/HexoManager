/** 代码编辑器：Monaco 封装 + 只读代码块 */

import { useMemo } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { CopyOutlined } from '@ant-design/icons';
import { App as AntdApp, Button, Tooltip } from 'antd';
import { useUiStore } from '@/stores';
import { copyToClipboard } from '@/utils/desktop';

export type EditorLanguage =
  'yaml' | 'json' | 'markdown' | 'javascript' | 'toml' | 'shell' | 'plaintext';

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: EditorLanguage;
  height?: number | string;
  readOnly?: boolean;
  /** 顶部标题栏 */
  title?: string;
  /** 顶部右侧额外操作 */
  extra?: React.ReactNode;
  /** 是否展示底部状态栏（行列号、字符数） */
  showStatusBar?: boolean;
  /** 关闭自动换行 */
  wordWrap?: boolean;
  /** 自定义类名 */
  className?: string;
}

const LANGUAGE_MAP: Record<EditorLanguage, string> = {
  yaml: 'yaml',
  json: 'json',
  markdown: 'markdown',
  javascript: 'javascript',
  toml: 'ini',
  shell: 'shell',
  plaintext: 'plaintext',
};

/** Monaco 编辑器封装，自动跟随应用明暗主题 */
export function CodeEditor({
  value,
  onChange,
  language = 'yaml',
  height = 420,
  readOnly = false,
  title,
  extra,
  showStatusBar = true,
  wordWrap = false,
  className = '',
}: CodeEditorProps) {
  const isDark = useUiStore((s) => s.isDark);
  const { message } = AntdApp.useApp();

  // 用行数估算高度，避免短内容出现大片空白
  const resolvedHeight = useMemo(() => {
    if (typeof height === 'string') return height;
    return height;
  }, [height]);

  const handleMount: OnMount = (editor, monaco) => {
    monaco.editor.defineTheme('hm-light', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#ffffff',
        'editor.lineHighlightBackground': '#f5f7fa',
        'editorLineNumber.foreground': '#b0b6bd',
        'editorGutter.background': '#ffffff',
      },
    });

    monaco.editor.defineTheme('hm-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#1e2126',
        'editor.lineHighlightBackground': '#262a31',
        'editorGutter.background': '#1e2126',
      },
    });

    monaco.editor.setTheme(isDark ? 'hm-dark' : 'hm-light');

    // 只读模式下仍允许选中复制
    editor.updateOptions({ readOnlyMessage: undefined });
  };

  const handleCopy = async () => {
    const ok = await copyToClipboard(value);
    if (ok) message.success('已复制到剪贴板');
    else message.error('复制失败，请手动选择内容复制');
  };

  return (
    <div className={`hm-editor flex flex-col ${className}`}>
      {title || extra ? (
        <div
          className="flex items-center justify-between gap-2 border-b px-3 py-2"
          style={{ borderColor: 'var(--hm-border)' }}
        >
          <span className="truncate text-sm font-medium">{title}</span>
          <div className="flex items-center gap-1">
            {extra}
            <Tooltip title="复制内容">
              <Button type="text" size="small" icon={<CopyOutlined />} onClick={handleCopy} />
            </Tooltip>
          </div>
        </div>
      ) : null}

      <div style={{ height: resolvedHeight }}>
        <Editor
          value={value}
          language={LANGUAGE_MAP[language]}
          theme={isDark ? 'hm-dark' : 'hm-light'}
          onMount={handleMount}
          onChange={(next) => onChange?.(next ?? '')}
          options={{
            readOnly,
            domReadOnly: readOnly,
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: wordWrap ? 'on' : 'off',
            renderLineHighlight: readOnly ? 'none' : 'line',
            padding: { top: 12, bottom: 12 },
            scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            contextmenu: !readOnly,
          }}
        />
      </div>

      {showStatusBar && !readOnly ? (
        <div
          className="flex items-center justify-between border-t px-3 py-1 text-xs hm-text-secondary"
          style={{ borderColor: 'var(--hm-border)' }}
        >
          <span>
            {value.split('\n').length} 行 · {value.length} 字符
          </span>
          <span>{LANGUAGE_MAP[language]}</span>
        </div>
      ) : null}
    </div>
  );
}

interface CodeBlockProps {
  code: string;
  language?: EditorLanguage;
  /** 最大高度，超出滚动 */
  maxHeight?: number;
  /** 是否展示行号 */
  lineNumbers?: boolean;
  title?: string;
}

/** 只读代码块，用于展示日志与片段（基于 pre，比 Monaco 更轻量） */
export function CodeBlock({
  code,
  language = 'plaintext',
  maxHeight = 320,
  lineNumbers = false,
  title,
}: CodeBlockProps) {
  const { message } = AntdApp.useApp();

  const handleCopy = async () => {
    const ok = await copyToClipboard(code);
    if (ok) message.success('已复制');
  };

  const lines = code.split('\n');

  return (
    <div className="hm-editor">
      {title ? (
        <div
          className="flex items-center justify-between border-b px-3 py-2"
          style={{ borderColor: 'var(--hm-border)' }}
        >
          <span className="text-sm font-medium">{title}</span>
          <Button type="text" size="small" icon={<CopyOutlined />} onClick={handleCopy} />
        </div>
      ) : null}
      <div className="hm-scroll hm-mono p-3 text-xs leading-relaxed" style={{ maxHeight }}>
        {lineNumbers ? (
          <div className="flex">
            <div className="select-none pr-3 text-right opacity-40">
              {lines.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <pre className="m-0 flex-1 whitespace-pre-wrap break-all">{code}</pre>
          </div>
        ) : (
          <pre className="m-0 whitespace-pre-wrap break-all">{code}</pre>
        )}
      </div>
      <div className="sr-only">{language}</div>
    </div>
  );
}
