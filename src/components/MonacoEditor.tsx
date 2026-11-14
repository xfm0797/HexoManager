/**
 * Monaco 编辑器实现（内部组件）。
 *
 * 为什么单独拆一个模块：Monaco 打包后接近 4MB，如果由 `CodeEditor` 直接静态
 * 引入，它会跟着首屏一起解析。`CodeEditor` 通过 `React.lazy` 加载本模块，
 * Monaco 及其 worker 就只在真正打开编辑器时才加载。
 *
 * `@/utils/monaco` 必须在本模块求值时就执行（把 loader 指向本地实例、
 * 注册 worker），这样 `Editor` 首次渲染时不会去 CDN 拉脚本（会被 CSP 拦截）。
 */

import Editor, { type OnMount } from '@monaco-editor/react';
import '@/utils/monaco';

export interface MonacoEditorProps {
  value: string;
  /** Monaco 语言 id（yaml / json / markdown / ini / shell / javascript …） */
  language: string;
  /** 主题名（hm-light / hm-dark，已在 onMount 中注册） */
  theme: string;
  readOnly: boolean;
  wordWrap: boolean;
  onChange?: (value: string) => void;
  onMount?: OnMount;
}

export default function MonacoEditor({
  value,
  language,
  theme,
  readOnly,
  wordWrap,
  onChange,
  onMount,
}: MonacoEditorProps) {
  return (
    <Editor
      value={value}
      language={language}
      theme={theme}
      onMount={onMount}
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
  );
}
