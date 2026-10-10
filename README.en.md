# HexoManager

English | [简体中文](./README.md)

> A desktop Hexo multi-site management tool — manage multiple Hexo sites through a graphical interface, completing the entire chain from writing to publishing.

[![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8DB?logo=tauri)](https://tauri.app)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Rust](https://img.shields.io/badge/Rust-1.77+-000000?logo=rust)](https://www.rust-lang.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

---

## Table of Contents

- [Project Overview](#project-overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Build and Packaging](#build-and-packaging)
- [Project Structure](#project-structure)
- [Database Design](#database-design)
- [Rust Command List](#rust-command-list)
- [CI/CD Config Generation](#cicd-config-generation)
- [Versioning](#versioning)
- [UI Language (i18n)](#ui-language-i18n)
- [Development Guidelines](#development-guidelines)
- [FAQ](#faq)

---

## Project Overview

HexoManager is a cross-platform desktop application built on **Tauri 2.x + React 18**, designed to centrally manage multiple local Hexo blog sites.

The traditional Hexo workflow requires repeatedly running `hexo new`, `hexo g`, and `hexo d` in a terminal, and when managing multiple sites you also have to switch directories back and forth and manually maintain the CI config files for each platform. HexoManager consolidates these operations into a single graphical interface:

- All sites gathered in one place, with one-click context switching
- Articles edited with Monaco Editor, with a live Markdown preview on the side
- Visual editing of `_config.yml`, while retaining a raw YAML mode
- One-click generation of CI/CD config files for 7 major deployment platforms (including edge-layer origin-pull policy)
- Full automation of build, commit, push, and deploy, with complete log records

> **Data safety**: All site data is stored in the application's local SQLite database, while site source code always remains in the original directory you specify; HexoManager never copies or uploads them.

---

## Features

| Module | Capability |
| --- | --- |
| **Dashboard** | Overview of current site statistics, recent articles, recent deployment timeline, quick site switching |
| **Site Management** | 4-step creation wizard, import existing sites, card/table dual views, detail statistics, copy, backup, delete (with optional file cleanup) |
| **Article Management** | Monaco editing + live Markdown preview, three layouts, 30-second autosave, Ctrl+S, metadata and version history, publish/unpublish, batch import, **one-click apply of Front Matter templates** |
| **Categories & Tags** | Proportion statistics for categories and tags, article association, rename, merge, delete, tag cloud, category tree |
| **Config Management** | `_config.yml` visual form + two-way raw YAML editing, live syntax validation, read-only preview, export/import, diff comparison, restore backup |
| **Theme Management** | Installed theme grid, theme marketplace, two installation methods (npm/git), theme config YAML editing |
| **Plugin Management** | Installed plugin table/card toggle, 12 recommended plugins (filtered by category), install command preview, plugin details |
| **File Management** | Directory tree + file list/editor toggle, breadcrumb navigation, create files and directories, rename, delete, hidden file toggle |
| **Local Preview** | Environment check, start/stop hexo server, parallel multi-port, build operations (clean/generate/build/deploy) + live logs |
| **Deploy Config** | 7 major platform card selection, build and repository config, edge-layer strategy (EdgeOne / Cloudflare / dual edge), config file preview and one-click write |
| **Git Operations** | Status overview, change list (stage/discard), commit (with feat/fix prefix shortcut tags), history and rollback, remote repository config, diff viewing and export |
| **Deployment Records** | History table (filter/sort/search), log detail drawer, export, rollback, success rate and duration statistics |
| **About & Updates** | Software info, layered tech stack view, check for updates, download and install, auto-check toggle, skip version, changelog, open-source license |
| **Notification Center** | Notification list (aggregated by type), unread filtering, preview service management (start/stop) |
| **Preferences** | Theme mode, **UI language (Chinese / English / Follow System)**, editor font size, autosave interval, dangerous-operation confirmation, new-site defaults, **writing template management**, local data management |

---

## Tech Stack

### Frontend

| Component | Version | Description |
| --- | --- | --- |
| React | 18.3.1 | UI framework |
| TypeScript | 5.7.3 | Strict mode, `any` forbidden |
| Vite | 5.4.11 | Build tool |
| Ant Design | 5.29.3 | Component library (locale switches with UI language + light/dark theme algorithm) |
| Tailwind CSS | 3.4.19 | Atomic styles (preflight disabled to avoid conflicts with the AntD reset) |
| Zustand | 4.5.7 | State management (6 stores) |
| React Router | 6.30.6 | Hash routing (adapted to the Tauri local protocol) |
| Monaco Editor | 4.7.0 | Code and Markdown editor |
| react-markdown + remark-gfm | 10.x / 4.x | Markdown rendering |
| Custom i18n | — | Chinese-English bilingual, Chinese source text as the keys, no third-party dependencies |

### Backend (Rust)

| Component | Version | Description |
| --- | --- | --- |
| Tauri | 2.x | Desktop framework |
| rusqlite | 0.32 | SQLite bindings (`bundled` built-in, no system dependencies; WAL mode + foreign key constraints) |
| tokio | 1.x | Async runtime |
| handlebars | 6.x | CI config template rendering (`include_str!` compile-time inlining) |
| serde_yaml | 0.9 | Reading and writing Hexo site and theme YAML config |
| walkdir | 2.x | File tree traversal |
| reqwest | 0.12 | Update checking (rustls-tls) |

---

## Requirements

| Dependency | Version | Notes |
| --- | --- | --- |
| Node.js | 18 / 20 / 22 | Used to run the frontend build and the `hexo` command |
| npm | 9+ | Or pnpm / yarn |
| Rust | 1.77+ | Used to compile the Tauri backend |
| Git | 2.30+ | Version management and deployment push |

**System dependencies** (required for Tauri compilation):

- **Windows**: Visual Studio Build Tools (C++ build tools) + WebView2 Runtime
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Linux** (Ubuntu / Debian):

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

---

## Quick Start

### 1. Install Dependencies

```bash
git clone https://github.com/xfm0797/HexoManager.git
cd hexo-manager

# Frontend dependencies
npm install

# Rust dependencies are fetched automatically on first compile
```

If fetching is slow on networks in China, you can configure mirrors (the repository already bundles `.npmrc` and `.cargo/config.toml`):

```bash
# npm mirror
npm config set registry https://mirrors.tencent.com/npm/

# cargo mirror (already written to .cargo/config.toml, no need to configure again)
```

### 2. Development Mode

```bash
npm run tauri:dev
```

This command starts in parallel:
1. The Vite dev server (`http://localhost:1420`)
2. Rust backend compilation
3. Automatic opening of the application window (with frontend hot reload support)

> To debug only the frontend UI, you can run `npm run dev` alone and visit `http://localhost:1420` in a browser. In this case all Tauri command calls will fail, and the UI will show empty states or error messages — this is expected behavior.

### 3. Common Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start only the Vite dev server |
| `npm run tauri:dev` | Start the full desktop application (development mode) |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint checking |
| `npm run format` | Prettier formatting |
| `npm run build` | Type checking + frontend build (output in `dist/`) |
| `npm run tauri:build` | Package the desktop installer |
| `npm run i18n:merge` | Merge the entry parts in `src/i18n/locales/_parts/*.json` into `en-US.ts` |
| `npm run i18n:check` | i18n coverage check (exit code 1 when translations are missing / translation text still contains Chinese) |

---

## Build and Packaging

### Output Location

After `npm run tauri:build` completes, the installers are output in:

```
src-tauri/target/release/bundle/
├── deb/          # Linux .deb
├── appimage/     # Linux .AppImage
├── dmg/          # macOS .dmg
├── msi/          # Windows .msi
└── nsis/         # Windows .exe (NSIS installer)
```

### First-Time Packaging Notes

1. **Application icons**: The `src-tauri/icons/` directory must contain `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, and `icon.ico`. You can generate them with the official command:

   ```bash
   npm run tauri icon path/to/your-icon.png
   ```

2. **Update public key**: `src-tauri/tauri.conf.json`'s `plugins.updater.pubkey` already has the official public key built in
   (minisign key id `741DEDD9242E96B3`), so no replacement is needed. Only modify it when rotating the signing key:

   ```bash
   npm run tauri signer generate -w ~/.tauri/hexo-manager.key
   ```

   Fill the Public Key output by the command into the `pubkey` field, keep the private key safe, and configure it as the CI `TAURI_SIGNING_PRIVATE_KEY` environment variable. **The public key must pair with the private key used by CI**, otherwise client-side update package signature verification will fail.

3. **Signing and notarization** (when publishing to app stores):
   - macOS requires configuring an Apple Developer certificate and notarization
   - Windows requires configuring a code signing certificate to avoid SmartScreen warnings

### Cross-Compilation Limits

Tauri does not support cross-platform compilation. To release a macOS version you must build on macOS, and the Windows version on Windows. You can use a GitHub Actions matrix build (see `.github/workflows/build.yml`).

---

## Project Structure

```
hexo-manager/
├── src/                              # Frontend source
│   ├── main.tsx                      # App entry
│   ├── App.tsx                       # Routing + theme config
│   ├── vite-env.d.ts                 # Env var and static asset type declarations
│   │
│   ├── pages/                        # Pages (15)
│   │   ├── DashboardPage.tsx         # Dashboard
│   │   ├── SitesPage.tsx             # Site management
│   │   ├── ArticlesPage.tsx          # Article management
│   │   ├── CategoriesPage.tsx        # Categories & tags
│   │   ├── ConfigPage.tsx            # Config management
│   │   ├── ThemesPage.tsx            # Theme management
│   │   ├── PluginsPage.tsx           # Plugin management
│   │   ├── FilesPage.tsx             # File management
│   │   ├── PreviewPage.tsx           # Local preview
│   │   ├── DeployPage.tsx            # Deploy config
│   │   ├── GitPage.tsx               # Git operations
│   │   ├── LogsPage.tsx              # Deployment records
│   │   ├── UpdatesPage.tsx           # About & updates
│   │   ├── NotificationsPage.tsx     # Notification center
│   │   ├── SettingsPage.tsx          # Preferences
│   │   └── NotFoundPage.tsx          # 404
│   │
│   ├── components/                   # Common components (26)
│   │   ├── MainLayout.tsx            # Main layout (sidebar + top bar + content)
│   │   ├── Sidebar.tsx               # Sidebar navigation
│   │   ├── TopBar.tsx                # Top bar (site switch, theme, notifications)
│   │   ├── PageContainer.tsx         # Page container
│   │   ├── StatCard.tsx              # Stat card
│   │   ├── CodeEditor.tsx            # Monaco wrapper + CodeBlock
│   │   ├── MarkdownPreview.tsx       # Markdown rendering (incl. Front Matter)
│   │   ├── LogViewer.tsx             # Terminal-style logs (filter/search/export)
│   │   ├── FileTree.tsx              # File tree (search/context menu)
│   │   ├── CreateSiteWizard.tsx      # Create-site wizard
│   │   ├── ConfigPreviewModal.tsx    # Config preview and write
│   │   ├── SettingsPanel.tsx         # Settings panel
│   │   └── ...                       # Remaining base components
│   │
│   ├── stores/                       # Zustand state (6)
│   │   ├── siteStore.ts              # Sites
│   │   ├── articleStore.ts           # Articles
│   │   ├── configStore.ts            # Config, themes, plugins
│   │   ├── deployStore.ts            # Deploy and Git
│   │   ├── updateStore.ts            # Updates
│   │   └── uiStore.ts                # Theme, sidebar, notifications, preview service
│   │
│   ├── hooks/                        # Composite hooks (8)
│   │   ├── useSites.ts               # useSites / useCurrentSiteInfo / useSiteSwitcher
│   │   ├── useArticles.ts            # useArticles / useArticleEditor / useArticleHistory
│   │   ├── useGit.ts                 # Git status and operations
│   │   ├── useDeploy.ts              # useDeployConfig / useDeploy
│   │   ├── useHexo.ts                # useHexoBuild / useHexoServer / useHexoEnv
│   │   ├── useConfig.ts              # Site config editing
│   │   ├── useTheme.ts               # Themes and plugins
│   │   └── useUpdate.ts              # Update check
│   │
│   ├── services/                     # Tauri call wrappers (10)
│   │   ├── invoke.ts                 # Unified invoke wrapper + error normalization
│   │   ├── siteService.ts            # Sites
│   │   ├── articleService.ts         # Articles
│   │   ├── configService.ts          # Config
│   │   ├── themeService.ts           # Themes and plugins
│   │   ├── hexoService.ts            # Hexo commands and preview service
│   │   ├── gitService.ts             # Git
│   │   ├── deployService.ts          # Deploy and config generation
│   │   ├── fileService.ts            # File read/write
│   │   └── updateService.ts          # Updates
│   │
│   ├── types/                        # Type definitions (8)
│   ├── utils/                        # Utility functions (7)
│   ├── constants/                    # Constants and enums
│   ├── i18n/                         # Internationalization (Chinese source text as keys)
│   │   ├── index.ts                  # t() / useI18n() / language parsing and switching
│   │   ├── backendMessages.ts        # English mapping layer for backend Chinese errors
│   │   └── locales/en-US.ts          # English entry dictionary (generated by script, do not edit by hand)
│   └── styles/global.css             # Global styles and CSS variables
│
├── scripts/                          # Development-time scripts (Node, no dependencies)
│   ├── i18n-merge.mjs                # Merge entry parts into en-US.ts (incremental, idempotent)
│   └── i18n-coverage.mjs             # i18n coverage and "translation still contains Chinese" check
│
├── src-tauri/                        # Tauri backend (Rust)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── icons/                        # App icons
│   └── src/
│       ├── main.rs                   # Executable entry
│       ├── lib.rs                    # App initialization + command registration
│       ├── models.rs                 # Data models (aligned with frontend types)
│       │
│       ├── commands/                 # Tauri commands (9 modules)
│       │   ├── site_commands.rs      # Site management
│       │   ├── article_commands.rs   # Article management
│       │   ├── hexo_commands.rs      # Hexo operations
│       │   ├── git_commands.rs       # Git operations
│       │   ├── deploy_commands.rs    # Deploy config
│       │   ├── file_commands.rs      # File operations
│       │   ├── theme_commands.rs     # Theme management
│       │   ├── config_commands.rs    # Config management
│       │   └── update_commands.rs    # Update management
│       │
│       ├── db/                       # Database
│       │   ├── connection.rs         # Connection pool and WAL config
│       │   └── migrations.rs         # Table creation and indexes
│       │
│       ├── hexo/                     # Hexo integration
│       │   ├── builder.rs            # clean / generate / build
│       │   ├── server.rs             # Preview service process management
│       │   ├── config_parser.rs      # YAML read/write
│       │   └── installer.rs          # Dependency installation and environment check
│       │
│       ├── git/                      # Git integration
│       │   ├── status.rs             # Status parsing
│       │   └── operations.rs         # add / commit / push / pull / stash
│       │
│       ├── deploy/                   # Deploy config generation
│       │   ├── config_generator.rs   # Handlebars rendering dispatch
│       │   ├── pages_generator.rs    # Pages platform adaptation
│       │   └── templates/*.hbs       # 15 config templates
│       │
│       ├── update/                   # Update
│       │   ├── check.rs              # Version check
│       │   ├── download.rs           # Download
│       │   └── install.rs            # Install
│       │
│       └── utils/                    # Paths, processes, error handling
│
├── .github/workflows/                # CI (build + release)
├── deploy-config/                    # Deploy config example artifacts
├── CHANGELOG.md                      # Changelog
├── version.json                      # Version metadata
└── README.md
```

---

## Database Design

The database file is located in the system application data directory: `{appDataDir}/hexo-manager/hexo-manager.db`, using **WAL mode** with **foreign key constraints** enabled.

| Table | Purpose | Key Fields |
| --- | --- | --- |
| `sites` | Site master table | `id`, `name`, `path`, `description`, `status`, `created_at` |
| `articles` | Article index | `id`, `site_id`, `title`, `slug`, `categories`, `tags`, `draft`, `created_at` |
| `git_configs` | Git config | `site_id`, `remote_url`, `branch`, `auto_deploy`, `last_push_at` |
| `deploy_configs` | Deploy config | `site_id`, `repo_platform`, `ci_platforms`, `edge_provider`, `origin_strategy` |
| `deploy_logs` | Deployment records | `id`, `site_id`, `status`, `commit_hash`, `duration_ms`, `output` |
| `theme_configs` | Theme config | `site_id`, `theme_name`, `config_path`, `installed_at` |
| `plugins` | Plugin inventory | `id`, `site_id`, `name`, `version`, `enabled` |
| `update_settings` | Update settings | `auto_check`, `last_check_at`, `skip_version` |
| `front_matter_templates` | Front Matter writing templates (**globally shared**, no `site_id`) | `id`, `name`, `description`, `icon`, `fields`(JSON), `body`, `is_builtin`, `sort_order` |

All tables establish a foreign key on `site_id` and configure `ON DELETE CASCADE`, so deleting a site automatically cleans up the associated data; fields such as `articles.site_id` and `deploy_logs.site_id` are indexed to speed up queries. `front_matter_templates` is a global table reused across sites and does not participate in cascade deletion.

---

## Rust Command List

A total of **10 command modules, 64+ commands**, all returning `Result<T, String>`, with error messages localized to Chinese.

| Module | Commands |
| --- | --- |
| **Site Management** | `create_site`, `import_site`, `delete_site`, `get_sites`, `get_site`, `update_site`, `duplicate_site`, `get_site_stats`, `backup_site`, `get_site_file_tree` |
| **Article Management** | `create_article`, `get_articles`, `get_article`, `update_article`, `delete_article`, `publish_article`, `unpublish_article`, `create_draft`, `import_articles`, `search_articles`, `get_categories`, `get_tags`, `rename_category`, `rename_tag`, `delete_category`, `delete_tag`, `get_article_history`, `get_article_at_commit` |
| **Hexo Operations** | `hexo_build`, `hexo_clean`, `hexo_server_start`, `hexo_server_stop`, `hexo_server_list`, `hexo_new_post`, `hexo_new_draft`, `hexo_publish`, `hexo_generate`, `hexo_deploy`, `check_hexo_env`, `install_hexo`, `deploy_site`, `hexo_new_post_article` |
| **Git Operations** | `git_init`, `git_status`, `git_add`, `git_commit`, `git_push`, `git_pull`, `git_log`, `git_diff`, `git_set_remote`, `git_discard_changes`, `git_stash`, `git_stash_pop`, `get_git_config` |
| **Deploy Config** | `get_deploy_config`, `save_deploy_config`, `generate_deploy_config`, `preview_deploy_config`, `check_config_files`, `get_deploy_templates`, `get_deploy_logs`, `rollback_deploy` |
| **File Operations** | `read_file`, `write_file`, `list_directory`, `create_directory`, `delete_path`, `rename_path`, `path_exists`, `copy_path` |
| **Theme Management** | `get_themes`, `install_theme`, `uninstall_theme`, `switch_theme`, `get_theme_config`, `save_theme_config`, `search_theme_market`, `get_plugins`, `install_plugin`, `uninstall_plugin`, `get_recommended_plugins` |
| **Config Management** | `get_site_config`, `save_site_config`, `get_config_raw`, `save_config_raw`, `validate_config`, `backup_config`, `restore_config` |
| **Update Management** | `get_app_info`, `check_update`, `download_update`, `install_update`, `get_update_settings`, `save_update_settings`, `get_changelog`, `open_external` |
| **Writing Templates** | `get_front_matter_templates`, `save_front_matter_template`, `delete_front_matter_template`, `apply_front_matter_template` |

### Async Command Notes

The future of a Tauri async command must satisfy `Send`, so you **must not hold a `State<'_, AppState>` borrow or a `MutexGuard` across an `.await`**. The project uniformly adopts the following pattern:

```rust
#[tauri::command]
pub async fn some_command(state: State<'_, AppState>, id: i64) -> Result<Data, String> {
    // 1. Fetch the required data within a synchronous scope first
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let site = query_site(&db, id)?;
    drop(db); // 2. Explicitly release the lock

    // 3. Then perform the time-consuming operation (holding no borrow at this point)
    let output = run_process(&site.path).await?;
    Ok(output)
}
```

---

## CI/CD Config Generation

After selecting a target platform on the "Deploy Config" page, the tool generates the corresponding config files based on Handlebars templates. The templates are inlined at compile time via `include_str!`, requiring no runtime file dependencies.

### Supported Platforms

| Platform | Generated Files | Description |
| --- | --- | --- |
| **GitHub Pages** | `.github/workflows/deploy.yml`, `CNAME` | Actions build and publish, supports custom domains |
| **Gitee Pages** | `.github/workflows/gitee-pages.yml` | Good access speed in China, custom domains require Pro |
| **GitLab Pages** | `.gitlab-ci.yml` | Pipeline build, artifacts published automatically |
| **Vercel** | `vercel.json`, `.github/workflows/vercel.yml` | Zero-config edge deployment, supports preview environments |
| **Netlify** | `netlify.toml`, `.github/workflows/netlify.yml` | Declarative build and redirect rules |
| **Cloudflare Pages** | `.github/workflows/cloudflare-pages.yml` | Unlimited bandwidth, global edge distribution |
| **EdgeOne Pages** | `.github/workflows/edgeone.yml`, `edgeone.config.json` | Tencent Cloud edge platform, good node coverage in China |

### Edge-Layer Configuration

Besides CI pipelines, edge-layer related configuration can also be generated:

| Artifact | Purpose |
| --- | --- |
| `cloudflare-worker.js` | Cloudflare Worker script: smart origin pull, failover, cache policy |
| `edgeone-config.txt` | EdgeOne console configuration guide (cache rules, origin-pull policy, HTTPS) |
| `edgeone.config.json` | EdgeOne declarative configuration |
| `cloudflare.toml` | Wrangler project configuration |
| `deploy_readme.md` | Deployment runbook, including console steps for each platform |

### Origin-Pull Policy

| Policy | Description |
| --- | --- |
| `failover` | Smart failover — switches to the backup origin when the primary origin is unavailable |
| `primary` | Primary origin only, simplest configuration |
| `round-robin` | Multi-origin round robin, distributing the load |
| `nearest` | Nearest origin pull, selecting the origin site based on the user's geographic location |

### Generation Flow

1. Fill in the repository address, Node version, build command, and environment variables in "Deploy Config"
2. Select the deployment platform (multiple selectable) and the edge-layer provider
3. Click "Preview Config" to view the content of the files to be generated
4. After confirming, click "Write to Disk", and the tool backs up any existing files with the same name before writing

---

## Versioning

### Semantic Versioning

Follows [SemVer 2.0.0](https://semver.org/lang/en/): `MAJOR.MINOR.PATCH`

- **MAJOR**: Incompatible API changes
- **MINOR**: Backward-compatible feature additions
- **PATCH**: Backward-compatible bug fixes

### version.json

Records the current version and history:

```json
{
  "version": "1.0.0",
  "major": 1,
  "minor": 0,
  "patch": 0,
  "isLocked": false,
  "history": [
    { "version": "1.0.0", "type": "major", "description": "First official release", "createdAt": "2026-09-30T00:00:00Z" }
  ]
}
```

When `isLocked` is `true`, modifying the version number is forbidden (used to freeze a formal release).

### Git Tag

Tag on release, in the format `v{MAJOR}.{MINOR}.{PATCH}`:

```bash
git tag -a v1.0.0 -m "release: 1.0.0"
git push origin v1.0.0
```

### CHANGELOG.md

Follows the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) specification, with categories including:

`Added` / `Changed` / `Deprecated` / `Removed` / `Fixed` / `Security`

---

## UI Language (i18n)

The application supports two UI sets, **Simplified Chinese and English**, and by default **follows the system language**:

| System language (`LANG` / `LC_*` → webview's `navigator.language`) | Default UI |
| --- | --- |
| Starts with `zh` (`zh-CN`, `zh-TW`, `zh_CN.UTF-8`…) | Simplified Chinese |
| Everything else (`en_US`, `de_DE`, `C`, `POSIX`, empty value…) | **English** |

You can also pin it to "Simplified Chinese / English / Follow System" in "Preferences → General → UI Language"; the choice is written to `localStorage` (key `hexo-manager:locale`). When the system language changes (the `languagechange` event), preferences set to "Follow System" update in real time.

### Implementation: Chinese Source Text as the Keys

The source code keeps the Chinese source text and only wraps it with `t()`; the English translations are centralized in `src/i18n/locales/en-US.ts`, where **the key is the Chinese source text**:

```tsx
const { t } = useI18n();           // In a component: subscribes to language changes, re-renders on switch
t('{count} articles in total', { count: 3 });   // Supports {name} placeholder interpolation

import { t } from '@/i18n';        // Use directly in module-level / non-component code (non-reactive)
```

- Chinese environment: returned as-is, with zero lookup overhead
- English environment: returns English when the dictionary lookup hits; **falls back to the Chinese as-is when it misses** (never displays the key, never throws)
- The side effects of switching languages (`dayjs.locale`, `<html lang>`, AntD `ConfigProvider` locale, window title) are handled uniformly by `src/i18n` and `src/App.tsx`
- The dictionary is evaluated once at load time and participates in tree-shaking, introducing no third-party i18n dependencies

### Workflow for Adding New Copy

1. Wrap the copy in the code with `t('Chinese source text')`
2. Write the "Chinese source text → English translation" into any `.json` under `src/i18n/locales/_parts/` (multiple files can be prepared in parallel)
3. Run `node scripts/i18n-merge.mjs` to incrementally merge into `en-US.ts` (**do not edit that file by hand**; the parts directory is automatically cleared after merging)
4. Run `node scripts/i18n-coverage.mjs` to verify coverage: the exit code is 1 when translations are missing, so it can be used directly as a CI gate

### Which Chinese Text Should **NOT** Be Translated

Once a value will be written to a file or database, passed as a parameter to a Rust command, or used in comparisons and matching, it must remain as-is. Typical examples: enum and status values (`published`, `active`), CSS class names, `localStorage` keys, URLs, regexes, file paths, Git branch names, config key names, log content, package names and theme names. Such strings should **not** be wrapped with `t()`.

### English Mapping for Backend Errors

Rust-side commands uniformly return `Result<T, String>`, and the error copy is in Chinese. To avoid changing the signatures of 60+ commands, a **transition layer** `src/i18n/backendMessages.ts` was added: `src/services/invoke.ts` calls `translateBackendMessage()` in the catch block, mapping to English via an "exact table + parameterized regex rule table", and returns the Chinese as-is when it misses. The thorough solution is to change the Rust-side errors to an error code enum, at which point that file can be removed.

---

## Development Guidelines

### TypeScript

- **Strict mode** enabled (`strict: true`)
- **`any` is forbidden**; when escape is truly needed, use `unknown` and narrow it explicitly
- `noUnusedLocals` and `noUnusedParameters` are enabled; no unused imports or variables may be left behind
- Type imports uniformly use `import type { X } from '...'`

### Naming Conventions

| Category | Convention | Example |
| --- | --- | --- |
| Component files | PascalCase | `ArticleListItem.tsx` |
| Utils/Hooks/Services | camelCase | `useArticles.ts`, `formatDateTime` |
| Types/Interfaces | PascalCase | `DeployConfig` |
| Constants | UPPER_SNAKE_CASE | `NAV_ITEMS`, `DEPLOY_PLATFORMS` |
| Rust commands | snake_case | `get_site_stats` |
| CSS variables | `--hm-` prefix | `--hm-bg`, `--hm-border` |

### Path Aliases

The frontend uniformly uses `@/` to point to `src/`:

```typescript
import { useSiteStore } from '@/stores';
import type { DeployConfig } from '@/types';
```

### Git Commit Conventions

Format: `type(scope): subject`

| type | Purpose |
| --- | --- |
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Refactoring (no behavior change) |
| `docs` | Documentation changes |
| `style` | Formatting adjustments (no logic impact) |
| `chore` | Miscellaneous such as build, dependencies, config |
| `perf` | Performance optimization |
| `test` | Test related |
| `version` | Version number changes |

Examples:

```
feat(article): support live Markdown preview and split-pane editing
fix(deploy): fix unescaped origin address in the Cloudflare Worker template
docs(readme): add Linux system dependency installation instructions
version: release 1.0.0
```

---

## FAQ

### `hexo: command not found`

The application prefers the site's `node_modules/.bin/hexo`, and falls back to the global `hexo` if it does not exist. Please click the environment check on the "Local Preview" page to confirm, or manually add the dependency:

```bash
cd /path/to/your-site
npm install
```

### Build failure: `Cannot find module 'hexo'`

The site is missing dependencies. Run "Install Dependencies" on the "Local Preview" page, or run `npm install` manually in the site directory.

### Git push asks for a username and password

The tool calls the system Git, and credentials are managed at the system level. Recommendations:

- **SSH method**: Generate a key and add it to the code hosting platform
  ```bash
  ssh-keygen -t ed25519 -C "your@email.com"
  ```
- **HTTPS method**: Configure credential caching
  ```bash
  git config --global credential.helper store   # stored in plaintext, use with caution
  # or use osxkeychain on macOS, manager on Windows
  ```

### Deployment records are empty

Deployment records are written after each "one-click deploy". If you just created a site, you need to perform at least one deployment first. Also confirm that the currently selected site in the top bar is the correct site.

### Leftover preview service

If the application exits abnormally, the `hexo server` process may not be reclaimed. Go to the "Notification Center" and click the refresh button in the top-right corner; the tool compares port usage to sync the list, and you can manually stop the leftover processes.

### Auto-update shows "check for updates failed"

The auto-update check tries the following update sources in order of priority, and the first one that successfully resolves the latest version takes effect:

1. `latest.json` from GitHub Releases (the Tauri updater manifest, automatically generated and uploaded by tauri-action when tagging)
2. The GitHub Releases API (`/releases/latest`, as a fallback when the manifest is missing)

On restricted networks in China all of them may time out; you can disable auto-check in "About & Updates" and instead download manually from the project repository.
If you need to point to a self-hosted update service, you can pass a custom `manifest_url` when calling the `check_update` command,
the manifest format is compatible with both `{"version": "...", "platforms": {...}}` and the GitHub Release structures.

### Dark mode style anomalies

The theme drives CSS variables through the `html.dark` class name. If styles become garbled, check whether an abnormal `hexo-manager:theme` value exists in `localStorage`; you can clear it in "Preferences → Local Data" and restart.

---

## License

[MIT License](./LICENSE)

Copyright © 2026 XFM
