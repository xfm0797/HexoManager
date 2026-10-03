# HexoManager 项目长期笔记

## 版本发布
- 发版需**同时**改 **7 个文件 / 8 处版本号**：`version.json`、`package.json`、
  `package-lock.json`（根 `version` + `packages[""].version` 两处）、`src-tauri/tauri.conf.json`、
  `src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`（根包 `hexo-manager`）、
  `src/constants/index.ts`（`APP_META.version`，关于页/更新页的后备显示值，曾滞留在 1.0.0）。
  后三处极易滞后，必须一起同步
- `version.json` 另需维护 `major`/`minor`/`patch`/`prerelease`/`buildMetadata`、`lastUpdated`
  与 `history` 数组（history 条目含 `version`/`type`/`description`/`createdAt`）
- **预发布（RC）写法遵循 SemVer 2.0.0**：`v1.0.1RC1` 这类写法**非法**（带 `v` 前缀、
  缺 `-` 分隔、大写）；规范形式为 `1.0.2-rc.1` —— 带 `-`、小写、点分序号。
  `version.json` 的 `prerelease` 填 `rc.1`，history 条目 `type` 用 `prerelease`
- **版本号基线取「已发布的最高版本」**：修复（PATCH）应在 `1.0.1` 基础上递增为 `1.0.2`，
  而不是复用 `1.0.1`（否则预发布版低于同号正式版，老用户会被判为降级、收不到更新，
  见 `src-tauri/src/update/check.rs` 的 `is_newer`）
- `CHANGELOG.md` 遵循 Keep a Changelog：改动先进 `[Unreleased]`，发版时归档为 `[x.y.z] - 日期`。
  **用户会手工编辑此文件**（曾删除 `[Unreleased]` 标题、手改仓库链接），动它之前必须先 Read
  最新内容，且不要擅自恢复其删掉的结构
- 发布走 GitHub Actions：推送 `v*` 标签触发 `.github/workflows/build.yml` 三平台打包；
  当前 `releaseDraft: false` + `prerelease: false` = 直接发布**正式版** Release（1.0.2 起适用）

## Monaco 编辑器
- 编辑器统一走 `src/components/CodeEditor.tsx`（封装 `@monaco-editor/react`）
- **必须**由 `src/utils/monaco.ts` 把 loader 指向本地打包实例（`loader.config({ monaco })`），
  否则会从 jsDelivr CDN 加载，被 Tauri CSP（`script-src 'self'`）拦截 → 编辑区永久 loading
- worker 导入写法（`monaco-editor@0.57` exports 映射所致）：
  `import w from 'monaco-editor/<lang>/<name>.worker.js?worker'`
  —— 去掉 `esm/vs/` 前缀、保留 `.js` 扩展名

## CI（GitHub Actions）/ 跨平台打包
- **`NODE_OPTIONS: --max-old-space-size=4096` 已在 `.github/workflows/build.yml` 的 workflow 级
  `env` 中固定**：V8 老生代上限按物理内存自动推导，macos-latest 仅 7GB → 约 2048MB，
  而 vite/rollup 展开 monaco-editor + antd 的堆峰值需 2048~2560MB → 只有 macOS 打包会 OOM
  （`FATAL ERROR: Ineffective mark-compacts near heap limit`，死在 `beforeBuildCommand`）。
  ubuntu / windows-latest 为 16GB（默认 4144MB）故不受影响。**改动该 env 前先想清楚**
- **重跑失败的 workflow 无法修复此类问题**：GitHub 重跑用的是该 commit/tag 当时保存的
  workflow 定义，旧文件里的缺陷会原样复现 → 必须让新提交带上修复后重新触发
- 复现脚本：`.repro/vite-oom-repro.sh <MB>`（复跑 vite build 并判定）；跑前先前台 `rm -rf dist`
- `tauri-action` 步骤自带 `env`（GITHUB_TOKEN 等）与 workflow 级 `env` 是**合并**关系，
  同名才覆盖 → workflow 级变量在 beforeBuildCommand 里仍生效

## 本地构建 / 打包（Windows）
- 命令：`npm run tauri:build`；产物在 `src-tauri/target/release/bundle/{msi,nsis}/`
  （`hexo-manager.exe` 在 `src-tauri/target/release/`）
- **构建前必须在前台单独执行 `rm -rf dist`**：vite 清理 `dist` 会被环境的 safe-delete shim
  拦截（单次 >50 文件需授权），离屏/后台无法弹窗 → 构建直接失败
- 本地**没有** `TAURI_SIGNING_PRIVATE_KEY` → 只出 msi/nsis 安装包，不出 `.sig` 更新产物
  （签名阶段报 "A public key has been found, but no private key"），更新产物由 CI 产出
- `src-tauri/patches/schemars-0.8.22/` + `[patch.crates-io]`：**本机独有**的编译阻塞补丁。
  因果链：schemars 0.8.22 的 `preserve_order` → indexmap 1.x；indexmap 1.9.3 无
  `default = ["std"]`，其 build.rs 靠 autocfg spawn rustc（管道 stdio）探测 sysroot，本机报
  `ERROR_PIPE_BUSY(231)` → `has_std` 未置位 → `IndexMap<K,V,S>` 无默认泛型 → E0107。
  GitHub 运行器不受影响（CI 不带补丁也能编译），上游修复后应移除该补丁
- 本机 Rust：cargo/rustc 1.98.1（rustup stable-x86_64-pc-windows-msvc）；
  镜像走 `.cargo/config.toml` 里的 rsproxy

## 约定 / 注意事项
- 仓库地址统一为 **`github.com/xfm0797/HexoManager`**（与 git remote 一致；提交 `0ce793d` 已修正
  `tauri.conf.json`、`check.rs`、`src/constants/index.ts`、`README.md` 中残留的旧地址
  `xfm/hexo-manager`）。新增仓库相关引用时务必用此地址
- `.workbuddy/` 与 `.repro/` 已被纳入版本库（用户在 `c79656c` 中一并提交），不再是未跟踪目录
- `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey` **已是正式公钥**（自 2026-10-01 提交
  `754954a` 起，替换掉原 `PLACEHOLDER_UPDATE_PUBKEY`）：minisign key id `741DEDD9242E96B3`，
  值为 `.pub` 文件内容的 base64。**注意别再当成占位符**；仍需确认它与 CI
  `secrets.TAURI_SIGNING_PRIVATE_KEY` 所用的私钥配对，否则客户端签名校验会失败
- Tauri 配置的构建期覆盖机制（`pubkey` 之类不可直接读环境变量）：CLI 支持 `--config`（原始
  JSON 字符串或文件路径）与 `TAURI_CONFIG` 环境变量（原始 JSON），均按
  JSON Merge Patch (RFC 7396) 深合并，优先级 = 基础配置 < 平台配置 < `--config` < 环境变量
- 排查 Bug 的规范：先写独立 reproduction program 验证根因，再落地修复
