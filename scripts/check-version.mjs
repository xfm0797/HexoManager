#!/usr/bin/env node
/**
 * 版本号一致性校验（CI 用）。
 *
 * 版本号散落在 7 个文件 8 处，漏改一处就会导致：安装包里的版本与关于页不一致、
 * 自动更新把新版本判成旧版本、Cargo 缓存用旧 metadata 打包。
 *
 * 以 `version.json` 为准，逐个核对；任何不一致即以退出码 1 结束。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(...segments) {
  return fs.readFileSync(path.join(ROOT, ...segments), 'utf8');
}

function readJson(...segments) {
  return JSON.parse(read(...segments));
}

const problems = [];
const checked = [];

function expect(label, actual, expected) {
  checked.push(label);
  if (actual !== expected) problems.push(`${label}: ${actual}（期望 ${expected}）`);
}

const source = readJson('version.json');
const expected = source.version;

expect('version.json', expected, expected);
expect('package.json', readJson('package.json').version, expected);

const lock = readJson('package-lock.json');
expect('package-lock.json (根)', lock.version, expected);
expect('package-lock.json (packages[""])', lock.packages?.['']?.version, expected);

expect('src-tauri/tauri.conf.json', readJson('src-tauri', 'tauri.conf.json').version, expected);

const cargoToml = read('src-tauri', 'Cargo.toml');
const tomlVersion = cargoToml.match(/^version = "([^"]+)"/m)?.[1];
expect('src-tauri/Cargo.toml', tomlVersion, expected);

const cargoLock = read('src-tauri', 'Cargo.lock');
const lockVersion = cargoLock.match(
  /\[\[package\]\]\nname = "hexo-manager"\nversion = "([^"]+)"/,
)?.[1];
expect('src-tauri/Cargo.lock (hexo-manager)', lockVersion, expected);

const constants = read('src', 'constants', 'index.ts');
const metaVersion = constants.match(/version: '([^']+)'/)?.[1];
expect('src/constants/index.ts (APP_META.version)', metaVersion, expected);

// version.json 内部字段也要自洽：major.minor.patch 必须能拼回 version
const pre = source.prerelease ? `-${source.prerelease}` : '';
const rebuilt = `${source.major}.${source.minor}.${source.patch}${pre}`;
checked.push('version.json 内部字段');
if (rebuilt !== expected) {
  problems.push(`version.json 的 major/minor/patch/prerelease 拼出 ${rebuilt}，与 version 字段 ${expected} 不一致`);
}

if (problems.length) {
  console.error('✖ 版本号不一致：');
  for (const p of problems) console.error(`  · ${p}`);
  console.error(`\n以 version.json 的 ${expected} 为准，运行：npm run version:bump ${expected.replace(/^/, '')} 或手工同步。`);
  process.exit(1);
}

console.log(`✔ 版本号一致：${expected}（已核对 ${checked.length} 处）`);
