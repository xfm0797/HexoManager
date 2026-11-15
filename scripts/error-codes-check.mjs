#!/usr/bin/env node
/**
 * 错误码一致性检查。
 *
 * 用法：node scripts/error-codes-check.mjs
 *
 * 背景：后端的结构化错误靠 `AppError::coded("site.not_found", …)` 里的 code
 * 找译文（`src/i18n/errorCodes.ts`）。code 是跨语言的手写字符串，写错不会有
 * 编译错误 —— 漏一条的后果是英文界面退回中文原文，很难被发现。这里静态比对：
 *
 *   1. Rust 里用到的 code 必须在字典里有条目（缺失 = 失败）；
 *   2. 译文里不允许残留中文（英文界面会漏中文 = 失败）；
 *   3. 字典里有、Rust 里没用的条目只提示（可能是功能下线留下的孤儿）。
 *
 * 退出码：1 表示存在错误。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DICT = join(ROOT, 'src', 'i18n', 'errorCodes.ts');
const RUST_SRC = join(ROOT, 'src-tauri', 'src');

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
function collectRustCodes() {
  const used = new Map();
  for (const file of walk(RUST_SRC)) {
    const text = readFileSync(file, 'utf8');
    const re = /AppError::coded\(\s*"([a-z0-9_.]+)"/g;
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

const dict = parseDict(readFileSync(DICT, 'utf8'));
const used = collectRustCodes();

const missing = [...used.keys()].filter((code) => !dict.has(code)).sort();
const orphan = [...dict.keys()].filter((code) => !used.has(code)).sort();
const cjkInTranslation = [...dict.entries()].filter(([, value]) => CJK.test(value));

console.log(`字典条目：${dict.size}   Rust 侧使用的 code：${used.size}`);
console.log(`缺译文的 code：${missing.length}   未使用的条目：${orphan.length}`);
console.log(`译文含中文：${cjkInTranslation.length}`);

if (missing.length) {
  console.log('\n--- 字典缺失的 code（英文界面会退回中文） ---');
  for (const code of missing) console.log(`  ${code}    ← ${used.get(code).join(', ')}`);
}

if (cjkInTranslation.length) {
  console.log('\n--- 译文里仍含中文 ---');
  for (const [code, value] of cjkInTranslation) {
    console.log(`  ${code}  =>  ${JSON.stringify(value)}`);
  }
}

if (orphan.length) {
  console.log('\n--- 字典里已无 Rust 引用的条目（可清理） ---');
  for (const code of orphan) console.log(`  ${code}`);
}

process.exit(missing.length || cjkInTranslation.length ? 1 : 0);
