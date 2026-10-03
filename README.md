# HexoManager

> 桌面端 Hexo 多站点管理工具 —— 用图形界面管理多个 Hexo 站点，从写作到上线一条链路完成。

[![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8DB?logo=tauri)](https://tauri.app)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Rust](https://img.shields.io/badge/Rust-1.77+-000000?logo=rust)](https://www.rust-lang.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

---

## 目录

- [项目简介](#项目简介)
- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [构建与打包](#构建与打包)
- [项目结构](#项目结构)
- [数据库设计](#数据库设计)
- [Rust 命令清单](#rust-命令清单)
- [CI/CD 配置生成](#cicd-配置生成)
- [版本规范](#版本规范)
- [开发规范](#开发规范)
- [常见问题](#常见问题)

---

## 项目简介

HexoManager 是一款基于 **Tauri 2.x + React 18** 的跨平台桌面应用，用于集中管理本地多个 Hexo 博客站点。

传统的 Hexo 工作流需要在终端里反复执行 `hexo new`、`hexo g`、`hexo d`，管理多个站点时还要来回切换目录、手工维护各平台的 CI 配置文件。HexoManager 把这些操作收敛到一个图形界面：

- 所有站点集中在一处，一键切换上下文
- 文章用 Monaco Editor 编辑，右侧实时预览 Markdown 效果
- `_config.yml` 可视化编辑，同时保留原始 YAML 模式
- 7 大部署平台的 CI/CD 配置文件一键生成（含边缘层回源策略）
- 构建、提交、推送、部署全流程自动化，并完整记录日志

> **数据安全**：所有站点数据保存在应用本机 SQLite 数据库中，站点源码始终存放于你指定的原始目录，HexoManager 不会复制或上传它们。

---

## 功能特性

| 模块 | 能力 |
| --- | --- |
| **工作台** | 当前站点统计概览、最近文章、最近部署时间线、站点快捷切换 |
| **站点管理** | 4 步创建向导、导入已有站点、卡片/表格双视图、详情统计、复制、备份、删除（可选清理文件） |
| **文章管理** | Monaco 编辑 + Markdown 实时预览、三种布局、30 秒自动保存、Ctrl+S、元信息与历史版本、发布/下架、批量导入 |
| **分类标签** | 分类与标签的占比统计、文章关联、重命名、合并、删除、标签云、分类树 |
| **配置管理** | `_config.yml` 可视化表单 + 原始 YAML 双向编辑、实时语法校验、只读预览、导出导入、差异对比、恢复备份 |
| **主题管理** | 已安装主题网格、主题市场、npm/git 两种安装方式、主题配置 YAML 编辑 |
| **插件管理** | 已安装插件表格/卡片切换、12 个推荐插件（按分类筛选）、安装命令预览、插件详情 |
| **文件管理** | 目录树 + 文件列表/编辑器切换、面包屑导航、新建文件与目录、重命名、删除、隐藏文件开关 |
| **本地预览** | 环境检测、启动/停止 hexo server、多端口并行、构建操作（clean/generate/build/deploy）+ 实时日志 |
| **部署配置** | 7 大平台卡片选择、构建与仓库配置、边缘层策略（EdgeOne / Cloudflare / 双边缘）、配置文件预览与一键写入 |
| **Git 操作** | 状态概览、改动列表（暂存/放弃）、提交（含 feat/fix 前缀快捷标签）、历史与回滚、远程仓库配置、差异查看与导出 |
| **部署记录** | 历史表格（筛选/排序/搜索）、日志详情抽屉、导出、回滚、成功率与耗时统计 |
| **关于与更新** | 软件信息、技术栈分层视图、检查更新、下载安装、自动检查开关、忽略版本、更新日志、开源许可 |
| **消息中心** | 通知列表（按类型聚合）、未读筛选、预览服务管理（打开/停止） |
| **偏好设置** | 主题模式、编辑器字号、自动保存间隔、危险操作确认、新建站点默认值、本地数据管理 |

---

## 技术栈

### 前端

| 组件 | 版本 | 说明 |
| --- | --- | --- |
| React | 18.3.1 | UI 框架 |
| TypeScript | 5.7.3 | 严格模式，禁止 `any` |
| Vite | 5.4.11 | 构建工具 |
| Ant Design | 5.29.3 | 组件库（中文 locale + 明暗主题算法） |
| Tailwind CSS | 3.4.19 | 原子化样式（关闭 preflight 以避免与 AntD reset 冲突） |
| Zustand | 4.5.7 | 状态管理（6 个 store） |
| React Router | 6.30.6 | 哈希路由（适配 Tauri 本地协议） |
| Monaco Editor | 4.7.0 | 代码与 Markdown 编辑器 |
| react-markdown + remark-gfm | 10.x / 4.x | Markdown 渲染 |

### 后端（Rust）

| 组件 | 版本 | 说明 |
| --- | --- | --- |
| Tauri | 2.x | 桌面框架 |
| rusqlite | 0.32 | SQLite 绑定（`bundled` 内置，无系统依赖；WAL 模式 + 外键约束） |
| tokio | 1.x | 异步运行时 |
| handlebars | 6.x | CI 配置模板渲染（`include_str!` 编译期内联） |
| serde_yaml | 0.9 | Hexo 站点与主题 YAML 配置读写 |
| walkdir | 2.x | 文件树遍历 |
| reqwest | 0.12 | 更新检查（rustls-tls） |

---

## 环境要求

| 依赖 | 版本 | 备注 |
| --- | --- | --- |
| Node.js | 18 / 20 / 22 | 用于运行前端构建与 `hexo` 命令 |
| npm | 9+ | 或 pnpm / yarn |
| Rust | 1.77+ | 用于编译 Tauri 后端 |
| Git | 2.30+ | 版本管理与部署推送 |

**系统依赖**（Tauri 编译所需）：

- **Windows**：Visual Studio Build Tools（C++ 生成工具）+ WebView2 Runtime
- **macOS**：Xcode Command Line Tools（`xcode-select --install`）
- **Linux**（Ubuntu / Debian）：

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

---

## 快速开始

### 1. 安装依赖

```bash
git clone https://github.com/xfm0797/HexoManager.git
cd hexo-manager

# 前端依赖
npm install

# Rust 依赖会在首次编译时自动拉取
```

国内网络环境如果拉取缓慢，可配置镜像（仓库已内置 `.npmrc` 与 `.cargo/config.toml`）：

```bash
# npm 镜像
npm config set registry https://mirrors.tencent.com/npm/

# cargo 镜像（已写入 .cargo/config.toml，无需重复配置）
```

### 2. 开发模式

```bash
npm run tauri:dev
```

该命令会并行启动：
1. Vite 开发服务器（`http://localhost:1420`）
2. Rust 后端编译
3. 自动打开应用窗口（支持前端热更新）

> 仅调试前端界面时，可只运行 `npm run dev` 并在浏览器中访问 `http://localhost:1420`。此时所有 Tauri 命令调用会失败，界面会展示空状态或错误提示 —— 这是预期行为。

### 3. 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 仅启动 Vite 开发服务器 |
| `npm run tauri:dev` | 启动完整桌面应用（开发模式） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint 检查 |
| `npm run format` | Prettier 格式化 |
| `npm run build` | 类型检查 + 前端构建（产物在 `dist/`） |
| `npm run tauri:build` | 打包桌面安装包 |

---

## 构建与打包

### 产物位置

`npm run tauri:build` 完成后，安装包输出在：

```
src-tauri/target/release/bundle/
├── deb/          # Linux .deb
├── appimage/     # Linux .AppImage
├── dmg/          # macOS .dmg
├── msi/          # Windows .msi
└── nsis/         # Windows .exe（NSIS 安装程序）
```

### 首次打包注意事项

1. **应用图标**：`src-tauri/icons/` 目录需包含 `32x32.png`、`128x128.png`、`128x128@2x.png`、`icon.icns`、`icon.ico`。可用官方命令生成：

   ```bash
   npm run tauri icon path/to/your-icon.png
   ```

2. **更新公钥**：`src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey` 已内置正式公钥
   （minisign key id `741DEDD9242E96B3`），无需再替换。仅在轮换签名密钥时才需要修改：

   ```bash
   npm run tauri signer generate -w ~/.tauri/hexo-manager.key
   ```

   将命令输出的 Public Key 填入 `pubkey` 字段，私钥妥善保管并配置为 CI 的 `TAURI_SIGNING_PRIVATE_KEY` 环境变量。**公钥必须与 CI 所用私钥配对**，否则客户端校验更新包签名会失败。

3. **签名与公证**（发布到应用商店时）：
   - macOS 需配置 Apple Developer 证书与公证（notarization）
   - Windows 需配置代码签名证书以避免 SmartScreen 警告

### 交叉编译限制

Tauri 不支持跨平台交叉编译。要发布 macOS 版本必须在 macOS 上构建，Windows 版本在 Windows 上构建。可使用 GitHub Actions 矩阵构建（见 `.github/workflows/build.yml`）。

---

## 项目结构

```
hexo-manager/
├── src/                              # 前端源码
│   ├── main.tsx                      # 应用入口
│   ├── App.tsx                       # 路由 + 主题配置
│   ├── vite-env.d.ts                 # 环境变量与静态资源类型声明
│   │
│   ├── pages/                        # 页面（15 个）
│   │   ├── DashboardPage.tsx         # 工作台
│   │   ├── SitesPage.tsx             # 站点管理
│   │   ├── ArticlesPage.tsx          # 文章管理
│   │   ├── CategoriesPage.tsx        # 分类标签
│   │   ├── ConfigPage.tsx            # 配置管理
│   │   ├── ThemesPage.tsx            # 主题管理
│   │   ├── PluginsPage.tsx           # 插件管理
│   │   ├── FilesPage.tsx             # 文件管理
│   │   ├── PreviewPage.tsx           # 本地预览
│   │   ├── DeployPage.tsx            # 部署配置
│   │   ├── GitPage.tsx               # Git 操作
│   │   ├── LogsPage.tsx              # 部署记录
│   │   ├── UpdatesPage.tsx           # 关于与更新
│   │   ├── NotificationsPage.tsx     # 消息中心
│   │   ├── SettingsPage.tsx          # 偏好设置
│   │   └── NotFoundPage.tsx          # 404
│   │
│   ├── components/                   # 通用组件（26 个）
│   │   ├── MainLayout.tsx            # 主布局（侧栏 + 顶栏 + 内容）
│   │   ├── Sidebar.tsx               # 侧栏导航
│   │   ├── TopBar.tsx                # 顶栏（站点切换、主题、通知）
│   │   ├── PageContainer.tsx         # 页面容器
│   │   ├── StatCard.tsx              # 统计卡片
│   │   ├── CodeEditor.tsx            # Monaco 封装 + CodeBlock
│   │   ├── MarkdownPreview.tsx       # Markdown 渲染（含 Front Matter）
│   │   ├── LogViewer.tsx             # 终端风格日志（筛选/搜索/导出）
│   │   ├── FileTree.tsx              # 文件树（搜索/右键菜单）
│   │   ├── CreateSiteWizard.tsx      # 创建站点向导
│   │   ├── ConfigPreviewModal.tsx    # 配置预览与写入
│   │   ├── SettingsPanel.tsx         # 设置面板
│   │   └── ...                       # 其余基础组件
│   │
│   ├── stores/                       # Zustand 状态（6 个）
│   │   ├── siteStore.ts              # 站点
│   │   ├── articleStore.ts           # 文章
│   │   ├── configStore.ts            # 配置、主题、插件
│   │   ├── deployStore.ts            # 部署与 Git
│   │   ├── updateStore.ts            # 更新
│   │   └── uiStore.ts                # 主题、侧栏、通知、预览服务
│   │
│   ├── hooks/                        # 组合式 Hook（8 个）
│   │   ├── useSites.ts               # useSites / useCurrentSiteInfo / useSiteSwitcher
│   │   ├── useArticles.ts            # useArticles / useArticleEditor / useArticleHistory
│   │   ├── useGit.ts                 # Git 状态与操作
│   │   ├── useDeploy.ts              # useDeployConfig / useDeploy
│   │   ├── useHexo.ts                # useHexoBuild / useHexoServer / useHexoEnv
│   │   ├── useConfig.ts              # 站点配置编辑
│   │   ├── useTheme.ts               # 主题与插件
│   │   └── useUpdate.ts              # 更新检查
│   │
│   ├── services/                     # Tauri 调用封装（10 个）
│   │   ├── invoke.ts                 # invoke 统一封装 + 错误归一化
│   │   ├── siteService.ts            # 站点
│   │   ├── articleService.ts         # 文章
│   │   ├── configService.ts          # 配置
│   │   ├── themeService.ts           # 主题与插件
│   │   ├── hexoService.ts            # Hexo 命令与预览服务
│   │   ├── gitService.ts             # Git
│   │   ├── deployService.ts          # 部署与配置生成
│   │   ├── fileService.ts            # 文件读写
│   │   └── updateService.ts          # 更新
│   │
│   ├── types/                        # 类型定义（8 个）
│   ├── utils/                        # 工具函数（7 个）
│   ├── constants/                    # 常量与枚举
│   └── styles/global.css             # 全局样式与 CSS 变量
│
├── src-tauri/                        # Tauri 后端（Rust）
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── icons/                        # 应用图标
│   └── src/
│       ├── main.rs                   # 可执行入口
│       ├── lib.rs                    # 应用初始化 + 命令注册
│       ├── models.rs                 # 数据模型（与前端类型对齐）
│       │
│       ├── commands/                 # Tauri 命令（9 个模块）
│       │   ├── site_commands.rs      # 站点管理
│       │   ├── article_commands.rs   # 文章管理
│       │   ├── hexo_commands.rs      # Hexo 操作
│       │   ├── git_commands.rs       # Git 操作
│       │   ├── deploy_commands.rs    # 部署配置
│       │   ├── file_commands.rs      # 文件操作
│       │   ├── theme_commands.rs     # 主题管理
│       │   ├── config_commands.rs    # 配置管理
│       │   └── update_commands.rs    # 更新管理
│       │
│       ├── db/                       # 数据库
│       │   ├── connection.rs         # 连接池与 WAL 配置
│       │   └── migrations.rs         # 建表与索引
│       │
│       ├── hexo/                     # Hexo 集成
│       │   ├── builder.rs            # clean / generate / build
│       │   ├── server.rs             # 预览服务进程管理
│       │   ├── config_parser.rs      # YAML 读写
│       │   └── installer.rs          # 依赖安装与环境检测
│       │
│       ├── git/                      # Git 集成
│       │   ├── status.rs             # 状态解析
│       │   └── operations.rs         # add / commit / push / pull / stash
│       │
│       ├── deploy/                   # 部署配置生成
│       │   ├── config_generator.rs   # Handlebars 渲染调度
│       │   ├── pages_generator.rs    # Pages 平台适配
│       │   └── templates/*.hbs       # 15 个配置模板
│       │
│       ├── update/                   # 更新
│       │   ├── check.rs              # 版本检查
│       │   ├── download.rs           # 下载
│       │   └── install.rs            # 安装
│       │
│       └── utils/                    # 路径、进程、错误处理
│
├── .github/workflows/                # CI（构建 + 发布）
├── deploy-config/                    # 部署配置示例产物
├── CHANGELOG.md                      # 变更日志
├── version.json                      # 版本元数据
└── README.md
```

---

## 数据库设计

数据库文件位于系统应用数据目录：`{appDataDir}/hexo-manager/hexo-manager.db`，使用 **WAL 模式** 并开启**外键约束**。

| 表名 | 用途 | 关键字段 |
| --- | --- | --- |
| `sites` | 站点主表 | `id`、`name`、`path`、`description`、`status`、`created_at` |
| `articles` | 文章索引 | `id`、`site_id`、`title`、`slug`、`categories`、`tags`、`draft`、`created_at` |
| `git_configs` | Git 配置 | `site_id`、`remote_url`、`branch`、`auto_deploy`、`last_push_at` |
| `deploy_configs` | 部署配置 | `site_id`、`repo_platform`、`ci_platforms`、`edge_provider`、`origin_strategy` |
| `deploy_logs` | 部署记录 | `id`、`site_id`、`status`、`commit_hash`、`duration_ms`、`output` |
| `theme_configs` | 主题配置 | `site_id`、`theme_name`、`config_path`、`installed_at` |
| `plugins` | 插件清单 | `id`、`site_id`、`name`、`version`、`enabled` |
| `update_settings` | 更新设置 | `auto_check`、`last_check_at`、`skip_version` |

所有表对 `site_id` 建立外键并配置 `ON DELETE CASCADE`，删除站点时自动清理关联数据；`articles.site_id`、`deploy_logs.site_id` 等字段建立索引以加速查询。

---

## Rust 命令清单

共 **9 个命令模块，60+ 个命令**，全部返回 `Result<T, String>`，错误信息已中文化。

| 模块 | 命令 |
| --- | --- |
| **站点管理** | `create_site`、`import_site`、`delete_site`、`get_sites`、`get_site`、`update_site`、`duplicate_site`、`get_site_stats`、`backup_site`、`get_site_file_tree` |
| **文章管理** | `create_article`、`get_articles`、`get_article`、`update_article`、`delete_article`、`publish_article`、`unpublish_article`、`create_draft`、`import_articles`、`search_articles`、`get_categories`、`get_tags`、`rename_category`、`rename_tag`、`delete_category`、`delete_tag`、`get_article_history`、`get_article_at_commit` |
| **Hexo 操作** | `hexo_build`、`hexo_clean`、`hexo_server_start`、`hexo_server_stop`、`hexo_server_list`、`hexo_new_post`、`hexo_new_draft`、`hexo_publish`、`hexo_generate`、`hexo_deploy`、`check_hexo_env`、`install_hexo`、`deploy_site`、`hexo_new_post_article` |
| **Git 操作** | `git_init`、`git_status`、`git_add`、`git_commit`、`git_push`、`git_pull`、`git_log`、`git_diff`、`git_set_remote`、`git_discard_changes`、`git_stash`、`git_stash_pop`、`get_git_config` |
| **部署配置** | `get_deploy_config`、`save_deploy_config`、`generate_deploy_config`、`preview_deploy_config`、`check_config_files`、`get_deploy_templates`、`get_deploy_logs`、`rollback_deploy` |
| **文件操作** | `read_file`、`write_file`、`list_directory`、`create_directory`、`delete_path`、`rename_path`、`path_exists`、`copy_path` |
| **主题管理** | `get_themes`、`install_theme`、`uninstall_theme`、`switch_theme`、`get_theme_config`、`save_theme_config`、`search_theme_market`、`get_plugins`、`install_plugin`、`uninstall_plugin`、`get_recommended_plugins` |
| **配置管理** | `get_site_config`、`save_site_config`、`get_config_raw`、`save_config_raw`、`validate_config`、`backup_config`、`restore_config` |
| **更新管理** | `get_app_info`、`check_update`、`download_update`、`install_update`、`get_update_settings`、`save_update_settings`、`get_changelog`、`open_external` |

### 异步命令注意事项

Tauri 异步命令的 future 必须满足 `Send`，因此**不能跨 `.await` 持有 `State<'_, AppState>` 借用或 `MutexGuard`**。项目统一采用以下模式：

```rust
#[tauri::command]
pub async fn some_command(state: State<'_, AppState>, id: i64) -> Result<Data, String> {
    // 1. 先在同步作用域内取出所需数据
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let site = query_site(&db, id)?;
    drop(db); // 2. 显式释放锁

    // 3. 再做耗时操作（此时不持有任何借用）
    let output = run_process(&site.path).await?;
    Ok(output)
}
```

---

## CI/CD 配置生成

在「部署配置」页选择目标平台后，工具会基于 Handlebars 模板生成对应配置文件。模板通过 `include_str!` 在编译期内联，无需运行时文件依赖。

### 支持的平台

| 平台 | 生成文件 | 说明 |
| --- | --- | --- |
| **GitHub Pages** | `.github/workflows/deploy.yml`、`CNAME` | Actions 构建并发布，支持自定义域名 |
| **Gitee Pages** | `.github/workflows/gitee-pages.yml` | 国内访问速度好，自定义域名需 Pro |
| **GitLab Pages** | `.gitlab-ci.yml` | 流水线构建，产物自动发布 |
| **Vercel** | `vercel.json`、`.github/workflows/vercel.yml` | 零配置边缘部署，支持预览环境 |
| **Netlify** | `netlify.toml`、`.github/workflows/netlify.yml` | 声明式构建与重定向规则 |
| **Cloudflare Pages** | `.github/workflows/cloudflare-pages.yml` | 无限带宽，全球边缘分发 |
| **EdgeOne Pages** | `.github/workflows/edgeone.yml`、`edgeone.config.json` | 腾讯云边缘平台，国内节点覆盖好 |

### 边缘层配置

除 CI 流水线外，还可生成边缘层相关配置：

| 产物 | 用途 |
| --- | --- |
| `cloudflare-worker.js` | Cloudflare Worker 脚本：智能回源、故障转移、缓存策略 |
| `edgeone-config.txt` | EdgeOne 控制台配置指引（缓存规则、回源策略、HTTPS） |
| `edgeone.config.json` | EdgeOne 声明式配置 |
| `cloudflare.toml` | Wrangler 项目配置 |
| `deploy_readme.md` | 部署操作手册，含各平台控制台步骤 |

### 回源策略

| 策略 | 说明 |
| --- | --- |
| `failover` | 智能故障转移 —— 主源不可用时切换备用源 |
| `primary` | 仅主源，配置最简单 |
| `round-robin` | 多源轮询，分摊压力 |
| `nearest` | 就近回源，按用户地理位置选择源站 |

### 生成流程

1. 在「部署配置」中填写仓库地址、Node 版本、构建命令、环境变量
2. 选择部署平台（可多选）与边缘层服务商
3. 点击「预览配置」查看将生成的文件内容
4. 确认后点击「写入磁盘」，工具会先备份同名文件再写入

---

## 版本规范

### 语义化版本

遵循 [SemVer 2.0.0](https://semver.org/lang/zh-CN/)：`MAJOR.MINOR.PATCH`

- **MAJOR**：不兼容的 API 变更
- **MINOR**：向下兼容的功能新增
- **PATCH**：向下兼容的问题修复

### version.json

记录当前版本与历史：

```json
{
  "version": "1.0.0",
  "major": 1,
  "minor": 0,
  "patch": 0,
  "isLocked": false,
  "history": [
    { "version": "1.0.0", "type": "major", "description": "首个正式版本", "createdAt": "2026-09-30T00:00:00Z" }
  ]
}
```

`isLocked` 为 `true` 时禁止修改版本号（用于正式发布冻结）。

### Git Tag

版本发布时打标签，格式 `v{MAJOR}.{MINOR}.{PATCH}`：

```bash
git tag -a v1.0.0 -m "release: 1.0.0"
git push origin v1.0.0
```

### CHANGELOG.md

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，分类包括：

`Added` / `Changed` / `Deprecated` / `Removed` / `Fixed` / `Security`

---

## 开发规范

### TypeScript

- 启用**严格模式**（`strict: true`）
- **禁止使用 `any`**，确需逃逸时使用 `unknown` 并显式收窄
- 启用 `noUnusedLocals` 与 `noUnusedParameters`，不允许遗留未使用的导入或变量
- 类型导入统一使用 `import type { X } from '...'`

### 命名规范

| 类别 | 规范 | 示例 |
| --- | --- | --- |
| 组件文件 | PascalCase | `ArticleListItem.tsx` |
| 工具/Hook/Service | camelCase | `useArticles.ts`、`formatDateTime` |
| 类型/接口 | PascalCase | `DeployConfig` |
| 常量 | UPPER_SNAKE_CASE | `NAV_ITEMS`、`DEPLOY_PLATFORMS` |
| Rust 命令 | snake_case | `get_site_stats` |
| CSS 变量 | `--hm-` 前缀 | `--hm-bg`、`--hm-border` |

### 路径别名

前端统一使用 `@/` 指向 `src/`：

```typescript
import { useSiteStore } from '@/stores';
import type { DeployConfig } from '@/types';
```

### Git 提交规范

格式：`type(scope): subject`

| type | 用途 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | 问题修复 |
| `refactor` | 重构（不改变行为） |
| `docs` | 文档变更 |
| `style` | 格式调整（不影响逻辑） |
| `chore` | 构建、依赖、配置等杂项 |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `version` | 版本号变更 |

示例：

```
feat(article): 支持 Markdown 实时预览与分栏编辑
fix(deploy): 修复 Cloudflare Worker 模板中回源地址未转义的问题
docs(readme): 补充 Linux 系统依赖安装说明
version: 发布 1.0.0
```

---

## 常见问题

### `hexo: command not found`

应用会优先使用站点 `node_modules/.bin/hexo`，若不存在则回退到全局 `hexo`。请在「本地预览」页点击环境检测确认，或手动补充依赖：

```bash
cd /path/to/your-site
npm install
```

### 构建失败：`Cannot find module 'hexo'`

站点缺少依赖。在「本地预览」页执行「安装依赖」，或在站点目录手动运行 `npm install`。

### Git 推送要求输入账号密码

工具调用的是系统 Git，凭据由系统层面管理。建议：

- **SSH 方式**：生成密钥并添加到代码托管平台
  ```bash
  ssh-keygen -t ed25519 -C "your@email.com"
  ```
- **HTTPS 方式**：配置凭据缓存
  ```bash
  git config --global credential.helper store   # 明文存储，谨慎使用
  # 或 macOS 使用 osxkeychain，Windows 使用 manager
  ```

### 部署记录为空

部署记录在每次执行「一键部署」后写入。若刚创建站点，需先执行至少一次部署。另外确认当前选中的站点在顶栏是正确的站点。

### 预览服务残留

若应用异常退出，`hexo server` 进程可能未被回收。进入「消息中心」点击右上角刷新按钮，工具会对比端口占用情况同步列表，可手动停止残留进程。

### 自动更新提示「检查更新失败」

自动更新检测按优先级依次尝试以下更新源，第一个成功解析出最新版本的源生效：

1. GitHub Releases 的 `latest.json`（Tauri updater 清单，tauri-action 打 tag 时自动生成上传）
2. GitHub Releases API（`/releases/latest`，作为清单缺失时的回退）

国内网络受限时可能全部超时，可在「关于与更新」中关闭自动检查，改为前往项目仓库手动下载。
若需指向自建更新服务，可在调用 `check_update` 命令时传入自定义 `manifest_url`，
清单格式兼容 `{"version": "...", "platforms": {...}}` 与 GitHub Release 两种结构。

### 深色模式样式异常

主题通过 `html.dark` 类名驱动 CSS 变量。若出现样式错乱，检查是否在 `localStorage` 中存在异常的 `hexo-manager:theme` 值，可在「偏好设置 → 本地数据」中清除后重启。

---

## 许可

[MIT License](./LICENSE)

Copyright © 2026 XFM
