#!/usr/bin/env node
/**
 * 合并 `src/i18n/locales/_parts/*.json` 词条零件 → 写入 `src/i18n/locales/en-US.ts`。
 *
 * 语义是**增量合并**：先读回 en-US.ts 里已有的词条，再用零件覆盖同名键，
 * 最后按字典序重写整个文件。因此手工在 en-US.ts 里做的修正不会被清掉，
 * 零件只用来批量新增。零件目录合并后会清空（除非加 --keep）。
 *
 * 用法：node scripts/i18n-merge.mjs [--keep]
 */

import { readFileSync, writeFileSync, readdirSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PARTS = join(ROOT, 'src', 'i18n', 'locales', '_parts');
const OUT = join(ROOT, 'src', 'i18n', 'locales', 'en-US.ts');
const KEEP = process.argv.includes('--keep');

if (!existsSync(PARTS)) mkdirSync(PARTS, { recursive: true });

const merged = new Map();
const dupes = [];

// 1) 先读回现有字典（进 TS 前先还原转义）
if (existsSync(OUT)) {
  const text = readFileSync(OUT, 'utf8');
  const re = /^\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')\s*:\s*"((?:\\.|[^"\\])*)"\s*,?\s*$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const key = unescapeJs((m[1] ?? m[2]));
    const value = unescapeJs(m[3]);
    merged.set(key, value);
  }
}

/**
 * 还原 JS 字符串字面量里的转义序列（单趟扫描，避免 `\\\\` 与 `\\n` 的处理顺序互相干扰）。
 * 必须与 scripts/i18n-coverage.mjs 的实现保持一致，否则源码词条与字典键会比对不上。
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

// 2) 零件覆盖
for (const name of readdirSync(PARTS).filter((f) => f.endsWith('.json')).sort()) {
  let data;
  try {
    data = JSON.parse(readFileSync(join(PARTS, name), 'utf8'));
  } catch (e) {
    console.error(`✗ ${name} 不是合法 JSON：${e.message}`);
    process.exit(1);
  }
  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== 'string') {
      console.error(`✗ ${name}: 「${key}」的值不是字符串`);
      process.exit(1);
    }
    if (merged.has(key) && merged.get(key) !== value) {
      dupes.push(`「${key}」：${JSON.stringify(merged.get(key))} → ${JSON.stringify(value)} (${name})`);
    }
    merged.set(key, value);
  }
}

if (dupes.length) {
  console.log('⚠️ 零件覆盖了已有译文：');
  for (const d of dupes) console.log('   ' + d);
}

const entries = [...merged.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-Hans-CN'));
const body = entries
  .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
  .join('\n');

const header = `/**
 * 英文词条字典（由 scripts/i18n-merge.mjs 从 locales/_parts/*.json 生成，请勿手工编辑）。
 *
 * 键 = 源码里的中文原文，值 = 英文译文。未收录的条目运行时会原样回退中文，
 * 覆盖率用 \`node scripts/i18n-coverage.mjs\` 检查。
 *
 * 新增文案的流程：把中文原文 + 英文译文写进 locales/_parts/ 下的任意一个 .json，
 * 然后跑 \`node scripts/i18n-merge.mjs\` 重新生成本文件。
 */

export const EN_US: Record<string, string> = {
${body}
};
`;

writeFileSync(OUT, header, 'utf8');
console.log(`✓ 已生成 ${OUT.replace(ROOT, '')}，共 ${entries.length} 条`);

if (!KEEP) {
  for (const name of readdirSync(PARTS)) rmSync(join(PARTS, name), { force: true });
  rmSync(PARTS, { recursive: true, force: true });
  console.log('✓ 已清理词条零件目录');
}
