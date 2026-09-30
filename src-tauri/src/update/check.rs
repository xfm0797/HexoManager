//! 更新检查：版本比对、变更日志解析、应用信息。

use crate::models::{AppInfo, Changelog, TechItem, UpdateInfo};
use crate::utils::error::AppResult;
use serde_json::Value;

/// 当前应用版本（与 `tauri.conf.json` / `Cargo.toml` 保持同步）。
pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const APP_NAME: &str = "HexoManager";
pub const APP_DESCRIPTION: &str = "桌面端 Hexo 多站点管理工具";
pub const APP_AUTHOR: &str = "XFM";
pub const APP_LICENSE: &str = "MIT";
pub const APP_REPOSITORY: &str = "https://github.com/xfm/hexo-manager";
pub const APP_HOMEPAGE: &str = "https://github.com/xfm/hexo-manager";

/// 读取本地 `version.json`（仅开发期存在）。
pub fn read_local_version(project_root: Option<&str>) -> AppResult<Value> {
    let candidates = [
        project_root.map(|p| format!("{}/version.json", p)),
        Some("version.json".to_string()),
        Some("../version.json".to_string()),
    ];

    for path in candidates.into_iter().flatten() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(v) = serde_json::from_str::<Value>(&content) {
                return Ok(v);
            }
        }
    }

    Ok(serde_json::json!({
        "version": APP_VERSION,
        "source": "cargo",
    }))
}

/// 规范化版本号以便比较（去掉前缀 v）。
fn normalize(v: &str) -> String {
    v.trim()
        .trim_start_matches('v')
        .trim_start_matches('V')
        .to_string()
}

/// 解析语义化版本为可比较元组。
fn parse_semver(v: &str) -> (u64, u64, u64, String) {
    let s = normalize(v);
    // 分离预发布标签
    let (core, pre) = match s.split_once('-') {
        Some((c, p)) => (c.to_string(), p.to_string()),
        None => (s.clone(), String::new()),
    };
    let core = core.split('+').next().unwrap_or(&core).to_string();

    let mut nums = core.split('.').map(|p| p.parse::<u64>().unwrap_or(0));
    (
        nums.next().unwrap_or(0),
        nums.next().unwrap_or(0),
        nums.next().unwrap_or(0),
        pre,
    )
}

/// 判断 target 是否比 current 更新。
///
/// 规则：正式版高于同版本号的预发布版（`1.0.0` > `1.0.0-rc.1`）。
pub fn is_newer(current: &str, target: &str) -> bool {
    let (c_major, c_minor, c_patch, c_pre) = parse_semver(current);
    let (t_major, t_minor, t_patch, t_pre) = parse_semver(target);

    let c_core = (c_major, c_minor, c_patch);
    let t_core = (t_major, t_minor, t_patch);

    if t_core != c_core {
        return t_core > c_core;
    }

    // 核心版本相同：正式版 > 预发布版
    match (c_pre.is_empty(), t_pre.is_empty()) {
        (false, true) => true,  // rc → 正式
        (true, false) => false, // 正式 → rc
        _ => t_pre > c_pre,     // 同类型预发布按字典序
    }
}

/// 内置变更日志（与 CHANGELOG.md 保持同步的摘要）。
fn builtin_changelog() -> Vec<Changelog> {
    vec![
        Changelog {
            version: "1.0.0".into(),
            date: "2026-09-30".into(),
            changes: vec![
                "新增：站点管理（新建向导 / 导入 / 列表 / 详情 / 复制 / 备份）".into(),
                "新增：文章管理（Monaco 编辑 / 实时预览 / 草稿 / 分类标签）".into(),
                "新增：配置管理（可视化表单 + 原始 YAML 双向编辑）".into(),
                "新增：主题管理（安装 / 切换 / 配置 / 搜索）".into(),
                "新增：部署管理（Git 状态 / 一键部署 / 部署历史 / 回滚）".into(),
                "新增：7 大 Pages 平台 CI/CD 配置生成与边缘层智能回源脚本".into(),
                "新增：本地预览（内置 Hexo server 启停与多端口并行）".into(),
                "新增：关于与更新（检查更新 / 自动更新开关 / 技术栈展示）".into(),
            ],
        },
        Changelog {
            version: "0.1.0".into(),
            date: "2026-09-10".into(),
            changes: vec![
                "初始化项目结构".into(),
                "搭建 Tauri 2 + React 18 基础框架".into(),
                "完成 SQLite 数据库设计与迁移".into(),
            ],
        },
    ]
}

/// 获取变更日志。
pub fn get_changelog(project_root: Option<&str>) -> Vec<Changelog> {
    // 优先解析 CHANGELOG.md
    if let Some(root) = project_root {
        let path = format!("{}/CHANGELOG.md", root);
        if let Ok(content) = std::fs::read_to_string(path) {
            let parsed = parse_changelog_md(&content);
            if !parsed.is_empty() {
                return parsed;
            }
        }
    }
    builtin_changelog()
}

/// 解析 CHANGELOG.md 为结构化数据。
fn parse_changelog_md(content: &str) -> Vec<Changelog> {
    let mut result: Vec<Changelog> = Vec::new();
    let mut current: Option<Changelog> = None;

    for line in content.lines() {
        let trimmed = line.trim();

        // 版本标题：## [1.0.0] - 2026-09-30
        if let Some(rest) = trimmed.strip_prefix("## ") {
            if let Some(c) = current.take() {
                result.push(c);
            }
            let cleaned = rest.trim_start_matches('[');
            let (version, date) = match cleaned.split_once(']') {
                Some((v, tail)) => {
                    let d = tail.trim().trim_start_matches('-').trim().to_string();
                    (v.trim().to_string(), d)
                }
                None => (cleaned.trim().to_string(), String::new()),
            };
            if version.eq_ignore_ascii_case("unreleased") {
                current = None;
                continue;
            }
            current = Some(Changelog {
                version,
                date,
                changes: Vec::new(),
            });
            continue;
        }

        // 变更条目：- xxx  /  * xxx
        if let Some(entry) = current.as_mut() {
            let is_bullet = trimmed.starts_with("- ") || trimmed.starts_with("* ");
            if is_bullet {
                let text = trimmed[2..].trim();
                if !text.is_empty() {
                    entry.changes.push(text.to_string());
                }
            }
        }
    }

    if let Some(c) = current.take() {
        result.push(c);
    }

    result
}

/// 检查更新。
///
/// 若提供了 manifest URL 则通过 HTTP 拉取比对；否则回退为「当前已是最新」。
pub async fn check_update(manifest_url: Option<String>) -> AppResult<UpdateInfo> {
    let current = normalize(APP_VERSION);

    let Some(url) = manifest_url else {
        return Ok(UpdateInfo {
            available: false,
            current_version: current,
            latest_version: None,
            notes: None,
            pub_date: None,
            download_url: None,
            error: None,
        });
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .user_agent(format!("{}/{}", APP_NAME, APP_VERSION))
        .build()
        .map_err(|e| crate::utils::error::AppError::Network(e.to_string()))?;

    let resp =
        client.get(&url).send().await.map_err(|e| {
            crate::utils::error::AppError::Network(format!("请求更新清单失败：{}", e))
        })?;

    if !resp.status().is_success() {
        return Ok(UpdateInfo {
            available: false,
            current_version: current,
            latest_version: None,
            notes: None,
            pub_date: None,
            download_url: None,
            error: Some(format!("更新服务返回状态码 {}", resp.status())),
        });
    }

    let body: Value = resp
        .json()
        .await
        .map_err(|e| crate::utils::error::AppError::Network(format!("解析更新清单失败：{}", e)))?;

    let latest = body
        .get("version")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let available = !latest.is_empty() && is_newer(&current, &latest);

    Ok(UpdateInfo {
        available,
        current_version: current,
        latest_version: if latest.is_empty() {
            None
        } else {
            Some(normalize(&latest))
        },
        notes: body.get("notes").and_then(Value::as_str).map(String::from),
        pub_date: body
            .get("pub_date")
            .and_then(Value::as_str)
            .map(String::from),
        download_url: body
            .get("platforms")
            .and_then(|p| p.get(std::env::consts::OS))
            .and_then(|os| os.get("url"))
            .and_then(Value::as_str)
            .map(String::from)
            .or_else(|| {
                body.get("download_url")
                    .and_then(Value::as_str)
                    .map(String::from)
            }),
        error: None,
    })
}

/// 技术栈清单，用于「关于」页面展示。
fn tech_stack() -> Vec<TechItem> {
    vec![
        TechItem {
            name: "Tauri".into(),
            version: "2.x".into(),
            layer: "桌面框架".into(),
            url: "https://v2.tauri.app/".into(),
        },
        TechItem {
            name: "React".into(),
            version: "18.3".into(),
            layer: "前端框架".into(),
            url: "https://react.dev/".into(),
        },
        TechItem {
            name: "TypeScript".into(),
            version: "5.7".into(),
            layer: "开发语言".into(),
            url: "https://www.typescriptlang.org/".into(),
        },
        TechItem {
            name: "Vite".into(),
            version: "5.4".into(),
            layer: "构建工具".into(),
            url: "https://vitejs.dev/".into(),
        },
        TechItem {
            name: "Ant Design".into(),
            version: "5.29".into(),
            layer: "UI 组件库".into(),
            url: "https://ant.design/".into(),
        },
        TechItem {
            name: "Tailwind CSS".into(),
            version: "3.4".into(),
            layer: "样式方案".into(),
            url: "https://tailwindcss.com/".into(),
        },
        TechItem {
            name: "Zustand".into(),
            version: "4.5".into(),
            layer: "状态管理".into(),
            url: "https://zustand-demo.pmnd.rs/".into(),
        },
        TechItem {
            name: "Monaco Editor".into(),
            version: "0.57".into(),
            layer: "代码编辑器".into(),
            url: "https://microsoft.github.io/monaco-editor/".into(),
        },
        TechItem {
            name: "React Router".into(),
            version: "6.30".into(),
            layer: "前端路由".into(),
            url: "https://reactrouter.com/".into(),
        },
        TechItem {
            name: "Rust".into(),
            version: "1.77+".into(),
            layer: "后端语言".into(),
            url: "https://www.rust-lang.org/".into(),
        },
        TechItem {
            name: "SQLite".into(),
            version: "3.x".into(),
            layer: "本地数据库".into(),
            url: "https://www.sqlite.org/".into(),
        },
        TechItem {
            name: "Handlebars".into(),
            version: "6.x".into(),
            layer: "模板引擎".into(),
            url: "https://handlebarsjs.com/".into(),
        },
    ]
}

/// 获取应用信息。
pub fn get_app_info() -> AppInfo {
    AppInfo {
        name: APP_NAME.into(),
        version: APP_VERSION.into(),
        description: APP_DESCRIPTION.into(),
        author: APP_AUTHOR.into(),
        license: APP_LICENSE.into(),
        repository: APP_REPOSITORY.into(),
        homepage: APP_HOMEPAGE.into(),
        tauri_version: "2.x".into(),
        build_date: "2026-09-30".into(),
        tech_stack: tech_stack(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_newer() {
        assert!(is_newer("1.0.0", "1.0.1"));
        assert!(is_newer("1.0.0", "1.1.0"));
        assert!(is_newer("1.0.0", "2.0.0"));
        assert!(!is_newer("1.0.1", "1.0.0"));
        assert!(!is_newer("1.0.0", "1.0.0"));
        // 预发布 → 正式
        assert!(is_newer("1.0.0-rc.1", "1.0.0"));
        assert!(!is_newer("1.0.0", "1.0.0-rc.1"));
        // 带 v 前缀
        assert!(is_newer("v1.0.0", "v1.0.1"));
    }

    #[test]
    fn test_parse_changelog() {
        let md = "# Changelog\n\n## [Unreleased]\n\n- 未发布\n\n## [1.0.0] - 2026-09-30\n\n- 新增 A\n- 新增 B\n";
        let parsed = parse_changelog_md(md);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].version, "1.0.0");
        assert_eq!(parsed[0].changes.len(), 2);
    }
}
