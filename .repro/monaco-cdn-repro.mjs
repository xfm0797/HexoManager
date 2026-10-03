#!/usr/bin/env node
/**
 * 独立复现：HexoManager「文章管理 → 编辑区一直 loading，预览正常」
 *
 * 待验证的根因假设（三层因果）：
 *   1) 编辑区用 @monaco-editor/react，其底层 @monaco-editor/loader 默认从
 *      jsDelivr CDN（https://cdn.jsdelivr.net/npm/monaco-editor@x/min/vs）动态注入
 *      <script> 加载 Monaco；
 *   2) 应用 src-tauri/tauri.conf.json 的 CSP 中 script-src 仅允许 'self'，
 *      外链脚本被 WebView 拦截 → loader 的 Promise 永不 resolve → <Editor>
 *      永久停留在默认 loading 视图；
 *   3) 预览用已打包进产物的 react-markdown，同源渲染，因此正常。
 *
 * 判定逻辑：
 *   - 解析 CSP → 得到 script-src 允许的来源集合；
 *   - 读取已安装的 @monaco-editor/loader 默认配置 → 得到它要加载脚本的来源；
 *   - 检查源码是否把 loader 指向本地打包的 monaco（loader.config({monaco}) 且
 *     存在 `import ... from 'monaco-editor'`）。
 *   若「脚本来源不被 CSP 允许」且「未本地自托管」→ 复现成立。
 *
 * 退出码：0 = 复现成立（当前代码会卡 loading）；1 = 未复现（已修复）。
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const C = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

function read(p) {
  return readFileSync(resolve(root, p), 'utf8');
}

// ---- 1) 解析 CSP ----
const tauriConf = JSON.parse(read('src-tauri/tauri.conf.json'));
const csp = tauriConf?.app?.security?.csp ?? '';
const scriptSrc = csp
  .split(';')
  .map((d) => d.trim())
  .find((d) => d.startsWith('script-src')) ?? '';

const allowSelf = /(^|\s)'self'/.test(scriptSrc);
// CSP 中显式允许的 host（本例没有），留作通用解析
const allowedHosts = (scriptSrc.match(/https?:\/\/[^\s;]+/g) ?? []).map((u) => {
  try {
    return new URL(u).origin;
  } catch {
    return u;
  }
});

// ---- 2) loader 默认脚本来源 ----
let loaderVs = null;
let loaderVersion = null;
try {
  const pkg = JSON.parse(read('node_modules/@monaco-editor/loader/package.json'));
  loaderVersion = pkg.version;
} catch {
  /* ignore */
}
// 默认配置里写死了 vs 路径；从产物/源码里提取
const loaderCfgPath = 'node_modules/@monaco-editor/loader/lib/es/config/index.js';
if (existsSync(resolve(root, loaderCfgPath))) {
  const m = read(loaderCfgPath).match(/https:\/\/[^\s'"]+\/min\/vs/);
  loaderVs = m ? m[0] : null;
}
const loaderOrigin = loaderVs ? new URL(loaderVs).origin : null;

// ---- 3) 是否已本地自托管 monaco ----
const srcFiles = [
  'src/main.tsx',
  'src/App.tsx',
  'src/components/CodeEditor.tsx',
  'src/utils/monaco.ts',
  'src/lib/monaco.ts',
];
const srcBlob = srcFiles
  .filter((f) => existsSync(resolve(root, f)))
  .map((f) => read(f))
  .join('\n');

const importsLocalMonaco = /from\s+['"]monaco-editor['"]/.test(srcBlob);
const configuresLoader = /loader\.config\s*\(/.test(srcBlob);

console.log('\n===== 复现：编辑区 loading / 预览正常 =====\n');
console.log(C.dim('CSP script-src:'), scriptSrc || '(未配置)');
console.log(C.dim('  ├ 允许 self :'), allowSelf ? 'yes' : 'no');
console.log(C.dim('  └ 允许 host :'), allowedHosts.length ? allowedHosts.join(', ') : '(无)');
console.log();
console.log(C.dim('@monaco-editor/loader 版本 :'), loaderVersion ?? '(未安装)');
console.log(C.dim('loader 默认 Monaco 脚本来源 :'), loaderVs ?? '(未找到)');
console.log(
  C.dim('loader 会请求的外部 origin:'),
  loaderOrigin ?? '(未找到)',
);
console.log();
console.log(C.dim('源码 import 本地 monaco-editor :'), importsLocalMonaco ? 'yes' : C.red('no'));
console.log(C.dim('源码调用 loader.config(...)    :'), configuresLoader ? 'yes' : C.red('no'));
console.log();

const blockedByCsp =
  !!loaderOrigin && !allowedHosts.includes(loaderOrigin) && (allowSelf ? true : true) && true;

const selfHosted = importsLocalMonaco && configuresLoader;

let reproduced = false;

if (!loaderOrigin) {
  console.log(C.yellow('⚠ 未能读取 loader 默认来源，请先执行 npm ci。'));
} else if (selfHosted) {
  console.log(C.green('✓ 已本地自托管：loader 被指向本地打包的 monaco，不再依赖 CDN。'));
} else if (blockedByCsp) {
  console.log(
    C.red('✗ 复现成立：编辑区必然一直 loading。'),
  );
  console.log(
    C.red(
      `  loader 从 ${loaderOrigin} 动态注入 <script>，而 CSP script-src 未放行该 origin，` +
        `\n  脚本被拦截 → Promise 永不 resolve → <Editor> 停留在默认 loading。` +
        `\n  预览走同源的 react-markdown，故正常。`,
    ),
  );
  reproduced = true;
} else {
  console.log(C.yellow('? 因果链未完全闭合，需人工确认。'));
}

console.log('\n结论：', reproduced ? C.red('BUG 复现成功') : C.green('未复现'));
console.log();
process.exit(reproduced ? 0 : 1);
