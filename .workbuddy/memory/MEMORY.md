# HexoManager 项目长期笔记

## 版本发布
- 发版需**同时**改 6 处版本号：`version.json`、`package.json`、`package-lock.json`
  （根包 `version` + `packages[""].version` 两处）、`src-tauri/tauri.conf.json`、
  `src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`（根包 `hexo-manager` 的 `version`）。
  后两者极易滞后（Cargo.lock 曾停在 1.0.0、package-lock 曾停在 1.0.0），必须一起同步
- `version.json` 另需维护 `major`/`minor`/`patch`/`prerelease`/`buildMetadata`、`lastUpdated`
  与 `history` 数组（history 条目含 `version`/`type`/`description`/`createdAt`）
- **预发布（RC）写法遵循 SemVer 2.0.0**：`v1.0.1RC1` 这类写法**非法**（带 `v` 前缀、
  缺 `-` 分隔、大写）；规范形式为 `1.0.2-rc.1` —— 带 `-`、小写、点分序号。
  `version.json` 的 `prerelease` 填 `rc.1`，history 条目 `type` 用 `prerelease`
- **版本号基线取「已发布的最高版本」**：修复（PATCH）应在 `1.0.1` 基础上递增为 `1.0.2`，
  而不是复用 `1.0.1`（否则预发布版低于同号正式版，老用户会被判为降级、收不到更新，
  见 `src-tauri/src/update/check.rs` 的 `is_newer`）
- `CHANGELOG.md` 遵循 Keep a Changelog：改动先进 `[Unreleased]`，发版时归档为 `[x.y.z] - 日期`
  （注意：现有文件只维护了 `[Unreleased]`/`[1.0.0]` 的链接引用，`[1.0.1]` 缺链接定义）
- 发布走 GitHub Actions：推送 `v*` 标签触发 `.github/workflows/build.yml` 三平台打包，`tauri-action` 直接发布正式版 Release
  —— 但 `.github/workflows/build.yml` 的 `prerelease: false` + `releaseDraft: false` 意味着
  **RC 标签也会被当成 Latest Release** 推给全部用户，发 RC 前需先改为 `prerelease: true`

## Monaco 编辑器
- 编辑器统一走 `src/components/CodeEditor.tsx`（封装 `@monaco-editor/react`）
- **必须**由 `src/utils/monaco.ts` 把 loader 指向本地打包实例（`loader.config({ monaco })`），
  否则会从 jsDelivr CDN 加载，被 Tauri CSP（`script-src 'self'`）拦截 → 编辑区永久 loading
- worker 导入写法（`monaco-editor@0.57` exports 映射所致）：
  `import w from 'monaco-editor/<lang>/<name>.worker.js?worker'`
  —— 去掉 `esm/vs/` 前缀、保留 `.js` 扩展名

## 约定 / 注意事项
- `.workbuddy/` **未**被 `.gitignore` 忽略，`git add -A` 会把 memory 文件带进提交（建议忽略）
- `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey` **已是正式公钥**（自 2026-10-01 提交
  `754954a` 起，替换掉原 `PLACEHOLDER_UPDATE_PUBKEY`）：minisign key id `741DEDD9242E96B3`，
  值为 `.pub` 文件内容的 base64。**注意别再当成占位符**；仍需确认它与 CI
  `secrets.TAURI_SIGNING_PRIVATE_KEY` 所用的私钥配对，否则客户端签名校验会失败
- Tauri 配置的构建期覆盖机制（`pubkey` 之类不可直接读环境变量）：CLI 支持 `--config`（原始
  JSON 字符串或文件路径）与 `TAURI_CONFIG` 环境变量（原始 JSON），均按
  JSON Merge Patch (RFC 7396) 深合并，优先级 = 基础配置 < 平台配置 < `--config` < 环境变量
- 排查 Bug 的规范：先写独立 reproduction program 验证根因，再落地修复
