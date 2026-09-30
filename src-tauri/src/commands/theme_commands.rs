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
fn current_theme(site_path: &str) -> String {
    let cfg = format!("{}/_config.yml", site_path.trim_end_matches('/'));
    crate::hexo::config_parser::parse_yaml_file(&cfg)
        .ok()
        .and_then(|v| v.get("theme").and_then(|t| t.as_str()).map(str::to_string))
        .unwrap_or_else(|| "landscape".into())
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
    let theme_name = theme.unwrap_or_else(|| current_theme(&site_path));

    let theme_dir = Path::new(&site_path).join("themes").join(&theme_name);
    let cfg_path = theme_dir.join("_config.yml");
    let cfg_str = cfg_path.display().to_string();

    if !cfg_path.exists() {
        // 主题可能使用根目录下的 _config.<theme>.yml
        let alt = Path::new(&site_path).join(format!("_config.{}.yml", theme_name));
        if alt.exists() {
            let raw = std::fs::read_to_string(&alt).map_err(|e| e.to_string())?;
            let config =
                crate::hexo::config_parser::parse_yaml_str(&raw).map_err(|e| e.to_string())?;
            return Ok(ThemeConfig {
                site_id,
                theme_name,
                config,
                is_active: true,
                raw,
            });
        }
        return Err(format!(
            "主题配置文件不存在：{}（请确认主题是否已安装）",
            cfg_str
        ));
    }

    let raw = std::fs::read_to_string(&cfg_path).map_err(|e| e.to_string())?;
    let config = crate::hexo::config_parser::parse_yaml_str(&raw).map_err(|e| e.to_string())?;
    let active = current_theme(&site_path);

    Ok(ThemeConfig {
        is_active: theme_name == active,
        site_id,
        theme_name,
        config,
        raw,
    })
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
