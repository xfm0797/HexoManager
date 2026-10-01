//! 主题管理命令（对应大纲 7.7）。

use crate::db::Db;
use crate::models::{Theme, ThemeConfig, ThemeInfo};
use crate::utils::error::{AppError, AppResult};
use crate::utils::{format_system_time, process};
use crate::AppState;
use rusqlite::params;
use serde_json::Value;
use std::path::{Path, PathBuf};
use tauri::State;

fn site_path_of(db: &Db, site_id: i64) -> AppResult<String> {
    let conn = db.conn()?;
    conn.query_row(
        "SELECT path FROM sites WHERE id = ?1",
        params![site_id],
        |r| r.get(0),
    )
    .map_err(|_| AppError::NotFound(format!("站点不存在：{}", site_id)))
}

/// 读取站点 _config.yml 中当前启用的主题名。
///
/// 解析失败或未配置 `theme` 字段时返回 `None`，由调用方决定如何处理；
/// 不再静默兜底为 `landscape`（那会让后续报错指向一个与用户无关的主题）。
fn current_theme_opt(site_path: &str) -> Option<String> {
    let cfg = format!("{}/_config.yml", site_path.trim_end_matches('/'));
    crate::hexo::config_parser::parse_yaml_file(&cfg)
        .ok()
        .and_then(|v| {
            v.get("theme").and_then(|t| match t {
                Value::String(s) => Some(s.clone()),
                // Hexo 支持 `theme: {name: xxx}` 的对象写法
                Value::Object(o) => o.get("name").and_then(Value::as_str).map(str::to_string),
                _ => None,
            })
        })
        .filter(|s| !s.trim().is_empty())
}

/// 读取当前主题名，缺省时按 `themes/` 目录中的唯一主题推断，最后才回退 `landscape`。
fn current_theme(site_path: &str) -> String {
    if let Some(name) = current_theme_opt(site_path) {
        return name;
    }

    // 站点未显式配置 theme 时，若 themes/ 下只有一个主题，就直接用它
    let themes_dir = Path::new(site_path).join("themes");
    if let Ok(entries) = std::fs::read_dir(&themes_dir) {
        let candidates: Vec<String> = entries
            .flatten()
            .filter(|e| e.path().is_dir())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|name| !name.starts_with('.'))
            .collect();
        if candidates.len() == 1 {
            return candidates[0].clone();
        }
    }

    "landscape".into()
}

/// 从主题的 package.json 或 _config.yml 提取元信息。
fn read_theme_meta(
    theme_dir: &Path,
) -> (
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
) {
    let mut version = None;
    let mut description = None;
    let mut author = None;
    let mut repo = None;

    // package.json（Node 包形式主题）
    let pkg_path = theme_dir.join("package.json");
    if let Ok(content) = std::fs::read_to_string(&pkg_path) {
        if let Ok(v) = serde_json::from_str::<Value>(&content) {
            version = v.get("version").and_then(Value::as_str).map(str::to_string);
            description = v
                .get("description")
                .and_then(Value::as_str)
                .map(str::to_string);
            author = v.get("author").and_then(|a| match a {
                Value::String(s) => Some(s.clone()),
                Value::Object(o) => o.get("name").and_then(Value::as_str).map(str::to_string),
                _ => None,
            });
            repo = v.get("repository").and_then(|r| match r {
                Value::String(s) => Some(s.clone()),
                Value::Object(o) => o.get("url").and_then(Value::as_str).map(str::to_string),
                _ => None,
            });
        }
    }

    // 回退到主题自身的 _config.yml
    let cfg_path = theme_dir.join("_config.yml");
    if let Ok(content) = std::fs::read_to_string(&cfg_path) {
        if let Ok(v) = crate::hexo::config_parser::parse_yaml_str(&content) {
            if description.is_none() {
                description = v
                    .get("description")
                    .and_then(|d| d.as_str())
                    .map(str::to_string);
            }
            if author.is_none() {
                author = v.get("author").and_then(|d| d.as_str()).map(str::to_string);
            }
            if version.is_none() {
                version = v
                    .get("version")
                    .and_then(|d| d.as_str())
                    .map(str::to_string);
            }
        }
    }

    (version, description, author, repo)
}

/// 获取已安装主题列表。
#[tauri::command]
pub fn get_themes(state: State<'_, AppState>, site_id: i64) -> Result<Vec<Theme>, String> {
    let db = &state.db;
    let site_path = site_path_of(db, site_id).map_err(|e| e.to_string())?;
    let active = current_theme(&site_path);

    let themes_dir = Path::new(&site_path).join("themes");
    let mut themes = Vec::new();

    if themes_dir.exists() {
        let entries = std::fs::read_dir(&themes_dir).map_err(|e| e.to_string())?;
        for entry in entries.flatten() {
            if !entry.path().is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            // 跳过系统目录
            if name.starts_with('.') || name == "_config.yml" {
                continue;
            }

            let (version, description, author, repo) = read_theme_meta(&entry.path());
            let has_config = entry.path().join("_config.yml").exists();
            let installed_at = entry
                .metadata()
                .ok()
                .and_then(|m| m.created().or_else(|_| m.modified()).ok())
                .and_then(format_system_time);

            themes.push(Theme {
                is_active: name == active,
                name,
                path: entry.path().display().to_string(),
                version,
                description,
                author,
                repo,
                has_config,
                installed_at,
            });
        }
    }

    // 即使 themes 目录为空，也把当前主题作为条目返回
    if themes.is_empty() || !themes.iter().any(|t| t.is_active) {
        let default_dir = themes_dir.join(&active);
        if default_dir.exists() {
            let (version, description, author, repo) = read_theme_meta(&default_dir);
            themes.push(Theme {
                name: active.clone(),
                path: default_dir.display().to_string(),
                version,
                description,
                author,
                repo,
                is_active: true,
                has_config: default_dir.join("_config.yml").exists(),
                installed_at: None,
            });
        }
    }

    themes.sort_by(|a, b| {
        b.is_active
            .cmp(&a.is_active)
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(themes)
}

/// 安装主题。
///
/// 支持三种来源：
///   1. npm 包名（如 `hexo-theme-butterfly`）
///   2. Git 仓库地址（https:// 或 git@ 开头）
///   3. 本地目录绝对路径
#[tauri::command]
pub async fn install_theme(
    state: State<'_, AppState>,
    site_id: i64,
    name: String,
    source: Option<String>,
) -> Result<Theme, String> {
    let db = Db::from_arc(&state.db);
    install_theme_impl(&db, site_id, &name, source.as_deref())
        .await
        .map_err(|e| e.to_string())
}

async fn install_theme_impl(
    db: &Db,
    site_id: i64,
    name: &str,
    source: Option<&str>,
) -> AppResult<Theme> {
    let site_path = site_path_of(db, site_id)?;
    let themes_dir = Path::new(&site_path).join("themes");
    std::fs::create_dir_all(&themes_dir)?;

    // 规范化主题目录名：去掉 hexo-theme- 前缀
    let dir_name = name
        .trim()
        .trim_start_matches("hexo-theme-")
        .trim_start_matches("hexo_theme_")
        .to_string();
    let target = themes_dir.join(&dir_name);

    if target.exists() {
        return Err(AppError::InvalidArgument(format!(
            "主题已存在：{}",
            dir_name
        )));
    }

    let src = source.unwrap_or(name).trim().to_string();

    if src.starts_with("http://") || src.starts_with("https://") || src.starts_with("git@") {
        // Git 克隆
        let out = process::run(
            "git",
            &["clone", "--depth", "1", &src, &target.display().to_string()],
            Some(Path::new(&site_path)),
            Some(600),
        )
        .await?;
        if !out.success {
            return Err(AppError::Process(format!(
                "克隆主题失败：{}",
                out.combined()
            )));
        }
    } else if Path::new(&src).is_absolute() && Path::new(&src).exists() {
        // 本地目录复制
        copy_dir(Path::new(&src), &target)?;
    } else {
        // npm 安装
        let npm_bin = if cfg!(target_os = "windows") {
            "npm.cmd"
        } else {
            "npm"
        };
        let out = process::run(
            npm_bin,
            &["install", &format!("{}@latest", name), "--save"],
            Some(Path::new(&site_path)),
            Some(900),
        )
        .await?;

        if !out.success {
            return Err(AppError::Process(format!(
                "npm 安装主题失败：{}",
                out.combined()
            )));
        }

        // npm 安装后把 node_modules 中的主题复制到 themes 目录
        let installed = Path::new(&site_path).join("node_modules").join(name);
        if installed.exists() {
            copy_dir(&installed, &target)?;
        } else {
            // 部分主题通过 npm 安装后由 Hexo 直接识别，无需复制
            return Err(AppError::Other(format!(
                "npm 安装完成，但未在 node_modules 中找到主题 `{}`，请检查包名是否正确",
                name
            )));
        }
    }

    // 若主题缺少 _config.yml，从示例配置复制
    if !target.join("_config.yml").exists() {
        for candidate in ["_config.example.yml", "_config.template.yml", "config.yml"] {
            let example = target.join(candidate);
            if example.exists() {
                let _ = std::fs::copy(&example, target.join("_config.yml"));
                break;
            }
        }
    }

    let (version, description, author, repo) = read_theme_meta(&target);
    let active = current_theme(&site_path);

    Ok(Theme {
        name: dir_name.clone(),
        path: target.display().to_string(),
        version,
        description,
        author,
        repo,
        is_active: dir_name == active,
        has_config: target.join("_config.yml").exists(),
        installed_at: Some(crate::utils::now_utc()),
    })
}

fn copy_dir(src: &Path, dst: &Path) -> AppResult<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let name = entry.file_name();
        // 跳过版本库与依赖
        let n = name.to_string_lossy();
        if n == ".git" || n == "node_modules" {
            continue;
        }
        let to = dst.join(&name);
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &to)?;
        } else {
            std::fs::copy(entry.path(), &to)?;
        }
    }
    Ok(())
}

/// 切换站点主题（写入 `_config.yml` 的 theme 字段）。
#[tauri::command]
pub async fn switch_theme(
    state: State<'_, AppState>,
    site_id: i64,
    name: String,
) -> Result<(), String> {
    let db = Db::from_arc(&state.db);
    let db = &db;
    let site_path = site_path_of(db, site_id).map_err(|e| e.to_string())?;

    // 校验主题已安装
    let theme_dir = Path::new(&site_path).join("themes").join(&name);
    if !theme_dir.exists() {
        return Err(format!("主题未安装：{}", name));
    }

    let cfg = format!("{}/_config.yml", site_path.trim_end_matches('/'));
    let mut value = crate::hexo::config_parser::parse_yaml_file(&cfg).map_err(|e| e.to_string())?;

    if let Some(obj) = value.as_object_mut() {
        obj.insert("theme".into(), Value::String(name.clone()));
    } else {
        return Err("站点配置文件格式异常，无法写入 theme 字段".into());
    }

    crate::hexo::config_parser::write_yaml_file(&cfg, &value).map_err(|e| e.to_string())?;

    {
        let conn = db.conn().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE sites SET theme = ?2, updated_at = ?3 WHERE id = ?1",
            params![site_id, name, crate::utils::now_utc()],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// 获取主题配置（结构化 + 原始文本）。
#[tauri::command]
pub fn get_theme_config(
    state: State<'_, AppState>,
    site_id: i64,
    theme: Option<String>,
) -> Result<ThemeConfig, String> {
    let db = &state.db;
    let site_path = site_path_of(db, site_id).map_err(|e| e.to_string())?;

    // 优先使用调用方指定的主题名（来自界面点击的那个主题卡片）
    let theme_name = theme
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| current_theme(&site_path));

    let site_root = Path::new(&site_path);
    let active = current_theme(&site_path);

    // 主题配置的常见存放位置，按 Hexo 实际约定排序：
    // 1. themes/<theme>/_config.yml        主题自带默认配置
    // 2. _config.<theme>.yml               站点级覆盖（官方推荐做法）
    // 3. themes/<theme>/_config.yaml       少见的 yaml 扩展名
    let candidates = [
        site_root.join("themes").join(&theme_name).join("_config.yml"),
        site_root.join(format!("_config.{}.yml", theme_name)),
        site_root.join("themes").join(&theme_name).join("_config.yaml"),
    ];

    for path in candidates.iter() {
        if path.exists() {
            let raw = std::fs::read_to_string(path).map_err(|e| {
                format!("读取主题配置失败（{}）：{}", path.display(), e)
            })?;
            let config = crate::hexo::config_parser::parse_yaml_str(&raw)
                .map_err(|e| format!("解析主题配置失败（{}）：{}", path.display(), e))?;

            return Ok(ThemeConfig {
                is_active: theme_name == active,
                site_id,
                theme_name,
                config,
                raw,
            });
        }
    }

    // 都找不到：给出可操作的诊断信息，而不是只有一句「文件不存在」
    let theme_dir = site_root.join("themes").join(&theme_name);

    let hint = if !theme_dir.exists() {
        // 主题目录本身不存在 —— 列出现有主题帮助定位
        let mut installed: Vec<String> = Vec::new();
        if let Ok(entries) = std::fs::read_dir(site_root.join("themes")) {
            installed = entries
                .flatten()
                .filter(|e| e.path().is_dir())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .filter(|n| !n.starts_with('.'))
                .collect();
        }

        if installed.is_empty() {
            format!(
                "主题目录不存在：{}。该站点尚未安装任何主题，请先在「主题管理」中安装。",
                theme_dir.display()
            )
        } else {
            format!(
                "主题目录不存在：{}。当前已安装的主题：{}。",
                theme_dir.display(),
                installed.join("、")
            )
        }
    } else {
        // 主题目录在但没配置文件 —— 列出目录内实际文件
        let mut files: Vec<String> = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&theme_dir) {
            files = entries
                .flatten()
                .map(|e| e.file_name().to_string_lossy().to_string())
                .filter(|n| !n.starts_with('.'))
                .take(20)
                .collect();
        }

        if files.is_empty() {
            format!(
                "主题「{}」目录为空，主题可能未完整安装（{}）。",
                theme_name,
                theme_dir.display()
            )
        } else {
            format!(
                "主题「{}」目录中未找到 _config.yml（目录内容：{}）。",
                theme_name,
                files.join("、")
            )
        }
    };

    Err(format!(
        "{}（主题名：{}，站点路径：{}）",
        hint, theme_name, site_path
    ))
}

/// 更新主题配置。
#[tauri::command]
pub fn update_theme_config(
    state: State<'_, AppState>,
    site_id: i64,
    theme: String,
    config: Option<Value>,
    raw: Option<String>,
) -> Result<(), String> {
    let db = &state.db;
    let site_path = site_path_of(db, site_id).map_err(|e| e.to_string())?;

    let theme_dir = Path::new(&site_path).join("themes").join(&theme);
    let cfg_path = theme_dir.join("_config.yml");

    // 优先使用原始文本写入，保留注释与缩进风格
    if let Some(raw_text) = raw {
        crate::hexo::config_parser::validate_yaml(&raw_text).map_err(|e| e.to_string())?;
        crate::hexo::config_parser::write_raw(&cfg_path.display().to_string(), &raw_text)
            .map_err(|e| e.to_string())?;
    } else if let Some(value) = config {
        crate::hexo::config_parser::write_yaml_file(&cfg_path.display().to_string(), &value)
            .map_err(|e| e.to_string())?;
    } else {
        return Err("必须提供 config 或 raw 其中之一".into());
    }

    // 同步到主题配置表
    let stored = std::fs::read_to_string(&cfg_path).unwrap_or_default();
    {
        let conn = db.conn().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO theme_configs (site_id, theme_name, config, is_active)
             VALUES (?1, ?2, ?3, 0)
             ON CONFLICT DO NOTHING",
            params![site_id, theme, stored],
        )
        .ok();
    }

    Ok(())
}

/// 搜索主题（基于公开主题清单，离线回退为内置列表）。
#[tauri::command]
pub async fn search_themes(query: Option<String>) -> Result<Vec<ThemeInfo>, String> {
    search_themes_impl(query.as_deref())
        .await
        .map_err(|e| e.to_string())
}

async fn search_themes_impl(query: Option<&str>) -> AppResult<Vec<ThemeInfo>> {
    // 内置精选主题清单（离线可用）
    let builtin: Vec<ThemeInfo> = vec![
        theme_info(
            "hexo-theme-butterfly",
            "Butterfly",
            "功能丰富、文档完善的热门主题",
            "Jerry C",
            "https://github.com/jerryc127/hexo-theme-butterfly",
            5000,
        ),
        theme_info(
            "hexo-theme-next",
            "NexT",
            "经典简洁，长期维护的元老级主题",
            "iissnan",
            "https://github.com/next-theme/hexo-theme-next",
            8000,
        ),
        theme_info(
            "hexo-theme-fluid",
            "Fluid",
            "Material Design 风格，开箱即用",
            "Fluid-dev",
            "https://github.com/fluid-dev/hexo-theme-fluid",
            3000,
        ),
        theme_info(
            "hexo-theme-volantis",
            "Volantis",
            "模块化设计，可定制性极强",
            "Volantis-x",
            "https://github.com/volantis-x/hexo-theme-volantis",
            1500,
        ),
        theme_info(
            "hexo-theme-stellar",
            "Stellar",
            "现代化的卡片式布局主题",
            "xaoxuu",
            "https://github.com/xaoxuu/hexo-theme-stellar",
            1200,
        ),
        theme_info(
            "hexo-theme-shoka",
            "Shoka",
            "轻量优雅，适合技术博客",
            "amehime",
            "https://github.com/amehime/hexo-theme-shoka",
            900,
        ),
        theme_info(
            "hexo-theme-anzhiyu",
            "安知鱼",
            "二次元风格，视觉效果出众",
            "anzhiyu-c",
            "https://github.com/anzhiyu-c/hexo-theme-anzhiyu",
            2000,
        ),
        theme_info(
            "hexo-theme-matery",
            "Matery",
            "响应式卡片主题，适合图文混排",
            "blinkfox",
            "https://github.com/blinkfox/hexo-theme-matery",
            2500,
        ),
        theme_info(
            "hexo-theme-indigo",
            "Indigo",
            "Material Design Lite 实现",
            "yscoder",
            "https://github.com/yscoder/hexo-theme-indigo",
            1700,
        ),
        theme_info(
            "hexo-theme-cactus",
            "Cactus",
            "极简风格，专注阅读体验",
            "probberechts",
            "https://github.com/probberechts/hexo-theme-cactus",
            1100,
        ),
    ];

    let filtered: Vec<ThemeInfo> = match query {
        Some(q) if !q.trim().is_empty() => {
            let lower = q.trim().to_lowercase();
            builtin
                .into_iter()
                .filter(|t| {
                    t.name.to_lowercase().contains(&lower)
                        || t.npm_name
                            .as_deref()
                            .map(|n| n.to_lowercase().contains(&lower))
                            .unwrap_or(false)
                        || t.display_name
                            .as_deref()
                            .map(|n| n.to_lowercase().contains(&lower))
                            .unwrap_or(false)
                        || t.description
                            .as_deref()
                            .map(|d| d.to_lowercase().contains(&lower))
                            .unwrap_or(false)
                })
                .collect()
        }
        _ => builtin,
    };

    Ok(filtered)
}

fn theme_info(
    npm_name: &str,
    display_name: &str,
    description: &str,
    author: &str,
    repo: &str,
    stars: i64,
) -> ThemeInfo {
    ThemeInfo {
        name: npm_name.trim_start_matches("hexo-theme-").to_string(),
        display_name: Some(display_name.to_string()),
        description: Some(description.to_string()),
        author: Some(author.to_string()),
        repo: Some(repo.to_string()),
        stars: Some(stars),
        npm_name: Some(npm_name.to_string()),
    }
}

/// 卸载主题。
#[tauri::command]
pub fn uninstall_theme(
    state: State<'_, AppState>,
    site_id: i64,
    name: String,
) -> Result<(), String> {
    let db = &state.db;
    let site_path = site_path_of(db, site_id).map_err(|e| e.to_string())?;

    if current_theme(&site_path) == name {
        return Err(format!("主题 `{}` 正在使用中，请先切换到其他主题", name));
    }

    let theme_dir = Path::new(&site_path).join("themes").join(&name);
    if !theme_dir.exists() {
        return Err(format!("主题不存在：{}", name));
    }

    std::fs::remove_dir_all(&theme_dir).map_err(|e| format!("卸载主题失败：{}", e))
}

/// 更新主题（Git 拉取或 npm 更新）。
#[tauri::command]
pub async fn update_theme(
    state: State<'_, AppState>,
    site_id: i64,
    name: String,
) -> Result<String, String> {
    let db = Db::from_arc(&state.db);
    let db = &db;
    let site_path = site_path_of(db, site_id).map_err(|e| e.to_string())?;
    let theme_dir = PathBuf::from(&site_path).join("themes").join(&name);

    if !theme_dir.exists() {
        return Err(format!("主题不存在：{}", name));
    }

    // 优先 Git 拉取
    if theme_dir.join(".git").exists() {
        let out = process::run("git", &["pull", "--ff-only"], Some(&theme_dir), Some(300)).await;
        if let Ok(o) = out {
            if o.success {
                return Ok(o.combined());
            }
        }
    }

    // 回退到 npm 更新
    let npm_bin = if cfg!(target_os = "windows") {
        "npm.cmd"
    } else {
        "npm"
    };
    let pkg = format!("hexo-theme-{}", name.trim_start_matches("hexo-theme-"));
    let out = process::run(
        npm_bin,
        &["update", &pkg],
        Some(Path::new(&site_path)),
        Some(600),
    )
    .await
    .map_err(|e| e.to_string())?;

    if !out.success {
        return Err(format!(
            "主题更新失败，该主题可能既非 Git 仓库也无法通过 npm 更新：\n{}",
            out.combined()
        ));
    }

    Ok(out.combined())
}

/// 打开主题演示链接（返回链接供前端打开）。
#[tauri::command]
pub fn get_theme_preview_url(
    state: State<'_, AppState>,
    site_id: i64,
    name: String,
) -> Result<String, String> {
    let db = &state.db;
    let site_path = site_path_of(db, site_id).map_err(|e| e.to_string())?;
    let theme_dir = Path::new(&site_path).join("themes").join(&name);

    if !theme_dir.exists() {
        return Err(format!("主题不存在：{}", name));
    }

    // 从 README 中提取第一个演示链接
    for readme in ["README.md", "readme.md", "README.MD"] {
        let path = theme_dir.join(readme);
        if let Ok(content) = std::fs::read_to_string(&path) {
            for line in content.lines() {
                // Markdown 链接语法 [text](url)
                if let Some(start) = line.find("](") {
                    if let Some(end) = line[start + 2..].find(')') {
                        let url = &line[start + 2..start + 2 + end];
                        if url.starts_with("http") && !url.contains("github.com") {
                            return Ok(url.to_string());
                        }
                    }
                }
                // 纯 URL
                if let Some(idx) = line.find("https://") {
                    let candidate: String = line[idx..]
                        .chars()
                        .take_while(|c| !c.is_whitespace() && *c != ')' && *c != ']')
                        .collect();
                    if !candidate.contains("github.com") && candidate.len() > 12 {
                        return Ok(candidate);
                    }
                }
            }
        }
    }

    Err("未在主题文档中找到演示链接".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// 每个用例独立建临时站点目录，避免相互污染
    fn temp_site(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "hexo-mgr-theme-test-{}-{}",
            tag,
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(path: &std::path::Path, content: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, content).unwrap();
    }

    /// theme 字段为字符串时能正确解析
    #[test]
    fn test_current_theme_opt_string_form() {
        let site = temp_site("str");
        write(
            &site.join("_config.yml"),
            "title: Demo\ntheme: next\n",
        );
        assert_eq!(current_theme_opt(site.to_str().unwrap()), Some("next".into()));
        let _ = fs::remove_dir_all(&site);
    }

    /// theme 字段为 `{name: xxx}` 对象写法时也要能解析
    #[test]
    fn test_current_theme_opt_object_form() {
        let site = temp_site("obj");
        write(
            &site.join("_config.yml"),
            "title: Demo\ntheme:\n  name: butterfly\n",
        );
        assert_eq!(
            current_theme_opt(site.to_str().unwrap()),
            Some("butterfly".into())
        );
        let _ = fs::remove_dir_all(&site);
    }

    /// 未配置 theme 且 themes/ 下只有一个主题时按该主题推断，
    /// 不再无条件兜底 landscape（这正是「加载配置不出来」的根因之一）
    #[test]
    fn test_current_theme_infers_single_installed_theme() {
        let site = temp_site("infer");
        write(&site.join("_config.yml"), "title: Demo\n");
        fs::create_dir_all(site.join("themes").join("butterfly")).unwrap();

        assert_eq!(current_theme_opt(site.to_str().unwrap()), None);
        assert_eq!(current_theme(site.to_str().unwrap()), "butterfly");
        let _ = fs::remove_dir_all(&site);
    }

    /// 完全无法推断时才回退 landscape
    #[test]
    fn test_current_theme_falls_back_to_landscape() {
        let site = temp_site("fallback");
        write(&site.join("_config.yml"), "title: Demo\n");
        assert_eq!(current_theme(site.to_str().unwrap()), "landscape");
        let _ = fs::remove_dir_all(&site);
    }

    /// 官方推荐做法：站点根目录的 _config.<theme>.yml 也应被找到
    #[test]
    fn test_theme_config_candidate_order_covers_site_level_override() {
        let site = temp_site("override");
        fs::create_dir_all(site.join("themes").join("next")).unwrap();
        write(
            &site.join("_config.next.yml"),
            "menu:\n  home: /\n",
        );

        let candidates = [
            site.join("themes").join("next").join("_config.yml"),
            site.join("_config.next.yml"),
            site.join("themes").join("next").join("_config.yaml"),
        ];
        let hit = candidates.iter().find(|p| p.exists()).unwrap();
        assert!(hit.ends_with("_config.next.yml"));
        let _ = fs::remove_dir_all(&site);
    }
}
