#!/usr/bin/env node
/**
 * 错误码一致性检查。
 *
 * 用法：node scripts/error-codes-check.mjs
 *
 * 背景：后端错误靠 `AppError::coded("<模块>.<语义>", …)` 里的 code 找译文
 * （`src/i18n/errorCodes.ts`）。code 是跨语言的手写字符串，写错不会有编译错误 ——
 * 漏一条的后果是英文界面退回中文原文，很难被发现。这里做静态比对：
 *
 *   1. Rust 里用到的 code 必须在字典里有条目（缺失 = 失败）；
 *   2. 译文里不允许残留中文（英文界面会漏中文 = 失败）；
 *   3. 语义码必须形如 `<模块>.<语义>`，通用码必须与 `AppError::code()` 完全一致
 *      （新增粗粒度变体却忘了配译文 = 失败）；
 *   4. 不许再用 `err!` 宏，也不许把中文字面量直接塞进原始错误变体
 *      （`AppError::Other("…")` / `Err("…".into())` / `map_err(|e| format!("…"))`）——
 *      那些位置没有 code，删掉文本映射层后就再也翻不了了；
 *   5. 字典里有、Rust 里没用的条目只提示（可能是功能下线留下的孤儿）。
 *
 * 退出码：1 表示存在错误。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DICT = join(ROOT, 'src', 'i18n', 'errorCodes.ts');
const RUST_SRC = join(ROOT, 'src-tauri', 'src');
const ERROR_RS = join(RUST_SRC, 'utils', 'error.rs');

const CJK = /[\u4e00-\u9fff]/;

/** 递归收集 Rust 源文件 */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.rs')) out.push(full);
  }
  return out;
}

/** 解析 `ERROR_CODES` 对象字面量里的 `'code': 'template'` 对 */
function parseDict(source) {
  const start = source.indexOf('ERROR_CODES');
  if (start < 0) throw new Error('errorCodes.ts 里找不到 ERROR_CODES');
  const body = source.slice(start);
  const entries = new Map();
  const re = /'([a-z0-9_.]+)':\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
  let m;
  while ((m = re.exec(body))) {
    entries.set(m[1], m[2] ?? m[3]);
  }
  return entries;
}

/** 收集 Rust 侧 `AppError::coded("…")` 用到的 code 及其文件位置 */
function collectRustCodes(files) {
  const used = new Map();
  const re = /AppError::coded\(\s*"([a-z0-9_.]+)"/g;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    let m;
    while ((m = re.exec(text))) {
      const line = text.slice(0, m.index).split('\n').length;
      const rel = file.slice(ROOT.length).replace(/\\/g, '/');
      if (!used.has(m[1])) used.set(m[1], []);
      used.get(m[1]).push(`${rel}:${line}`);
    }
  }
  return used;
}

/** `AppError::code()` 里的通用码（粗粒度变体），是字典通用码的权威来源 */
function collectGenericCodes() {
  const text = readFileSync(ERROR_RS, 'utf8');
  const re = /AppError::\w+\(_\)\s*=>\s*"([a-z0-9_]+)"/g;
  const out = new Set();
  let m;
  while ((m = re.exec(text))) out.add(m[1]);
  return out;
}

/**
 * 没有错误码的中文错误构造 —— 这些位置删掉文本映射层后必定漏中文。
 *
 * 只匹配「中文字面量直接出现在构造函数参数里」的写法：`AppError::coded(...)`
 * 的第二个参数本来就是中文原文，因此加了负向断言把它排除掉。
 * 变量入参（如 `AppError::Process(out.combined())`）不受影响。
 */
const RAW_ERROR_PATTERNS = [
  // AppError::Other("…") / AppError::Other(format!("…"))
  /AppError::(?:Other|InvalidArgument|NotFound|Forbidden|Network|Process|Yaml|PathNotFound)\(\s*(?:format!\(\s*)?"[^"\n]*[\u4e00-\u9fff]/,
  // Err("…".into())
  /Err\(\s*(?:format!\(\s*)?"[^"\n]*[\u4e00-\u9fff]/,
  // .map_err(|e| format!("…")) / .ok_or_else(|| "…")
  /\.map_err\((?:(?!AppError::coded)[\s\S]){0,160}?format!\(\s*"[^"\n]*[\u4e00-\u9fff]/,
  /ok_or_else\((?:(?!AppError::coded)[\s\S]){0,160}?"[^"\n]*[\u4e00-\u9fff]/,
];

/** 跳过 `#[cfg(test)] mod …` 之后的代码：测试里的中文是断言消息，不是给用户看的。 */
function stripTestModules(text) {
  const m = text.match(/\n#\[cfg\(test\)\]\s*\nmod /);
  return m ? text.slice(0, m.index) : text;
}

function collectRawChineseErrors(files) {
  const seen = new Set();
  const hits = [];
  for (const file of files) {
    const text = stripTestModules(readFileSync(file, 'utf8'));
    const lines = text.split('\n');
    const rel = file.slice(ROOT.length).replace(/\\/g, '/');
    for (const re of RAW_ERROR_PATTERNS) {
      const g = new RegExp(re.source, 'g');
      let m;
      while ((m = g.exec(text))) {
        const lineNo = text.slice(0, m.index).split('\n').length;
        const line = lines[lineNo - 1].trim();
        if (line.startsWith('//')) continue;
        // 显式豁免：只给没有前端错误通道的路径（如启动期初始化）用。
        // 标记可以写在命中行或其上方 3 行内（构造常被折成多行）。
        const window = lines.slice(Math.max(0, lineNo - 4), lineNo).join('\n');
        if (window.includes('error-codes-check: skip')) continue;
        const key = `${rel}:${lineNo}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push(`${key}  ${line.slice(0, 90)}`);
      }
    }
  }
  return hits;
}

function collectErrMacro(files) {
  const hits = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const rel = file.slice(ROOT.length).replace(/\\/g, '/');
    const re = /\berr!\(/g;
    let m;
    while ((m = re.exec(text))) {
      const lineNo = text.slice(0, m.index).split('\n').length;
      hits.push(`${rel}:${lineNo}`);
    }
  }
  return hits;
}

const rustFiles = walk(RUST_SRC);
const dict = parseDict(readFileSync(DICT, 'utf8'));
const used = collectRustCodes(rustFiles);
const genericsInRust = collectGenericCodes();

const semantic = [...dict.keys()].filter((c) => c.includes('.'));
const genericsInDict = new Set([...dict.keys()].filter((c) => !c.includes('.')));

const missing = [...used.keys()].filter((code) => !dict.has(code)).sort();
const orphan = [...dict.keys()].filter((code) => !used.has(code) && code.includes('.')).sort();
const cjkInTranslation = [...dict.entries()].filter(([, value]) => CJK.test(value));
const badNaming = semantic.filter((c) => !/^[a-z][a-z0-9]*(\.[a-z0-9_]+)+$/.test(c)).sort();
const genericMissing = [...genericsInRust].filter((c) => !genericsInDict.has(c)).sort();
const genericExtra = [...genericsInDict].filter((c) => !genericsInRust.has(c)).sort();
const rawChinese = collectRawChineseErrors(rustFiles);
const errMacro = collectErrMacro(rustFiles);

console.log(`字典条目：${dict.size}（语义 ${semantic.length} / 通用 ${genericsInDict.size}）`);
console.log(`Rust 侧使用的语义 code：${used.size}`);
console.log(`缺译文的 code：${missing.length}   未使用的条目：${orphan.length}`);
console.log(`译文含中文：${cjkInTranslation.length}   命名不规范：${badNaming.length}`);
console.log(`通用码不一致：${genericMissing.length + genericExtra.length}`);
console.log(`无码的中文错误：${rawChinese.length}   err! 残留：${errMacro.length}`);

let failed = false;

if (missing.length) {
  failed = true;
  console.log('\n--- 字典缺失的 code（英文界面会退回中文） ---');
  for (const code of missing) console.log(`  ${code}    ← ${used.get(code).join(', ')}`);
}

if (cjkInTranslation.length) {
  failed = true;
  console.log('\n--- 译文里仍含中文 ---');
  for (const [code, value] of cjkInTranslation) {
    console.log(`  ${code}  =>  ${JSON.stringify(value)}`);
  }
}

if (badNaming.length) {
  failed = true;
  console.log('\n--- 语义码命名不规范（应为 <模块>.<语义>，全小写） ---');
  for (const code of badNaming) console.log(`  ${code}`);
}

if (genericMissing.length) {
  failed = true;
  console.log('\n--- AppError 变体有通用码但字典没配译文 ---');
  for (const code of genericMissing) console.log(`  ${code}`);
}

if (genericExtra.length) {
  failed = true;
  console.log('\n--- 字典里的通用码在 AppError::code() 中不存在 ---');
  for (const code of genericExtra) console.log(`  ${code}`);
}

if (errMacro.length) {
  failed = true;
  console.log('\n--- 仍在使用 err! 宏（改用 AppError::coded("<模块>.<语义>", …)） ---');
  for (const hit of errMacro) console.log(`  ${hit}`);
}

if (rawChinese.length) {
  failed = true;
  console.log('\n--- 中文字面量直接进了没有错误码的构造（请改用 AppError::coded） ---');
  for (const hit of rawChinese) console.log(`  ${hit}`);
}

if (orphan.length) {
  console.log('\n--- 字典里已无 Rust 引用的条目（可清理） ---');
  for (const code of orphan) console.log(`  ${code}`);
}

process.exit(failed ? 1 : 0);
