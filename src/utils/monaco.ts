/**
 * Monaco 编辑器自托管配置
 *
 * 背景：`@monaco-editor/react` 底层用 `@monaco-editor/loader` 加载 Monaco，
 * 后者默认从 jsDelivr CDN（https://cdn.jsdelivr.net/...）动态注入 <script>。
 * 但应用 CSP（src-tauri/tauri.conf.json）的 `script-src 'self'` 只允许同源脚本，
 * 外链会被 WebView 拦截 → loader 的 Promise 永不 resolve → <Editor> 永久 loading。
 *
 * 修复：把 loader 指向本地打包的 monaco 实例，并配置 Web Worker，
 * 彻底去掉运行时的 CDN 依赖（同时规避离线/内网环境不可用问题）。
 */

import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';

// Vite 会把这些 worker 单独打包并返回构造函数。
// 注意：monaco-editor@0.57 的 package.json `exports` 把子路径映射为
// `./esm/vs/*.js`，因此这里必须去掉 `esm/vs/` 前缀并保留 `.js` 扩展名。
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import cssWorker from 'monaco-editor/language/css/css.worker.js?worker';
import htmlWorker from 'monaco-editor/language/html/html.worker.js?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker';

type MonacoWorkerFactory = (moduleId: string, label: string) => Worker;

// 各语言对应的 worker；未命中时回退到通用 editor worker
(globalThis as unknown as { MonacoEnvironment: { getWorker: MonacoWorkerFactory } }).MonacoEnvironment =
  {
    getWorker(_moduleId, label) {
      switch (label) {
        case 'json':
          return new jsonWorker();
        case 'css':
        case 'scss':
        case 'less':
          return new cssWorker();
        case 'html':
        case 'handlebars':
        case 'razor':
          return new htmlWorker();
        case 'typescript':
        case 'javascript':
          return new tsWorker();
        default:
          return new editorWorker();
      }
    },
  };

// 关键一行：让 @monaco-editor/react 使用本地 monaco，不再从 CDN 拉取
loader.config({ monaco });
