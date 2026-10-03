// 用 Vite 自身的解析器探测各 worker specifier 是否可解析
import { createServer } from 'vite';

const ids = [
  'monaco-editor',
  'monaco-editor/editor/editor.worker.js?worker',
  'monaco-editor/language/json/json.worker.js?worker',
  'monaco-editor/language/css/css.worker.js?worker',
  'monaco-editor/language/html/html.worker.js?worker',
  'monaco-editor/language/typescript/ts.worker.js?worker',
];

const server = await createServer({
  configFile: 'vite.config.ts',
  server: { middlewareMode: true },
  logLevel: 'silent',
});

for (const id of ids) {
  try {
    const r = await server.pluginContainer.resolveId(id, undefined, { ssr: false });
    console.log(r?.id ? 'OK  ' : 'NULL', String(r?.id ?? '').padEnd(70), '<=', id);
  } catch (e) {
    console.log('ERR ', e.message, '<=', id);
  }
}

await server.close();
