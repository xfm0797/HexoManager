#!/usr/bin/env node
/**
 * i18n 覆盖率检查。
 *
 * 用法：node scripts/i18n-coverage.mjs [--list]
 *
 * 做两件事：
 *   1. 统计源码里 `t('…')` 包裹的词条，与 locales/en-US.ts 的字典比对，列出**缺译文**的条目；
 *   2. 统计各文件里**尚未被 t() 包裹**的中文（排除注释），作为改造进度参考。
 *
 * 退出码：存在缺译文时为 1（可用于 CI 卡口）。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SRC = join(ROOT, 'src');
const DICT = join(SRC, 'i18n', 'locales', 'en-US.ts');

const CJK = /[\u4e00-\u9fff]/;
const LIST = process.argv.includes('--list');

/**
 * 允许「英文译文」里仍保留中文的例外。
 *
 * 语言名称按惯例用**母语自称**（autonym）：英文界面下把中文选项写成「简体中文」，
 * 中文用户才能一眼认出自己的语言；反之写作 "Simplified Chinese" 反而更难辨认。
 */
const ALLOW_CJK_IN_TRANSLATION = new Set(['简体中文']);

/** 递归收集源文件 */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * 还原 JS 字符串字面量里的转义序列（单趟扫描，避免 `\\\\` 与 `\\n` 的处理顺序互相干扰）。
 * 必须与 scripts/i18n-merge.mjs 的实现保持一致，否则源码词条与字典键会比对不上。
 */
function unescapeJs(s) {
  return s.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, esc) => {
    switch (esc[0]) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case 'v':
        return '\v';
      case '0':
        return '\0';
      case 'u':
      case 'x':
        return String.fromCharCode(parseInt(esc.slice(1), 16));
      default:
        return esc;
    }
  });
}

/** 解析字典的键 */
function readDictKeys() {
  return new Set(readDictEntries().keys());
}

/** 解析字典的「键 → 值」 */
function readDictEntries() {
  const text = readFileSync(DICT, 'utf8');
  const entries = new Map();
  const re = /^\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|([^:\n]+?))\s*:\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")\s*,?\s*$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    // 带引号的键要原样保留（可能以空格开头）；只有裸键才需要 trim
    const key = m[3] !== undefined ? m[3].trim() : m[1] ?? m[2] ?? '';
    if (key) entries.set(unescapeJs(key), unescapeJs(m[4] ?? m[5] ?? ''));
  }
  return entries;
}

/** 提取 `t('…')` / `t("…")` 的词条 */
function readUsedTerms(files) {
  const used = new Map(); // term -> Set<file>
  const re = /\bt\(\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")/g;
  for (const file of files) {
    if (file.includes(join('src', 'i18n'))) continue;
    const text = readFileSync(file, 'utf8');
    let m;
    while ((m = re.exec(text)) !== null) {
      const raw = unescapeJs(m[1] ?? m[2]);
      if (!used.has(raw)) used.set(raw, new Set());
      used.get(raw).add(relative(ROOT, file));
    }
  }
  return used;
}

/** 统计尚未包裹 t() 的中文行（跳过注释与已被 t() 包裹的行） */
function countRemaining(files) {
  const rows = [];
  let total = 0;
  for (const file of files) {
    if (file.includes(join('src', 'i18n'))) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    let n = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
      if (!CJK.test(line)) continue;
      // 该行若只剩 t('…') 里的中文，视为已转换
      const stripped = line.replace(/\bt\(\s*(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g, 't()');
      if (!CJK.test(stripped)) continue;
      n += 1;
    }
    if (n > 0) rows.push([n, relative(ROOT, file)]);
    total += n;
  }
  rows.sort((a, b) => b[0] - a[0]);
  return { total, rows };
}

const files = walk(SRC);
const dictEntries = readDictEntries();
const dict = new Set(dictEntries.keys());
const used = readUsedTerms(files);
const missing = [...used.keys()].filter((term) => CJK.test(term) && !dict.has(term));
const unused = [...dict].filter((key) => !used.has(key));
const remaining = countRemaining(files);
const cjkTerms = [...used.keys()].filter((term) => CJK.test(term));
// 英文译文里不应再出现中日韩字符：AppImage 目录等场景会按此判定「界面是否英文」
const cjkInTranslation = [...dictEntries].filter(
  ([key, value]) => CJK.test(value) && !ALLOW_CJK_IN_TRANSLATION.has(key),
);

console.log(`词条总数（源码中被 t() 包裹的含中文条目）：${cjkTerms.length}`);
console.log(`字典条目：${dict.size}   已覆盖：${cjkTerms.length - missing.length}   缺译文：${missing.length}`);
console.log(`译文中仍含中文：${cjkInTranslation.length}`);
console.log(`尚未转换的中文代码行：${remaining.total}`);

if (missing.length) {
  console.log('\n--- 缺译文 ---');
  for (const term of missing) {
    console.log(`  ${JSON.stringify(term)}    ← ${[...used.get(term)].join(', ')}`);
  }
}

if (cjkInTranslation.length) {
  console.log('\n--- 英文字典中仍含中文的条目（英文界面会漏出中文） ---');
  for (const [key, value] of cjkInTranslation) {
    console.log(`  ${JSON.stringify(key)}  =>  ${JSON.stringify(value)}`);
  }
}

if (LIST && unused.length) {
  console.log('\n--- 字典中未使用的条目 ---');
  for (const key of unused) console.log(`  ${JSON.stringify(key)}`);
}

if (LIST && remaining.rows.length) {
  console.log('\n--- 未转换中文行分布 ---');
  for (const [n, file] of remaining.rows) console.log(`  ${String(n).padStart(4)}  ${file}`);
}

process.exit(missing.length || cjkInTranslation.length ? 1 : 0);
