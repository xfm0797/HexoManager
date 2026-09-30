//! 配置管理命令（站点配置、原始 YAML、插件）。

use crate::db::Db;
use crate::models::Plugin;
use crate::utils::error::{AppError, AppResult};
use crate::AppState;
use rusqlite::params;
use serde_json::Value;
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

fn config_path_of(db: &Db, site_id: i64) -> AppResult<(String, String)> {
    let site_path = site_path_of(db, site_id)?;
    let cfg = format!("{}/_config.yml", site_path.trim_end_matches('/'));
    Ok((site_path, cfg))
}

/// 读取站点配置（结构化）。
#[tauri::command]
pub fn get_site_config(state: State<'_, AppState>, site_id: i64) -> Result<Value, String> {
    let (_, cfg) = config_path_of(&state.db, site_id).map_err(|e| e.to_string())?;
    crate::hexo::config_parser::parse_yaml_file(&cfg).map_err(|e| e.to_string())
}

/// 读取站点配置原始文本（保留注释）。
#[tauri::command]
pub fn get_site_config_raw(state: State<'_, AppState>, site_id: i64) -> Result<String, String> {
    let (_, cfg) = config_path_of(&state.db, site_id).map_err(|e| e.to_string())?;
    crate::hexo::config_parser::read_raw(&cfg).map_err(|e| e.to_string())
}

/// 保存站点配置。
///
/// 若提供 `raw` 则按原始文本写入（保留注释）；否则按结构化 `config` 写入。
#[tauri::command]
pub fn save_site_config(
    state: State<'_, AppState>,
    site_id: i64,
    config: Option<Value>,
    raw: Option<String>,
) -> Result<(), String> {
    let db = &state.db;
    let (_, cfg) = config_path_of(db, site_id).map_err(|e| e.to_string())?;

    // 写入前先备份一次，便于误操作恢复
    if std::path::Path::new(&cfg).exists() {
        let backup = format!("{}.bak", cfg);
        let _ = std::fs::copy(&cfg, &backup);
    }

    if let Some(text) = raw {
        crate::hexo::config_parser::validate_yaml(&text).map_err(|e| e.to_string())?;
        crate::hexo::config_parser::write_raw(&cfg, &text).map_err(|e| e.to_string())?;
    } else if let Some(value) = config {
        crate::hexo::config_parser::write_yaml_file(&cfg, &value).map_err(|e| e.to_string())?;
    } else {
        return Err("必须提供 config 或 raw 其中之一".into());
    }

    // 同步站点表的关键字段
    if let Ok(value) = crate::hexo::config_parser::parse_yaml_file(&cfg) {
        let theme = value.get("theme").and_then(|v| v.as_str());
        let title = value.get("title").and_then(|v| v.as_str());
        let url = value.get("url").and_then(|v| v.as_str()).map(|u| {
            u.trim()
                .trim_start_matches("https://")
                .trim_start_matches("http://")
                .trim_end_matches('/')
                .to_string()
        });

        if let Ok(conn) = db.conn() {
            let _ = conn.execute(
                "UPDATE sites SET
                    theme = COALESCE(?2, theme),
                    name = COALESCE(?3, name),
                    domain = COALESCE(?4, domain),
                    updated_at = ?5
                 WHERE id = ?1",
                params![site_id, theme, title, url, crate::utils::now_utc()],
            );
        }
    }

    Ok(())
}

/// 校验配置合法性。
#[tauri::command]
pub fn validate_config(content: String, config_type: Option<String>) -> Result<(), String> {
    match config_type.as_deref() {
        Some("json") => serde_json::from_str::<Value>(&content)
            .map(|_| ())
            .map_err(|e| format!("JSON 格式错误：{}", e)),
        Some("toml") => Err("TOML 校验暂未内置，请在保存前自行确认格式".into()),
        // 默认按 YAML 校验
        _ => crate::hexo::config_parser::validate_yaml(&content).map_err(|e| e.to_string()),
    }
}

/// 获取配置差异（对比备份文件 `_config.yml.bak`）。
#[tauri::command]
pub fn diff_site_config(state: State<'_, AppState>, site_id: i64) -> Result<String, String> {
    let (_, cfg) = config_path_of(&state.db, site_id).map_err(|e| e.to_string())?;
    let backup = format!("{}.bak", cfg);

    if !std::path::Path::new(&backup).exists() {
        return Ok(String::new());
    }

    let old = std::fs::read_to_string(&backup).unwrap_or_default();
    let new = std::fs::read_to_string(&cfg).unwrap_or_default();

    // 简易逐行差异输出
    let mut diff = String::new();
    let old_lines: Vec<&str> = old.lines().collect();
    let new_lines: Vec<&str> = new.lines().collect();
    let max = old_lines.len().max(new_lines.len());

    for i in 0..max {
        let o = old_lines.get(i).copied().unwrap_or("");
        let n = new_lines.get(i).copied().unwrap_or("");
        if o != n {
            if !o.is_empty() {
                diff.push_str(&format!("- {}\n", o));
            }
            if !n.is_empty() {
                diff.push_str(&format!("+ {}\n", n));
            }
        }
    }

    Ok(diff)
}

/// 恢复配置备份。
#[tauri::command]
pub fn restore_site_config(state: State<'_, AppState>, site_id: i64) -> Result<(), String> {
    let (_, cfg) = config_path_of(&state.db, site_id).map_err(|e| e.to_string())?;
    let backup = format!("{}.bak", cfg);

    if !std::path::Path::new(&backup).exists() {
        return Err("没有可恢复的配置备份".into());
    }

    std::fs::copy(&backup, &cfg).map_err(|e| format!("恢复配置失败：{}", e))?;
    Ok(())
}

/// 导出配置为 JSON（供迁移备份）。
#[tauri::command]
pub fn export_config(state: State<'_, AppState>, site_id: i64) -> Result<String, String> {
    let (site_path, cfg) = config_path_of(&state.db, site_id).map_err(|e| e.to_string())?;

    let site_config = crate::hexo::config_parser::parse_yaml_file(&cfg).unwrap_or(Value::Null);
    let theme_name = site_config
        .get("theme")
        .and_then(|v| v.as_str())
        .unwrap_or("landscape")
        .to_string();

    let theme_cfg_path = format!(
        "{}/themes/{}/_config.yml",
        site_path.trim_end_matches('/'),
        theme_name
    );
    let theme_config =
        crate::hexo::config_parser::parse_yaml_file(&theme_cfg_path).unwrap_or(Value::Null);

    let payload = serde_json::json!({
        "exportedAt": crate::utils::now_utc(),
        "siteConfig": site_config,
        "themeName": theme_name,
        "themeConfig": theme_config,
    });

    serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())
}

/// 导入配置（从导出的 JSON 恢复）。
#[tauri::command]
pub fn import_config(
    state: State<'_, AppState>,
    site_id: i64,
    payload: String,
) -> Result<(), String> {
    let db = &state.db;
    let (site_path, cfg) = config_path_of(db, site_id).map_err(|e| e.to_string())?;

    let value: Value =
        serde_json::from_str(&payload).map_err(|e| format!("解析导入内容失败：{}", e))?;

    if let Some(site_config) = value.get("siteConfig").filter(|v| !v.is_null()) {
        crate::hexo::config_parser::write_yaml_file(&cfg, site_config)
            .map_err(|e| e.to_string())?;
    }

    if let (Some(theme_name), Some(theme_config)) = (
        value.get("themeName").and_then(|v| v.as_str()),
        value.get("themeConfig").filter(|v| !v.is_null()),
    ) {
        let theme_cfg = format!(
            "{}/themes/{}/_config.yml",
            site_path.trim_end_matches('/'),
            theme_name
        );
        let _ = crate::hexo::config_parser::write_yaml_file(&theme_cfg, theme_config);
    }

    Ok(())
}

/// 配置模板清单（预设常用配置片段）。
#[tauri::command]
pub fn get_config_templates() -> Vec<Value> {
    vec![
        serde_json::json!({
            "id": "basic",
            "name": "基础站点信息",
            "description": "标题、副标题、描述、关键词、作者",
            "config": {
                "title": "My Hexo Blog",
                "subtitle": "记录技术与生活",
                "description": "一个基于 Hexo 的静态博客",
                "keywords": "Hexo,博客,技术",
                "author": "Your Name",
                "language": "zh-CN",
                "timezone": "Asia/Shanghai"
            }
        }),
        serde_json::json!({
            "id": "url",
            "name": "URL 与永久链接",
            "description": "站点地址、永久链接格式",
            "config": {
                "url": "https://example.com",
                "root": "/",
                "permalink": ":year/:month/:day/:title/",
                "permalink_defaults": null,
                "pretty_urls": {
                    "trailing_index": true,
                    "trailing_html": true
                }
            }
        }),
        serde_json::json!({
            "id": "deploy_github",
            "name": "GitHub Pages 部署",
            "description": "通过 git 方式部署到 GitHub Pages",
            "config": {
                "deploy": {
                    "type": "git",
                    "repo": "https://github.com/username/username.github.io.git",
                    "branch": "main"
                }
            }
        }),
        serde_json::json!({
            "id": "writing",
            "name": "写作与渲染",
            "description": "新建文章目录、草稿、渲染引擎设置",
            "config": {
                "new_post_name": ":title.md",
                "default_layout": "post",
                "titlecase": false,
                "external_link": {
                    "enable": true,
                    "field": "site",
                    "exclude": ""
                },
                "filename_case": 0,
                "render_drafts": false,
                "post_asset_folder": true,
                "relative_link": false,
                "future": true,
                "syntax_highlighter": "highlight"
            }
        }),
        serde_json::json!({
            "id": "seo",
            "name": "SEO 优化",
            "description": "站点地图、RSS、永久链接优化",
            "config": {
                "permalink": ":category/:title.html",
                "feed": {
                    "type": "atom",
                    "path": "atom.xml",
                    "limit": 20
                },
                "sitemap": {
                    "path": "sitemap.xml"
                }
            }
        }),
    ]
}

// ==================== 插件管理 ====================

/// 获取站点的插件列表（从 package.json 依赖中读取）。
#[tauri::command]
pub fn get_plugins(state: State<'_, AppState>, site_id: i64) -> Result<Vec<Plugin>, String> {
    let db = &state.db;
    let site_path = site_path_of(db, site_id).map_err(|e| e.to_string())?;
    let pkg_path = std::path::Path::new(&site_path).join("package.json");

    let mut plugins = Vec::new();

    if let Ok(content) = std::fs::read_to_string(&pkg_path) {
        if let Ok(pkg) = serde_json::from_str::<Value>(&content) {
            for key in ["dependencies", "devDependencies"] {
                if let Some(deps) = pkg.get(key).and_then(|d| d.as_object()) {
                    for (name, version) in deps {
                        // 只把 hexo 相关包视为插件
                        if !name.starts_with("hexo") {
                            continue;
                        }
                        let is_active = name != "hexo"
                            && !name.starts_with("hexo-theme-")
                            && !name.starts_with("hexo-renderer-");

                        plugins.push(Plugin {
                            id: 0,
                            site_id,
                            name: name.clone(),
                            version: version.as_str().map(str::to_string),
                            is_active,
                            config: None,
                            created_at: None,
                        });
                    }
                }
            }
        }
    }

    plugins.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(plugins)
}

/// 安装插件（npm install）。
#[tauri::command]
pub async fn install_plugin(
    state: State<'_, AppState>,
    site_id: i64,
    name: String,
) -> Result<String, String> {
    let db = Db::from_arc(&state.db);
    let db = &db;
    let site_path = site_path_of(db, site_id).map_err(|e| e.to_string())?;
    let npm_bin = if cfg!(target_os = "windows") {
        "npm.cmd"
    } else {
        "npm"
    };

    let out = crate::utils::process::run(
        npm_bin,
        &["install", &name, "--save"],
        Some(std::path::Path::new(&site_path)),
        Some(900),
    )
    .await
    .map_err(|e| e.to_string())?;

    if !out.success {
        return Err(format!("安装插件失败：\n{}", out.combined()));
    }

    // 记录到插件表
    if let Ok(conn) = db.conn() {
        let _ = conn.execute(
            "INSERT INTO plugins (site_id, name, version, is_active) VALUES (?1, ?2, NULL, 1)",
            params![site_id, name],
        );
    }

    Ok(out.combined())
}

/// 卸载插件。
#[tauri::command]
pub async fn uninstall_plugin(
    state: State<'_, AppState>,
    site_id: i64,
    name: String,
) -> Result<String, String> {
    let db = Db::from_arc(&state.db);
    let db = &db;
    let site_path = site_path_of(db, site_id).map_err(|e| e.to_string())?;
    let npm_bin = if cfg!(target_os = "windows") {
        "npm.cmd"
    } else {
        "npm"
    };

    let out = crate::utils::process::run(
        npm_bin,
        &["uninstall", &name],
        Some(std::path::Path::new(&site_path)),
        Some(600),
    )
    .await
    .map_err(|e| e.to_string())?;

    if !out.success {
        return Err(format!("卸载插件失败：\n{}", out.combined()));
    }

    if let Ok(conn) = db.conn() {
        let _ = conn.execute(
            "DELETE FROM plugins WHERE site_id = ?1 AND name = ?2",
            params![site_id, name],
        );
    }

    Ok(out.combined())
}

/// 切换插件启用状态（写入站点 `_config.yml` 的 `plugins_disable` 列表）。
#[tauri::command]
pub fn toggle_plugin(
    state: State<'_, AppState>,
    site_id: i64,
    name: String,
    enabled: bool,
) -> Result<(), String> {
    let db = &state.db;
    let (_, cfg) = config_path_of(db, site_id).map_err(|e| e.to_string())?;

    let mut value = crate::hexo::config_parser::parse_yaml_file(&cfg).map_err(|e| e.to_string())?;
    if !value.is_object() {
        value = serde_json::json!({});
    }

    if let Some(obj) = value.as_object_mut() {
        // 维护 plugins_disable 列表
        let mut disabled: Vec<String> = obj
            .get("plugins_disable")
            .map(|v| match v {
                Value::Array(arr) => arr
                    .iter()
                    .filter_map(|s| s.as_str().map(str::to_string))
                    .collect(),
                Value::String(s) => vec![s.clone()],
                _ => Vec::new(),
            })
            .unwrap_or_default();

        if enabled {
            disabled.retain(|n| n != &name);
        } else if !disabled.contains(&name) {
            disabled.push(name.clone());
        }

        obj.insert(
            "plugins_disable".into(),
            Value::Array(disabled.into_iter().map(Value::String).collect()),
        );
    }

    crate::hexo::config_parser::write_yaml_file(&cfg, &value).map_err(|e| e.to_string())?;

    if let Ok(conn) = db.conn() {
        let _ = conn.execute(
            "UPDATE plugins SET is_active = ?3 WHERE site_id = ?1 AND name = ?2",
            params![site_id, name, enabled as i64],
        );
    }

    Ok(())
}
