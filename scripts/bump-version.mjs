#!/usr/bin/env node
/**
 * 版本号统一改写。
 *
 * 为什么需要它：版本号散落在 7 个文件 8 处，历史上多次出现「发了版但某处还是旧值」
 * （`src/constants/index.ts` 曾长期停在 1.0.0，`Cargo.lock` 也漏改过）。
 *
 * 用法：
 *   node scripts/bump-version.mjs 1.2.1
 *   node scripts/bump-version.mjs 1.3.0-rc.1 --description "预发布：xx"
 *   node scripts/bump-version.mjs 1.2.1 --dry-run      # 只报告将要改什么
 *
 * `version.json` 是**唯一来源**，其余文件由它推导。CHANGELOG.md 不自动改写：
 * 那份文件由人工维护结构（历史上被手工删过 `[Unreleased]` 标题），脚本只在
 * 结束时提醒需要补的条目。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function read(...segments) {
  return fs.readFileSync(path.join(ROOT, ...segments), 'utf8');
}

function write(relPath, content) {
  fs.writeFileSync(path.join(ROOT, relPath), content, 'utf8');
}

/** 只替换前 n 次出现，避免误改 package-lock 里同名版本的依赖。 */
function replaceNth(source, from, to, n = 1) {
  let out = source;
  let index = 0;
  let count = 0;
  while (count < n) {
    const at = out.indexOf(from, index);
    if (at === -1) break;
    out = out.slice(0, at) + to + out.slice(at + from.length);
    index = at + to.length;
    count += 1;
  }
  return { out, count };
}

function parseArgs(argv) {
  const args = { version: null, description: null, date: null, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--description') args.description = argv[(i += 1)];
    else if (arg === '--date') args.date = argv[(i += 1)];
    else if (!args.version) args.version = arg;
    else fail(`无法识别的参数：${arg}`);
  }
  return args;
}

/** 比较新旧版本，得出 major/minor/patch */
function bumpType(prev, next) {
  const a = prev.split('-')[0].split('.').map(Number);
  const b = next.split('-')[0].split('.').map(Number);
  if (b[0] !== a[0]) return 'major';
  if (b[1] !== a[1]) return 'minor';
  if (b[2] !== a[2]) return 'patch';
  return 'prerelease';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.version) fail('用法：node scripts/bump-version.mjs <x.y.z[-pre]> [--description ...]');

  const match = SEMVER.exec(args.version);
  if (!match) {
    fail(
      `版本号不符合 SemVer 2.0.0：${args.version}\n` +
        '  正确示例：1.2.1 / 1.3.0-rc.1（不要写 v1.0.1RC1）',
    );
  }
  const [, major, minor, patch, prerelease, buildMetadata] = match;

  const versionFile = JSON.parse(read('version.json'));
  const previous = versionFile.version;
  const next = args.version;

  if (previous === next) fail(`版本号与当前一致（${next}），无需改写`);
  if (bumpType(previous, next) === 'prerelease' && !prerelease) {
    // 1.2.0 -> 1.2.0（无预发布）本身就是不合法输入，上面的相等判断已拦住
  }

  const stamp = args.date ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const changes = [];

  // ---------- 1. version.json（唯一来源）----------
  const updatedVersionJson = {
    ...versionFile,
    version: next,
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: prerelease ?? null,
    buildMetadata: buildMetadata ?? null,
    lastUpdated: stamp,
    description: args.description ?? versionFile.description,
    history: [
      ...(versionFile.history ?? []),
      {
        version: next,
        type: bumpType(previous, next),
        description: args.description ?? versionFile.description ?? '',
        createdAt: stamp,
      },
    ],
  };
  changes.push({ file: 'version.json', note: `${previous} → ${next}（含 history 追加）` });

  // ---------- 2. package.json ----------
  let pkg = read('package.json');
  const pkgRes = replaceNth(pkg, `"version": "${previous}"`, `"version": "${next}"`, 1);
  if (pkgRes.count !== 1) fail('package.json 中未找到与当前版本一致的 version 字段');
  changes.push({ file: 'package.json', note: '根 version' });

  // ---------- 3. package-lock.json（根 + packages[""] 两处）----------
  const lockPath = 'package-lock.json';
  const lock = JSON.parse(read(lockPath));
  if (lock.version !== previous) {
    fail(`package-lock.json 的 version（${lock.version}）与 version.json（${previous}）不一致，先修复再改`);
  }
  lock.version = next;
  if (lock.packages?.['']) lock.packages[''].version = next;
  changes.push({ file: lockPath, note: '根 version + packages[""]' });

  // ---------- 4. src-tauri/tauri.conf.json ----------
  let tauriConf = read('src-tauri', 'tauri.conf.json');
  const tauriRes = replaceNth(tauriConf, `"version": "${previous}"`, `"version": "${next}"`, 1);
  if (tauriRes.count !== 1) fail('tauri.conf.json 中未找到 version 字段');
  changes.push({ file: 'src-tauri/tauri.conf.json', note: '打包版本' });

  // ---------- 5. src-tauri/Cargo.toml ----------
  let cargoToml = read('src-tauri', 'Cargo.toml');
  const cargoRes = replaceNth(cargoToml, `version = "${previous}"`, `version = "${next}"`, 1);
  if (cargoRes.count !== 1) fail('Cargo.toml 中未找到包 version 字段');
  changes.push({ file: 'src-tauri/Cargo.toml', note: '[package] version' });

  // ---------- 6. src-tauri/Cargo.lock（只改 hexo-manager 那一段）----------
  let cargoLock = read('src-tauri', 'Cargo.lock');
  const lockBlock = /(\[\[package\]\]\nname = "hexo-manager"\nversion = ")([^"]+)(")/;
  if (!lockBlock.test(cargoLock)) fail('Cargo.lock 中未找到 hexo-manager 包');
  const lockCurrent = cargoLock.match(lockBlock)[2];
  if (lockCurrent !== previous) {
    fail(`Cargo.lock 的 hexo-manager 版本（${lockCurrent}）与 ${previous} 不一致，先修复再改`);
  }
  cargoLock = cargoLock.replace(lockBlock, `$1${next}$3`);
  changes.push({ file: 'src-tauri/Cargo.lock', note: '[[package]] hexo-manager' });

  // ---------- 7. src/constants/index.ts（关于页/更新页的后备显示值）----------
  let constants = read('src', 'constants', 'index.ts');
  const constRes = replaceNth(constants, `version: '${previous}'`, `version: '${next}'`, 1);
  if (constRes.count !== 1) fail('src/constants/index.ts 的 APP_META.version 未找到');
  changes.push({ file: 'src/constants/index.ts', note: 'APP_META.version' });

  if (args.dryRun) {
    console.log(`（dry-run）${previous} → ${next}`);
    for (const c of changes) console.log(`  · ${c.file}  ${c.note}`);
    return;
  }

  write('version.json', `${JSON.stringify(updatedVersionJson, null, 2)}\n`);
  write('package.json', pkgRes.out);
  write(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  write(path.join('src-tauri', 'tauri.conf.json'), tauriRes.out);
  write(path.join('src-tauri', 'Cargo.toml'), cargoRes.out);
  write(path.join('src-tauri', 'Cargo.lock'), cargoLock);
  write(path.join('src', 'constants', 'index.ts'), constRes.out);

  console.log(`✔ 版本已更新：${previous} → ${next}（${bumpType(previous, next)}）`);
  for (const c of changes) console.log(`  · ${c.file}  ${c.note}`);
  console.log('');
  console.log('后续步骤：');
  console.log('  1. 在 CHANGELOG.md 里把 [Unreleased] 归档为新的版本段落（该文件结构由人工维护，脚本不改）');
  console.log(`  2. git commit -m "chore(release): v${next}"`);
  console.log(`  3. git tag v${next} && git push origin v${next}`);
}

main();
