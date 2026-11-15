# HexoManager 架构评审与优化建议

> 评审对象：`v1.2.0`（commit `729515c`）
> 评审范围：`src/`（前端 20.3k 行）、`src-tauri/src/`（Rust 后端 ~6.5k 行）、构建与发布配置、CI、部署模板
> 方法：全量阅读源码 + 类型/规范检查（`tsc --noEmit`、`eslint --max-warnings 0` 均通过）+ 构建产物测量

> **落地进度（2026-11-14 更新，四轮迭代后）**
>
> | 迭代 | 范围 | 状态 |
> |---|---|---|
> | 迭代 1 | P0-1 / P0-2 / P0-3（数据正确性） | ✅ 已完成 |
> | 迭代 2 | P1-1 / P1-2 / P1-3 / P1-5，P1-4 部分 | ✅ 已完成 |
> | 迭代 3 | P2-1 / P2-2 / P2-4 / P2-5 / P2-7 / P3-1 / P3-2，P2-3 部分 | ✅ 已完成 |
> | 迭代 4 | P2-6 / P2-8 / P3-4，P2-5 收尾（`article_commands` 二次拆分） | ✅ 已完成 |
| 迭代 5 | P3-3（后端错误码化，全模块） | ✅ 已完成 |
>
> 详见 `CHANGELOG.md` 的 `[Unreleased]`。实测：`dist` 16 MB → **6.9 MB**，首屏 JS 不再包含 Monaco；
> 列表/统计接口不再触发全站扫描；所有重 IO 命令已离开主线程；所有命令返回结构化错误；
> `cargo check --all-targets` / `tsc --noEmit` / `eslint --max-warnings 0` /
> `i18n:check`（含错误码一致性）/ `version:check` 全绿，CI 上 52 个 Rust 测试通过。
>
> **仍未落地**：CI 中 `cargo clippy` 仍是软卡口（`-- -D warnings` 已生效但不阻塞；
> 本地已清零 6 条告警，留软卡口是为了躲开工具链新增 lint 导致的发布阻塞）；
> `backendMessages.ts` 的中文文本映射表仍作为兜底存在，待 `err!`/粗粒度错误逐步细化后即可删除。

---

## 一、结论速览

代码整体质量高于同类个人项目：分层清晰、错误类型统一、关键坑位（Monaco CDN 被 CSP 拦截、`row_to_article` 列错位、`AppState` 注册类型）都留了回归测试和注释说明。**主要风险不在"写得乱"，而在三处语义不一致导致的正确性问题，以及"读操作触发全量扫描"造成的性能天花板。**

| 优先级 | 问题 | 一句话 | 影响 |
|---|---|---|---|
| **P0-1** | 局部同步误删全站文章行 | `sync_articles` 是"全量对账"语义，却被单篇文章的新建/保存调用 | 每次保存后其他文章 DB 行被删、ID 漂移、分类/标签列表瞬间塌缩 |
| **P0-2** | 发布草稿可静默覆盖同名文章 | `publish_article` 目标路径不做存在性检查 | 数据丢失（不可撤销） |
| **P0-3** | 主题配置读写文件不一致 | 读优先主题自带 `_config.yml`，Hexo 实际用 `_config.<theme>.yml` 覆盖 | 用户改了配置"没效果"，看到的是过期值 |
| **P1-1** | 读接口触发全站重扫 | `get_articles` / `get_site_stats` 每次都遍历全部 md 并逐条 UPDATE | 500 篇站点每次翻页数百次文件 IO；并发时卡住 tokio worker |
| **P1-2** | 部署配置生成三处失真 | edge 文件永不生成；`buildCommand` 被多数模板忽略；branch 硬编码 | 宣传的功能不可用；用户改"构建命令"无效果 |
| **P1-3** | 启动即加载整个 Monaco | `main.tsx` 直接 import monaco + 全语言包 | 产物 16 MB，首屏白屏时间显著 |
| **P1-4** | 事件流形同虚设 | 后端 13 处 `emit`，前端 0 处 `listen`；`run_streaming` 死代码 | 构建/部署无实时日志，用户只能等结果 |
| **P1-5** | Front Matter 回写丢失顺序与注释 | JSON↔YAML 往返 + 每次保存都写 `updated` | 每存一次就产生全量 diff，git 历史被噪声淹没 |

---

## 二、架构全景

### 2.1 技术栈与运行形态

| 层 | 选型 | 说明 |
|---|---|---|
| 外壳 | Tauri 2.x | `productName: HexoManager`，单窗口 1440×900，`identifier: com.xfm.hexomanager` |
| 前端 | React 18.3 + TypeScript 5.7 + Vite 5.4 | HashRouter（桌面端无需服务端路由） |
| UI | Ant Design 5.29 + Tailwind 3.4 | AntD 提供组件与主题算法，Tailwind 负责布局；CSS 变量统一明暗色 |
| 状态 | Zustand 4.5 | 8 个 store（site/article/config/deploy/template/ui/update + index） |
| 编辑器 | Monaco 0.57（自托管） | `utils/monaco.ts` 把 loader 指向本地实例，绕开 CSP |
| 后端 | Rust 2021 + Tokio | 纯命令式（command handler），无 HTTP 服务 |
| 数据 | SQLite（rusqlite bundled, WAL） | 单文件 `<app_data_dir>/hexomanager.db`，11 张表 |
| 外部进程 | `git` / `npm` / `npx hexo` | 全部通过 `utils/process.rs` 统一封装 |

**关键设计取向**：HexoManager **不代替 Hexo**。它不解析、不渲染 Markdown，只负责"读写站点文件 + 调用用户本机已有的 hexo/git/npm"。因此数据库是**派生缓存**，磁盘才是唯一真相（single source of truth）。这一定位决定了后面很多问题的性质——**缓存与真相的同步策略是整个系统的核心风险点**。

### 2.2 分层结构

```
┌──────────────────────────────────────────────────────────────┐
│ 页面层 src/pages/ (16 页)                                     │
│  Dashboard / Sites / Articles / Categories / Config / Themes  │
│  Plugins / Files / Preview / Deploy / Git / Logs / Updates …  │
├──────────────────────────────────────────────────────────────┤
│ Hook 层 src/hooks/ (8 个)   —— 页面逻辑复用（站点跟随、脏标记、  │
│  历史版本、部署流程、主题市场），多数是 store 的薄包装          │
├──────────────────────────────────────────────────────────────┤
│ 状态层 src/stores/ (7 个 Zustand) —— 跨页共享：当前站点、文章列表、│
│  配置草稿、部署状态、模板、UI（主题/通知/预览服务）、更新        │
├──────────────────────────────────────────────────────────────┤
│ 服务层 src/services/ (11 个) —— 一对一映射 Rust 命令，             │
│  call() 统一错误归一 + 后端中文错误英译（i18n/backendMessages）   │
├────────────────────────── IPC (invoke) ──────────────────────┤
│ 命令层 src-tauri/src/commands/ (11 模块, 130+ 命令)              │
│  职责：参数校验、DB 访问、编排领域模块、emit 事件                │
├──────────────────────────────────────────────────────────────┤
│ 领域层 hexo/ · git/ · deploy/ · update/ · db/ · utils/         │
│  职责：进程调用、YAML 解析、模板渲染、版本比对、迁移             │
├──────────────────────────────────────────────────────────────┤
│ 外部世界：SQLite 文件 · 站点目录 · git 仓库 · GitHub Releases    │
└──────────────────────────────────────────────────────────────┘
```

### 2.3 Rust 后端模块职责

| 模块 | 文件 | 职责 | 备注 |
|---|---|---|---|
| `commands/site_commands` | 749 行 | 站点 CRUD、复制、备份、统计、**文章扫描入口 `rescan_articles`** | 扫描逻辑放在 site 而非 article，职责边界略偏 |
| `commands/article_commands` | 1365 行 | 文章 CRUD、Front Matter 拆装、分类标签改名、Git 历史版本 | 全项目最大文件，混合了 4 类职责 |
| `commands/template_commands` | 655 行 | Front Matter 模板 CRUD、字段合并、正文骨架渲染 | 设计最完整：内置播种、保留字段、幂等性都有测试 |
| `commands/hexo_commands` | 430 行 | 构建/生成/清理/预览服务/新建发布/一键部署 | 部署日志记录 `record_deploy_log` 也在这里 |
| `commands/git_commands` | 231 行 | 12 个 git 操作透传 + `git_configs` 维护 | 几乎无业务逻辑，纯转发 |
| `commands/theme_commands` | 886 行 | 主题列表/安装(3 种来源)/切换/配置/搜索/更新/卸载 | 配置读写不一致问题所在 |
| `commands/config_commands` | 482 行 | 站点 `_config.yml` 结构化/原始双模、插件增删、配置导入导出 | 写前自动 `.bak` |
| `commands/deploy_commands` | 316 行 | 部署配置生成/预览、模板清单、部署日志、回滚、Webhook | `trigger_webhook` 是唯一入站 HTTP 能力 |
| `commands/file_commands` | 248 行 | 通用文件读写/树/复制/重命名/base64 | **无路径白名单**，见 P2-4 |
| `commands/update_commands` | 206 行 | 检查更新、下载安装、CHANGELOG 解析、app_settings KV | 与 `tauri-plugin-updater` 功能重叠 |
| `hexo/` | builder / installer / server / config_parser | 进程编排、环境检测、预览服务注册表、YAML 读写 | `server.rs` 有 `mem::forget` 泄漏 |
| `git/` | operations / status | 写操作、porcelain 解析 | 解析逻辑健壮（ahead/behind/重命名） |
| `deploy/` | config_generator / pages_generator + 15 个 `.hbs` | Handlebars 渲染 7 平台 + 边缘层配置 | 模板编译期内联，打包无外部依赖 |
| `update/` | check / download / install | 双源回退检查、手动下载、调系统安装器 | 自定义 semver 比较（含预发布） |
| `db/` | connection / migrations | `Arc<Mutex<Connection>>` + 一次性建表 | 无 schema 版本号 |
| `utils/` | error / process / mod | 统一错误、进程执行（含未使用的流式版）、字数/slug/时间 | |

### 2.4 前端模块职责

| 目录 | 规模 | 职责 |
|---|---|---|
| `pages/` | 16 页 / 9.9k 行 | 页面级交互。最大的 `ArticlesPage`(1249)、`UpdatesPage`(902)、`DeployPage`(898)、`FilesPage`(888)、`SitesPage`(895) |
| `components/` | 28 个 / 4.4k 行 | 通用件（CodeEditor/MarkdownPreview/FileTree/LogViewer…）+ 业务件（SiteCard/CreateSiteWizard/FrontMatterTemplatesPanel） |
| `stores/` | 7 个 / 1.4k 行 | 跨页状态；`configStore` 同时管站点配置与主题（职责略混） |
| `hooks/` | 8 个 / 1.1k 行 | 站点跟随、文章编辑脏标记、历史、部署、主题、更新、Git |
| `services/` | 11 个 / 0.8k 行 | 命令名与参数集中处，便于全局搜索调用点 |
| `i18n/` | 1465 词条 + 292 行后端映射 | "中文原文即词条"，零依赖；`t()` 用 `useCallback` 绑定 locale |
| `utils/` | 8 个 | markdown 解析、yaml、slug、格式化、desktop 能力封装、monaco 配置 |

### 2.5 数据模型（11 表）

```
sites ──1:N── articles ──(categories/tags 以 JSON 数组存两列)
  │            └── 派生：article_count / draft_count 冗余回写 sites
  ├──1:1── git_configs
  ├──1:1── deploy_configs
  ├──1:N── deploy_logs
  ├──1:N── theme_configs   ← 只写不读（死表）
  └──1:N── plugins         ← 只写不读（死表，真实数据来自 package.json）

front_matter_templates   全局共享，跨站点复用，`ensure_seeded` 非空即跳过
update_settings          单行表（id=1），setup 时保证存在
app_settings             通用 KV
```

---

## 三、核心业务流程

### 3.1 启动

```
main.tsx  → import '@/utils/monaco'（同步加载整个 Monaco，P1-3 根因之一）
          → App.tsx useEffect → uiStore.bootstrap()
              ├─ hexo_server_list（清理残留记录——实际只过滤不删除）
              ├─ 监听 prefers-color-scheme
              └─ updateService.getSettings → check()（静默，失败吞掉）
Rust lib.rs setup → Db::open（WAL + 外键 + 建表）→ 补 update_settings → app.manage(AppState)
```

### 3.2 文章读取（热路径，问题最集中）

```
ArticlesPage mount
  → useArticles(autoFetch) → siteStore.currentSiteId 变化
  → articleStore.fetchArticles → articleService.list → callSafe('get_articles')
      → article_commands::get_articles_impl
          ① site_path_of（查库）
          ② rescan_articles（WalkDir 遍历 _posts/_drafts，逐文件读 + 拆 front matter + YAML 解析）★
          ③ sync_articles（全表 upsert: 存在→UPDATE 17 列；不存在→INSERT；本次未见→DELETE）★
          ④ 拼 WHERE + COUNT(*) + SELECT 17 列（**含 content 全文**）★
  → 返回 PaginatedArticles
★ 三处热点：每次翻页/切页都会重跑 ②③④
```

### 3.3 文章保存

```
doSave()（手动 / Ctrl+S / 30s 防抖自动保存）
  → articleStore.saveArticle → call('update_article')
      → 读 file_path → 读盘 → 合并字段 → build_front_matter（JSON→YAML，键序重排）★
      → 写盘（无条件写 updated）★
      → sync_articles(vec![单篇]) ★★ ← 语义错配：会把其他文章全删（P0-1）
      → 重新查库返回
  → store 更新 current/articles
  → fetchTaxonomies（读 categories/tags）← 此时库里只剩刚保存的那篇 → 列表塌缩
```

### 3.4 构建与预览

```
构建：hexo_build → emit('hexo:build-start') → builder::build
        → run_hexo(["clean"]) → run_hexo(["generate"]) → 解析 "Generated: N files"
        → emit('hexo:build-finish')
      ★ 前端从未 listen，事件全部丢弃；日志只能等命令返回后一次性拿到

预览：hexo_server_start → 复用检查 → find_free_port → spawn_server
        → npx hexo server -p PORT（detach + CREATE_NO_WINDOW）→ 轮询端口 20s
        → 存入 ServerRegistry（纯内存）
      ★ 进程句柄 mem::forget；应用退出不清理 → 孤儿 node 进程长期占用端口
```

### 3.5 部署

```
DeployPage「一键部署」
  → deployStore.deploy
      ① hexoService.build（clean + generate，可跳过）
      ② hexoService.deployGit → commands::deploy_site
            is_repo? 否→git init
            git add -A → git commit -m → git push（无 upstream 自动 --set-upstream）
            → record_deploy_log → 更新 sites.last_deploy_at / git_configs
      ③ fetchLogs + fetchGitStatus + fetchCommits
  ★ 构建日志在 ② 之前已全部产出并被拼进 build.output，非流式

配置生成（另一条独立链路）
  DeployPage → preview/generate_deploy_config
    → config_generator::preview_all
         resolve_platforms(ciPlatforms)  ← ciPlatforms 只会是 7 个 Pages 平台
         for tpl in TEMPLATES: include = platforms.contains(tpl.platform)
         ★ platform=="edge" 的 4 个文件永不满足条件 → 永不生成（P1-2）
    → write_files ? 逐文件写盘 : 仅预览
```

### 3.6 自动更新

```
check_update（Rust 自定义实现）
  → 依次尝试 latest.json → GitHub Releases API
  → parse_manifest 自动分派 → is_newer（自研 semver，正确处理 1.0.0 > 1.0.0-rc.1）
  → 返回 download_url（按 os/arch 匹配 assets）

安装（手动路径）
  → download_update（reqwest 全量读入内存）→ install_update（msiexec / open / xdg-open）
  ★ 已配置 minisign pubkey 且注册了 tauri-plugin-updater，但整条链路完全没用它
  ★ 下载安装包不做签名校验（P2-4）
```

---

## 四、问题清单（按优先级）

### P0 — 正确性与数据风险

#### P0-1　局部同步误删全站文章行

**证据**
- `article_commands.rs:160` `sync_articles(db, site_id, found: Vec<ScannedArticle>)` 内部逻辑（234–242 行）：`existing` 取该站点全部行，`seen` 只含本次传入的 `file_path`，差集直接 `DELETE`。
- 但单篇场景也调用它：`article_commands.rs:413`（create）、`:686`（update）。

**后果链**
1. 保存文章 A → 数据库中 B、C、D… 的行被删除；
2. `doSave` 随后调用 `fetchTaxonomies` → `get_categories` 只读到 A → **分类/标签筛选列表瞬间只剩 A 的**；
3. 下一次 `get_articles` 触发全量 rescan，B、C、D 以新的自增 ID 重新插入 → **文章 ID 漂移**；
4. 任何跨命令持有的旧 ID（编辑器 URL `?article=`、收藏、浏览器历史、`current` 快照）全部失效，报"文章不存在"。

**根因**：一个函数承担了两种语义（"更新这一条" vs "让库与磁盘对账"），调用方按第一种理解使用，实现是第二种。

**修复**：拆成两个函数
```rust
pub fn upsert_article(db: &Db, site_id: i64, art: &ScannedArticle) -> AppResult<i64>  // 绝不删除
pub async fn reconcile_site(db: &Db, site_id: i64, path: &str) -> AppResult<()>       // 全量对账，仅显式刷新时调用
```
create/update 改调 `upsert_article`；`rescan_articles` 保留 `reconcile_site`。

**验证**：新增回归测试——内存库写入 3 篇，调用单篇 upsert，断言另外 2 篇仍在且 ID 不变。

---

#### P0-2　发布草稿可静默覆盖同名文章

**证据**：`article_commands.rs:766–799`
```rust
let dst = dir.join(file_name);        // 无 exists() 检查
std::fs::write(&dst, content)?;       // 直接覆盖
if dst != src { std::fs::remove_file(src)?; }
```
`create_article`（345–351）与 `import_articles`（865–878）都做了 `-1`、`-2` 去重，唯独这里没有。

**后果**：`_drafts/hello.md` 发布时若 `_posts/hello.md` 已存在，**旧文章内容被无提示覆盖**，且是直接 `write`，没有备份、不进回收站、不可撤销。

**修复**：目标存在时按 `create_article` 的策略生成 `hello-2.md`；或在返回结果里带上 `renamedFrom` 由 UI 提示。同时把 `remove_file` 调整为"写成功后再删源"，当前顺序在 `write` 成功但 `remove` 失败时会产生两份，尚可接受，但应记录日志。

---

#### P0-3　主题配置读写文件不一致

**证据**
- 读：`theme_commands.rs:406–428`，候选顺序为
  1. `themes/<t>/_config.yml`
  2. `_config.<t>.yml`（**站点级覆盖，Hexo 官方推荐**）
  3. `themes/<t>/_config.yaml`
  命中即返回 → 只要主题自带 `_config.yml` 存在（几乎所有主题都有），站点级覆盖**永远读不到**。
- 写：`theme_commands.rs:502–509` 固定写 `themes/<t>/_config.yml`。

**后果**：采用 `_config.butterfly.yml` 覆盖模式的用户，在「主题管理」里看到的是主题默认值（与站点实际渲染不符），修改后写入的是被覆盖的那份文件 → **改了没效果**，且主题升级 `git pull` 时会冲突。

**修复**
- 读取顺序改为 Hexo 的真实优先级：`_config.<t>.yml` **优先**，不存在再回退主题内 `_config.yml`；
- `ThemeConfig` 增加 `sourcePath` 字段返回实际来源，UI 顶部展示"正在编辑：`_config.butterfly.yml`"；
- 写入沿用同一路径；若两份都存在，UI 明确提示覆盖关系。

---

### P1 — 性能与核心体验

#### P1-1　读接口触发全站重扫，且列表返回全文

**证据**
- `get_articles_impl:447` 每次查询前 `rescan_articles`（未使用返回值 `_ =`）；
- 同样模式出现在 `get_site_stats:445`、`delete_article:721`、`publish:815`、`rename/delete_taxonomy:1075/1152`、`apply_front_matter_template:475`；
- `ARTICLE_COLUMNS:155` 含 `content`，而 `:496` 注释写"列表场景不返回全文，节省传输"——注释与实现相反；
- `rescan_articles` 内部对每个文件做 `read_to_string` + `split_front_matter` + `serde_yaml` 解析，然后 `sync_articles` 对**每一行**执行 `UPDATE`（即使内容没变）。

**量级估算**：500 篇文章的站点，每次翻页 ≈ 500 次文件读 + 500 次 YAML 解析 + 500 条 UPDATE；Windows + 杀软环境下约数百 ms 到 1s+，且 `content` 全文（可能 20×50KB）还要经 IPC JSON 序列化。

**修复（三步，可独立上线）**
1. **列表瘦身**：新增 `ARTICLE_LIST_COLUMNS`（去掉 `content`、保留 `excerpt`），列表/搜索只查它；`get_article` 保持全文。
2. **读不再扫**：`get_articles` / `get_site_stats` / `get_categories|tags` 只读库；扫描改为
   - 显式"刷新"按钮（已有 `ReloadOutlined`）；
   - 站点切换时一次；
   - 可选：`notify` crate 监听 `source/**/*.md` 变化，防抖 500ms 后增量扫描。
3. **增量扫描**：`articles` 增加 `file_mtime INTEGER` + `file_size INTEGER`，`stat` 相同则跳过解析与 UPDATE（`metadata()` 比读文件便宜一个数量级）。

**收益**：翻页从 O(N) 文件 IO 降到 O(1) 查询；500 篇站点首屏预计快 5–20 倍；IPC 流量降一个数量级。

> 附带修复：`sync_articles` 末尾无条件 `UPDATE sites SET updated_at = now`（255–258），使站点列表 `ORDER BY updated_at DESC` 的顺序随"你刚看了哪个站"而变，建议仅在计数真正变化时更新。

---

#### P1-2　部署配置生成三处失真

**证据与现象**

| 问题 | 证据 | 用户可见后果 |
|---|---|---|
| **边缘层文件永不生成** | `config_generator.rs:428` `include = platforms.contains(&tpl.platform)`；`DeployPage.tsx:144` 传 `ciPlatforms: selectedPlatforms`，而 `DEPLOY_PLATFORMS`（constants:80）只有 7 个 Pages 平台，不含 `"edge"` | 打开「启用边缘层」+ 预览，**一个 `deploy-config/*` 文件都不会出现**，但 UI 写着"生成 EdgeOne 回源配置与 Cloudflare Worker 脚本"（DeployPage:622） |
| **`buildCommand` 被多数模板忽略** | 仅 `vercel.json` / `netlify.toml` / `edgeone.*` / `deploy_readme` 使用 `{{build_command}}`；`github_pages.yml` / `gitee_pages.yml` / `gitlab_ci.yml` / `cloudflare_pages.yml` 硬编码 `npm install` + `npx hexo generate` | 用户把构建命令改成 `npm ci && hexo generate`，生成的 GitHub Actions 仍然跑旧命令 |
| **branch / output_dir 硬编码** | `config_generator.rs:373` `branch: "main".into()`、`:379` `output_dir: "public"` | 仓库主分支叫 `master`/`blog` 的站点，生成的 workflow 触发器指向不存在的分支 |

**修复**
- `TemplateFile` 增加 `scope: Platform | Edge | Common`，`preview_all` 改为：平台文件按 `ci_platforms` 过滤，边缘层由 `edge_provider != none` 控制，README 常驻；
- 四个 workflow 模板的构建步骤统一改为 `run: {{build_command}}`（并将默认值改为 `npm ci && npx hexo generate`，语义更正确）；
- `build_context` 从 `git_configs.branch` 与站点配置读取 `branch`、`public_dir`；`GenerateConfigInput` 增加对应字段。

---

#### P1-3　启动即加载整个 Monaco，产物 16 MB

**证据**
- `main.tsx:4` `import '@/utils/monaco'` —— 在任何页面渲染前同步求值；
- `utils/monaco.ts:13` `import * as monaco from 'monaco-editor'` —— 打包**全部语言与 basic-languages**；
- `dist/` 实测 16 MB：`ts.worker 6.8M`、`monaco 3.9M`、`css.worker 1.1M`、`html.worker 700K`、`json.worker 400K`，外加 abap/apex/azcli/bicep/cameligo/clojure/coffee/cpp/csharp… 上百个语言小文件；
- `vite.config.ts:26` `chunkSizeWarningLimit: 2000` 把警告压掉了。

而项目实际只用到 **markdown / yaml / json / ini / plaintext** 五种语言，`editor.worker` 足以支撑前四种中的三种。

**修复**
1. `utils/monaco.ts` 改为只引必要贡献：
   ```ts
   import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
   import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution';
   import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution';
   import 'monaco-editor/esm/vs/language/json/monaco.contribution';
   ```
2. 只保留 `editor.worker` + `json.worker`，删掉 ts/css/html worker；
3. 把 `utils/monaco` 的 import 从 `main.tsx` 移到 `CodeEditor.tsx`，并让 `CodeEditor` 走 `React.lazy`；
4. 页面级 `React.lazy` + `Suspense`（`App.tsx` 目前 16 个页面全部静态 import）。

**预期**：`dist` 从 16 MB 降至约 4 MB，首屏 JS 解析量降 ~70%，冷启动明显改善。**这是投入产出比最高的一项。**

---

#### P1-4　事件流形同虚设

**证据**
- Rust 侧 13 处 `emit`：`hexo:build-start/finish`、`hexo:generate-*`、`hexo:deploy-*`、`deploy:start/log/finish`（hexo_commands.rs:68/72/102/109/233/262、318/325/330/334/345/349/402）；
- 前端 `grep "listen("` → **0 处**；`invoke.ts:45` 导出了 `listen` 但无人使用；
- `utils/process.rs:126` 的 `run_streaming`（逐行回调）也无人调用。

**后果**：`deployStore.deploy` 只能把 `build.output` 在构建**结束后**一次性 `split('\n')` 灌进 `logLines`，用户看到的"日志"是回放而非实时；长构建（600s 超时）期间界面只有 loading。

**修复（二选一，建议前者）**
- **接线**：`useDeploy` 里 `listen<string>('deploy:log', ...)` 追加行；Rust 侧把 `builder::generate` 改用 `run_streaming` + `app.emit`，实现真正的流式；
- **或删除**：去掉 emit 与 `run_streaming`，把"伪流式"的注释也删干净，减少后来者的误判。

---

#### P1-5　Front Matter 回写破坏顺序与注释，且每次都改 `updated`

**证据**
- `Cargo.toml:26` `serde_json = "1"` **未启用 `preserve_order`** → `serde_json::Value` 的对象是 `BTreeMap`，**键按字母序**；
- `build_front_matter:107` 每次保存都把 `front` 整体 `serde_yaml::to_string` 重写；
- `update_article_impl:612` 无条件插入 `updated`。

**后果**：一篇原本
```yaml
title: 我的文章
date: 2026-11-14 10:00:00
tags: [a, b]
sticky: true
```
保存一次后变成
```yaml
date: ...
sticky: true
tags: [...]
title: 我的文章
updated: ...
```
注释（`# 摘要`之类）全部丢失，键序全乱。对一个"提交到 git 的博客仓库"，**每次保存都是一次全量 diff**，`git log -p` 的可读性被摧毁，也让"文章历史版本"功能（基于 git）变得没有意义。

**修复**
1. `serde_json = { version = "1", features = ["preserve_order"] }` —— 一行改动，保住原有键序（代价：引入 indexmap，注意与既有 `[patch.crates-io]` 的 indexmap 版本共存）；
2. 仅在 `new_content != old_content` 时写盘；
3. `updated` 只在正文/元信息**实际变化**时更新，而非每次保存；
4. 中期：`yaml_edit` crate 做原位编辑，保留注释与引号风格（这才是"编辑用户文件"的正确姿势）。

---

### P2 — 架构、冗余与安全

#### P2-1　时间口径混用

- 写库：`utils/mod.rs:92` `now_utc()`（UTC，无时区）；
- 写 front matter：`article_commands.rs:353` `chrono::Local`（本地时间，无时区）；
- 排序：`article_commands.rs:490` `ORDER BY COALESCE(published_at, created_at) DESC` —— 把"本地时间字符串"和"UTC 时间字符串"混在一列比较。

**后果**：东八区用户"发布于今天晚上"的文章，可能排在"数据库里 8 小时前创建的草稿"之前或之后，取决于两条路径谁写的时间。跨时区/夏令时更乱。

**修复**：统一存 UTC ISO8601（`2026-11-14T14:00:00Z`）；front matter 的 `date` 保持 Hexo 惯例（本地无时区），但入库时转换为 UTC 并单独保留原始字符串。

#### P2-2　预览服务没有生命周期管理

- `hexo/server.rs:92` `std::mem::forget(child)`：句柄被丢弃，子进程永不回收；注册表是纯内存 `Mutex<HashMap>`；
- `lib.rs:75` 注释写"启动时清理已退出的预览服务记录"，**实际是空的 `Ok(())`**；
- 全项目没有 `RunEvent::ExitRequested` / `on_window_event` 处理 → 退出应用后 `npx hexo server` 变成孤儿进程，端口 4000–4100 长期被占；再次启动会不断向上找空端口，越用越多；
- `hexo_server_list` 只 `retain` 过滤死 PID，**不从注册表删除**。

**修复**：改用 `Child` 持有 + `tokio::process::Child::kill()`；在 `Builder::build().run(|app, event| match event { RunEvent::ExitRequested{..} => stop_all_servers() })` 中统一清理；`hexo_server_list` 顺手 `remove` 死条目。

#### P2-3　数据层冗余

| 问题 | 证据 | 说明 |
|---|---|---|
| 无 schema 版本号 | `db/migrations.rs:9` 只有 `execute_batch(SCHEMA_SQL)` | 全是 `CREATE TABLE IF NOT EXISTS`，未来任何 `ALTER TABLE`（如 P1-1 要加 `file_mtime`）都无法可靠执行——老库不会补列 |
| `theme_configs` 只写不读 | `grep "FROM theme_configs"` 无结果 | 每次保存主题配置插一行，永不读取；且 `:521` 的 `ON CONFLICT DO NOTHING` 没有唯一索引可冲突 → **重复行无限增长** |
| `plugins` 只写不读 | 仅 `DELETE FROM plugins` | 真实插件列表来自 `package.json`（`get_plugins:311`），表是影子副本，会与真实状态漂移 |
| `sites.article_count/draft_count` 冗余 | 每次 sync 重算 | 可接受（读多写少），但应只在变化时更新 |

**修复**：引入 `PRAGMA user_version` 驱动的顺序迁移（`migrations: Vec<(&str, &str)>`）；`theme_configs` 加 `UNIQUE(site_id, theme_name)` 并真正用于"当前保存的快照"或干脆删表；`plugins` 表删除，改用 `package.json` 派生。

#### P2-4　安全边界

| 风险 | 证据 | 建议 |
|---|---|---|
| 文件命令接受任意绝对路径 | `file_commands.rs:8` `ensure_safe` 只拒绝"根目录"（`parent().is_none()`），其余任意路径可读写删 | 与 `Db` 中的站点路径做前缀校验：只允许 `sites.path` 及其子目录（外发导入除外，需显式标记） |
| 手动安装包不校验签名 | `update/download.rs` → `update/install.rs` 直接 `msiexec`/`open` | 已配置 `pubkey` 且注册了 `tauri-plugin-updater`，应改走该插件的 `download_and_install`（自带 minisign 校验）；`install.rs` 只保留"打不开时的兜底" |
| 下载全量入内存 | `download.rs:57` `resp.bytes()` | 改 `bytes_stream()` 落盘，避免大包撑爆内存 |
| `delete_site(delete_files: true)` | `site_commands.rs:264` `remove_dir_all` | 不可恢复；建议先自动 `backup_site` 或移入系统回收站 |

#### P2-5　代码重复与职责过厚

| 重复 | 位置 | 次数 |
|---|---|---|
| `site_path_of(db, site_id)` | article / hexo / theme / config / git 各一份，签名与实现完全相同 | 5 |
| `copy_dir` / `copy_dir_recursive` | site_commands:414、theme_commands:323、file_commands:185 | 3（策略还各不相同：有的跳过 node_modules，有的不跳） |
| `npx_bin()` / `npm_bin` 平台判断 | builder / installer / server / theme / config 内联 | 6 |
| `COMMIT_LOG` 解析（`%H%x1f...`） | `git/operations.rs:133` 与 `article_commands.rs:1190` 两份 | 2 |
| 前端"当前站点"读取 | 11 个页面各自 `useSiteStore((s) => s.currentSiteId)` + 空值分支 | 11 |

**修复**：抽 `db::repos::site::path_of`、`utils::fs::copy_dir(src, dst, opts)`、`utils::node::{npx, npm}`、`git::parse_log`；前端给所有需要站点的页面套一个 `RequireSite` 包装（有站点渲染 children，无站点渲染 `EmptyState`），可去掉每页 20–30 行样板。

`article_commands.rs` 1365 行建议按职责拆分：`articles/crud.rs`、`articles/scan.rs`（扫描与同步）、`articles/taxonomy.rs`、`articles/history.rs`。

#### P2-6　同步阻塞 IO 跑在 async 命令里

`rescan_articles`、`dir_size`（site_commands:538，`WalkDir` + `metadata`）、`FileTreeNode::from_path`、各级 `std::fs::*` 都直接写在 `async fn` 里。Tokio 多线程运行时下，这些调用会占住 worker 线程；一次 500 篇的全站扫描足以让其他 IPC 命令排队（Tauri 命令默认在 async runtime 上执行）。

**修复**：`tokio::task::spawn_blocking(move || scan_sync(...)).await`，把"读盘"彻底移出 async 上下文。

#### P2-7　前端用 `callSafe` 把失败伪装成"空数据"

42 处 `callSafe`（`articleService.list`、`get_categories`、`get_site_config`、`list_files`…）。任一后端失败 → 返回 `[]`/`{}`/false → UI 显示"暂无文章"而不是"加载失败"，`store.error` 永远不会被设置（因为不 throw）。

**修复**：区分两类调用——
- **查询类**（列表、配置、分类）→ 用 `call`，失败进入页面 `ErrorState`（组件已存在并支持 `onRetry`）；
- **装饰类**（可选元信息、市场数据）→ 保留 `callSafe`。
建议在 `callSafe` 上加 `console.warn` → 已在 DEV 有，但生产构建被 tree-shake，应改为写入 `uiStore.notify` 的低优先级通道。

#### P2-8　未使用依赖

| 依赖 | 状态 | 体积影响 |
|---|---|---|
| `isomorphic-git`（package.json:36） | `src/` 中 0 引用 | 安装体积；若被打进 bundle 则更糟（当前未 import，仅 node_modules 冗余） |
| `@ant-design/charts`（:24） | 0 引用 | 同上，且是重型依赖 |
| `@tauri-apps/plugin-fs`（:29） | 0 引用 | Rust 侧 `tauri_plugin_fs::init()` 仍注册 → 多余 IPC 能力面 |
| `@tauri-apps/plugin-process`（:31） | 0 引用 | 同上 |
| `@tauri-apps/plugin-updater`（:33） | 0 引用 | Rust 侧已注册但未使用（见 P2-4） |

**处理**：删 npm 依赖；Rust 侧保留 `opener`/`dialog`/`shell`（前端实际用到），移除 `fs`/`process`，`updater` 按 P2-4 的决定"接上"或"移除"。

---

### P3 — 工程化与长期演进

#### P3-1　测试写了但从不执行

- CI 的 `check` job 只有 `cargo check --all-targets`（build.yml:76），**没有 `cargo test`**；
- 因此 `lib.rs` 的 2 个 state 注册测试、`article_commands` 的 2 个列对齐回归锁、`template_commands` 的 6 个合并语义测试、`theme_commands` 的 5 个路径推断测试、`update/check` 的 5 个 semver/清单解析测试（**共约 20 个**），**一次都没在 CI 里跑过**；
- 本地按项目笔记也无法运行（`0xc0000139`，tauri 目标加载问题）；
- 前端 0 单测（无 vitest）、0 E2E。

**建议**
1. CI 增加 `cargo test --all-targets`（Linux runner 没有本机那个加载问题，几乎必定能跑通——这等于**免费拿回约 20 个测试**）；
2. 引入 `vitest`，优先覆盖纯函数：`utils/slug`、`utils/markdown`（front matter 解析）、`i18n`（`translateIn`/插值）、`stores` 的 reducer 逻辑；
3. 把 `lint` / `clippy` / `fmt` 的 `continue-on-error: true` 去掉（当前本地 `eslint --max-warnings 0` 已 0 报错，可以立即收紧）。

#### P3-2　版本号手工同步 7 文件 8 处

`version.json` / `package.json` / `package-lock.json`(×2) / `tauri.conf.json` / `Cargo.toml` / `Cargo.lock` / `constants/index.ts`。当前 `1.2.0` 全部一致（已核对），但这是流程约束而非机制约束，历史上已多次滞后。

**建议**：`scripts/bump-version.mjs <x.y.z>`，读 `version.json` 为唯一来源，正则改写其余 7 处 + 追加 history + 更新 CHANGELOG 的 `[Unreleased]` 标题；接入 `npm run release:prepare`。同时 CI 增加一步"版本一致性校验"（读 7 处，不一致即失败）。

#### P3-3　i18n 的过渡层

`backendMessages.ts` 292 行手工维护 `EXACT` + `RULES`（把 Rust 中文错误串映射为英文）。CHANGELOG 已自认这是过渡方案。风险是 Rust 侧改一个字的措辞，映射静默失效（1.2.0 就修过两条少空格的键）。

**建议**：Rust 侧错误改为 `{ code, params }` 结构化（`AppError` 已有枚举，只需给每个变体加稳定 `code`），前端按 code 查字典。可分模块渐进：先做 `article`/`site` 两个高频模块。

#### P3-4　可观测性

- 无日志落盘（构建/部署失败只有一次性字符串返回给 UI，关掉弹窗就没了）；
- 无 panic 上报（`expect("HexoManager 启动失败")` 直接 abort，用户只看到闪退）；
- 建议：`tauri-plugin-log` 写滚动文件（info 级），`deploy_logs.output` 已有落库可复用；启动失败时弹原生对话框而非 panic。

---

## 五、迭代建议（按优先级排序）

### 迭代 1：数据正确性（建议立即做，1 个 PR 可完成 1–3）

| # | 事项 | 动机 | 影响范围 | 预期收益 | 工作量 |
|---|---|---|---|---|---|
| 1 | 拆分 `upsert_article` / `reconcile_site` | 单篇保存会删掉全站文章行，导致 ID 漂移与分类列表塌缩 | `article_commands`(create/update)、`site_commands`、`template_commands` | 消除一类"文章莫名消失/ID 失效"的隐性 bug；分类标签列表稳定 | 0.5 d |
| 2 | 发布/下架增加目标冲突处理 | 同名草稿发布会静默覆盖线上文章 | `publish_article_impl` | 消除不可逆数据丢失路径 | 0.5 d |
| 3 | 主题配置按 Hexo 优先级读写 + 返回 `sourcePath` | 用户改了配置没效果，且不知在改哪个文件 | `theme_commands`(get/update)、`ThemesPage` | "配置不生效"类问题清零；UI 可自证行为 | 1 d |

**验收**：新增 3 个回归测试（单篇 upsert 不删他人、发布冲突改名、`_config.<t>.yml` 优先）；手工验证：保存一篇文章后，分类筛选列表条目数不变。

### 迭代 2：性能与体验（1 周）

| # | 事项 | 动机 | 影响范围 | 预期收益 | 工作量 |
|---|---|---|---|---|---|
| 4 | 读接口去扫描 + 列表去掉 `content` + mtime 增量 | 每次翻页 O(N) 文件 IO，500 篇站点明显卡顿 | `article_commands`、`site_commands`、`siteStore`/`articleStore` | 翻页从数百 ms 降到 <50 ms；IPC 流量降一个数量级 | 2 d |
| 5 | Monaco 精简 + 页面懒加载 | 16 MB 产物、启动即解析 6 MB JS | `utils/monaco`、`CodeEditor`、`App.tsx`、`vite.config` | 产物 ~4 MB，冷启动明显加快 | 1 d |
| 6 | 部署模板三修：edge scope、`build_command`、branch/output_dir | "启用边缘层"生成空结果；改构建命令无效 | `config_generator`、4 个 `.hbs`、`DeployPage` | 恢复已宣传的功能；生成物在 CI 上可直接跑通 | 1.5 d |
| 7 | 接入事件流（或删除） | 构建 10 分钟界面无反馈 | `builder`、`hexo_commands`、`useDeploy` | 长任务可观测；用户不会误以为卡死 | 1 d |
| 8 | Front Matter 保序 + 条件写盘 + `updated` 语义 | 每次保存产生全量 diff，历史版本功能失效 | `Cargo.toml`、`build_front_matter`、`update_article_impl` | git 历史干净；diff 可审 | 1 d |

**验收**：500 篇站点翻页 <100 ms；`dist` <5 MB；生成 GitHub Actions 配置后 `act`/实跑可成功；保存未修改的文章不产生 diff。

### 迭代 3：架构收敛与工程化（2 周，可与迭代 2 并行）

| # | 事项 | 动机 | 影响范围 | 预期收益 | 工作量 |
|---|---|---|---|---|---|
| 9 | 迁移版本化（`PRAGMA user_version`） | 加列即需重建库，后续演进被卡死 | `db/migrations` | 打开演进空间（M2 的增量扫描需要加列） | 1 d |
| 10 | 预览服务生命周期（Child 持有 + 退出清理） | 退出后孤儿 node 进程占用端口 | `hexo/server`、`lib.rs` | 消除端口泄漏与"端口被占"报错 | 1 d |
| 11 | 统一时间口径 | 排序结果不可解释 | `utils`、`article_commands`、`rescan` | "最近更新"排序可信 | 1 d |
| 12 | 文件命令路径白名单 + 更新走签名校验 | 任意路径读写；安装包不验签 | `file_commands`、`update/*` | 缩小攻击面，符合桌面应用安全预期 | 1.5 d |
| 13 | 抽公共件（`site_path_of`/`copy_dir`/`npx`/`parse_log`）+ 拆分 `article_commands` | 5 份重复实现、1365 行单文件 | 后端全局 | 改动一处生效；新人可读性提升 | 2 d |
| 14 | 查询类改 `call`，页面显示 `ErrorState` | 失败伪装成"空"，问题不可见 | `services/*`、各页面 | 用户能区分"没有数据"与"加载失败" | 1.5 d |
| 15 | CI 加 `cargo test` + 收紧 lint/clippy | 约 20 个已有测试从未运行 | `build.yml` | 免费拿回回归保护 | 0.5 d |
| 16 | 版本号脚本化 + 一致性校验 | 7 文件 8 处手工同步 | `scripts/`、`build.yml` | 发版不再漏改 | 0.5 d |

**执行结果（2026-11-14）**：#9 已在迭代 2 随增量扫描落地（`db/migrations` 改为 `PRAGMA user_version`
驱动），#15 已在迭代 2 落地（`build.yml` 的 `cargo test` job）。本轮完成 #10–#14、#16：

- #10 `hexo/server.rs` 重写为 `ServerRegistry`（持 `Child`、按站点/pid 停、退出时 `stop_all`），
  配套修正两处易踩的坑：stdout/stderr 必须后台常驻读出（否则管道写满会让 hexo 卡死）、
  启动失败要回传最近输出（否则用户只看到"启动超时"）
- #11 新增 `utils::local_time_to_utc`，`format_system_time` 改 UTC，前端 `parseTimestamp` 补 `Z`
- #12 `file_commands` 全部走 `ensure_safe` 白名单；`update/install.rs` 加 minisign 验签，
  下载改流式落盘
- #13 抽 `db::site_path_of`、`utils::fs::copy_dir`、`utils::node::{npx,npm}`、
  `git::operations::parse_log_lines`；`article_commands.rs` 拆出 `commands/articles/`
- #14 21 处查询类 `callSafe` → `call`，store 补 `error`，`MainLayout` 加全局错误条
- #16 `scripts/bump-version.mjs` + `scripts/check-version.mjs`，CI 加版本号一致性卡口

**遗留**：`article_commands.rs` 拆分后仍有 1252 行（命令层尚未按 CRUD/发布/导入导出再分），
以及 #15 中提到的 clippy 收紧（当前 CI 只跑测试，未加 `-D warnings`）。

### 迭代 4（补做，同日）：把剩余 P2/P3 收尾

| 事项 | 做法 | 结果 |
|---|---|---|
| P2-6 同步 IO 占用主线程 | 新增 `utils::blocking::{run,cmd}`；所有重 IO 命令改 `async fn` + `spawn_blocking` | Tauri 2 的普通 `fn` 命令跑在**主线程**，此前 `read_file_base64` / `get_file_tree` / `copy_path` 足以让窗口假死 |
| P2-8 未使用依赖 | 删 4 个 Rust 插件 + 6 个前端包；`openWithSystem` 改走 `open_external` / `open_in_explorer` | 顺带把 capabilities 从「`$HOME/**` 任意读写 + 任意命令执行」收窄到只剩窗口控制与对话框 |
| P3-4 可观测性 | `utils/log.rs`（约 200 行，按天切分、保留 7 天、写失败不影响主流程）+ `diag_commands` + 前端失败上报 + 「导出诊断日志」 | 用户报「点了没反应」时终于有现场可查 |
| P2-5 收尾 | `article_commands` 1252 → 323 行，命令层拆成 query/crud/publish/taxonomy | 门面只做 re-export；`lib.rs` 必须写真实路径（命令宏不会被 `pub use` 带出去） |

### 迭代 5：P3-3 后端错误码化（全模块）

| 事项 | 做法 | 结果 |
|---|---|---|
| 结构化错误载荷 | `AppError::Coded { code, message, params }`，`Serialize` 改为 `{code,message,params}`，`Display` 保持中文原文 | 未迁移前 `.map_err(|e| e.to_string())` 的输出一字不变，可安全分批推进 |
| 命令迁移 | 全部命令签名 `Result<T, String>` → `AppResult<T>`，删掉约 150 处 `map_err` | 净减 300+ 行样板；`get_article` 之类把「任何 DB 错误都说成文章不存在」的误导性提示一并修正 |
| 具体错误码 | 17 个语义码（`site.not_found` / `path.outside_site` / `article.reload_failed` …），译文在 `src/i18n/errorCodes.ts`，`{name}` 占位符由 `params` 填充 | 改中文措辞不再让译文失效 —— 这正是旧文本映射的根本缺陷 |
| 双形态兼容 | `invoke.ts` 先按 code 取译文，未收录再退回旧的中文文本映射 | 迁移过程中不会出现「英文界面漏中文」的中间态 |
| 一致性卡口 | `scripts/error-codes-check.mjs`：比对 Rust `coded("…")` 与字典条目，缺失或译文含中文即失败；并入 `npm run i18n:check` 与 CI | 手写跨语言字符串最容易漏，静态核对把它变成 CI 错误 |

**遗留（低优先）**：`err!` / 粗粒度变体仍输出中文原文，靠 `backendMessages.ts` 兜底。
把这些高频消息逐个升级为语义码后，那张 292 行的过渡表即可整体删除。

### 建议不做 / 暂缓

- **不要**为了"统一"把 `git_commands` 的透传再包一层 service —— 当前薄封装反而清晰；
- **暂缓**把 SQLite 换成带 ORM 的方案：11 张表 + 手写 SQL 完全可控，引入 ORM 会让"派生缓存"语义更模糊；
- ~~**暂缓** `@ant-design/charts` 的任何用途~~ —— 迭代 4 已直接删除该依赖（0 引用）。

---

## 六、值得保留的设计（避免重构时误伤）

1. **"数据库是派生缓存"的定位**——所有修复都应强化这一点（明确 reconcile 时机），而不是让 DB 承担真相；
2. **`t()` 的 `useCallback(locale)` 身份固化**——同时满足 `exhaustive-deps` 与切语言重渲染，是很巧的解法；
3. **Front Matter 模板的合并语义**（`merge_template_fields` 只补空缺、`RESERVED_FIELDS` 永不覆盖、`ensure_seeded` 非空即跳过）——有测试、有注释、不覆盖用户数据，是全项目最成熟的一块；
4. **`is_newer` 对预发布的处理**（`1.0.0 > 1.0.0-rc.1`）与双源回退检查——比直接用字符串比较正确得多；
5. **部署模板编译期内联**（`include_str!`）——打包后零外部依赖，值得推广到其他静态资源。

---

## 附录：本次核查的可复现命令

```bash
npx tsc --noEmit                                  # 通过
npx eslint . --ext ts,tsx --max-warnings 0        # 通过（0 warning）
du -sh dist && ls -S dist/assets/*.js | head      # 16M，最大 ts.worker 6.8M
grep -rn "listen(" src/                           # 0 处
grep -rn "sync_articles(" src-tauri/src/          # 3 处（2 处单篇）
grep -rn "FROM theme_configs" src-tauri/src/      # 0 处（只写不读）
grep -L "build_command" src-tauri/src/deploy/templates/*.hbs   # 10 个模板忽略构建命令
```
