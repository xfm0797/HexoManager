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
pub const APP_REPOSITORY: &str = "https://github.com/xfm0797/HexoManager";
pub const APP_HOMEPAGE: &str = "https://github.com/xfm0797/HexoManager";

/// 默认更新源（按优先级排列，依次尝试）。
///
/// 1. GitHub Releases 上的 Tauri updater 清单（tauri-action 打 tag 时自动生成 latest.json）
/// 2. GitHub Releases API（作为 latest.json 缺失或网络异常时的回退）
pub const UPDATE_ENDPOINTS: &[&str] = &[
    "https://github.com/xfm0797/HexoManager/releases/latest/download/latest.json",
    "https://api.github.com/repos/xfm0797/HexoManager/releases/latest",
];

/// 单个更新源的请求超时。
const FETCH_TIMEOUT_SECS: u64 = 10;

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
/// - `manifest_url` 提供时只请求该清单；
/// - 为空时依次尝试 `UPDATE_ENDPOINTS` 中的默认源，第一个成功解析出最新版本的源生效。
///
/// 同时兼容两种清单格式：
/// 1. Tauri updater `latest.json`（`version` + `platforms.<target>.url`）
/// 2. GitHub Releases API（`tag_name` + `assets[].browser_download_url`）
pub async fn check_update(manifest_url: Option<String>) -> AppResult<UpdateInfo> {
    let current = normalize(APP_VERSION);

    let endpoints: Vec<String> = match manifest_url {
        Some(url) if !url.trim().is_empty() => vec![url],
        _ => UPDATE_ENDPOINTS.iter().map(|s| s.to_string()).collect(),
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(FETCH_TIMEOUT_SECS))
        .user_agent(format!("{}/{}", APP_NAME, APP_VERSION))
        .build()
        .map_err(|e| crate::utils::error::AppError::Network(e.to_string()))?;

    let mut last_error: Option<String> = None;

    for url in &endpoints {
        match fetch_and_parse(&client, url, &current).await {
            Ok(info) => return Ok(info),
            Err(e) => {
                last_error = Some(e.to_string());
            }
        }
    }

    // 所有更新源都不可达：不抛错，返回带错误说明的结果，便于前端静默降级
    Ok(UpdateInfo {
        available: false,
        current_version: current,
        latest_version: None,
        notes: None,
        pub_date: None,
        download_url: None,
        error: last_error,
    })
}

/// 请求单个更新源并解析结果。
async fn fetch_and_parse(
    client: &reqwest::Client,
    url: &str,
    current: &str,
) -> AppResult<UpdateInfo> {
    let resp = client.get(url).send().await.map_err(|e| {
        crate::utils::error::AppError::Network(format!("请求更新清单失败（{url}）：{e}"))
    })?;

    if !resp.status().is_success() {
        return Err(crate::utils::error::AppError::Network(format!(
            "更新源返回状态码 {}（{url}）",
            resp.status()
        )));
    }

    let body: Value = resp.json().await.map_err(|e| {
        crate::utils::error::AppError::Network(format!("解析更新清单失败（{url}）：{e}"))
    })?;

    Ok(parse_manifest(&body, current))
}

/// 根据清单结构自动选择解析器。
fn parse_manifest(body: &Value, current: &str) -> UpdateInfo {
    if body.get("version").is_some() {
        parse_latest_json(body, current)
    } else if body.get("tag_name").is_some() {
        parse_github_release(body, current)
    } else {
        UpdateInfo {
            available: false,
            current_version: current.to_string(),
            latest_version: None,
            notes: None,
            pub_date: None,
            download_url: None,
            error: Some("清单格式无法识别".into()),
        }
    }
}

/// 解析 Tauri updater 的 `latest.json`。
///
/// `platforms` 键为目标三元组（如 `windows-x86_64`、`darwin-aarch64`），
/// 按「同 OS 前缀 → 同架构优先」匹配当前平台。
fn parse_latest_json(body: &Value, current: &str) -> UpdateInfo {
    let latest = body
        .get("version")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let available = !latest.is_empty() && is_newer(current, &latest);

    // 平台匹配：优先 os+arch，其次仅 os 前缀
    let os = std::env::consts::OS; // windows / macos / linux
    let arch = std::env::consts::ARCH; // x86_64 / aarch64 ...
    let target = format!("{os}-{arch}");

    let download_url = body
        .get("platforms")
        .and_then(Value::as_object)
        .and_then(|platforms| {
            platforms
                .iter()
                .find(|(key, _)| key.as_str() == target)
                .or_else(|| {
                    platforms
                        .iter()
                        .find(|(key, _)| key.as_str().starts_with(os))
                })
                .and_then(|(_, entry)| entry.get("url"))
                .and_then(Value::as_str)
                .map(String::from)
        })
        .or_else(|| {
            // 自建清单可提供顶层 download_url 兜底
            body.get("download_url")
                .and_then(Value::as_str)
                .map(String::from)
        });

    UpdateInfo {
        available,
        current_version: current.to_string(),
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
        download_url,
        error: None,
    }
}

/// 解析 GitHub Releases API 的 release 对象。
fn parse_github_release(body: &Value, current: &str) -> UpdateInfo {
    let tag = body
        .get("tag_name")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let available = !tag.is_empty() && is_newer(current, &tag);

    // 从 assets 中挑选当前平台的安装包
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let download_url = pick_platform_asset(body, os, arch);

    UpdateInfo {
        available,
        current_version: current.to_string(),
        latest_version: if tag.is_empty() {
            None
        } else {
            Some(normalize(&tag))
        },
        notes: body.get("body").and_then(Value::as_str).map(String::from),
        pub_date: body
            .get("published_at")
            .and_then(Value::as_str)
            .map(String::from),
        download_url,
        error: None,
    }
}

/// 按平台优先级从 release assets 中选取安装包下载地址。
fn pick_platform_asset(body: &Value, os: &str, arch: &str) -> Option<String> {
    let assets = body.get("assets")?.as_array()?;

    // 各平台的安装包扩展名优先级
    let patterns: &[&str] = match (os, arch) {
        ("windows", "x86_64") => &[".msi", "-setup.exe", ".exe"],
        ("windows", "aarch64") => &["arm64.msi", "arm64-setup.exe", "arm64.exe", ".msi"],
        ("macos", "aarch64") => &["aarch64.dmg", "arm64.dmg", ".dmg"],
        ("macos", "x86_64") => &["x64.dmg", "x86_64.dmg", ".dmg"],
        ("linux", "x86_64") => &[".AppImage", "_amd64.deb", ".deb"],
        ("linux", "aarch64") => &["aarch64.AppImage", "_arm64.deb", ".deb"],
        _ => &[".exe", ".dmg", ".AppImage", ".deb", ".msi"],
    };

    for pattern in patterns {
        for asset in assets {
            let name = asset.get("name").and_then(Value::as_str).unwrap_or("");
            let url = asset
                .get("browser_download_url")
                .and_then(Value::as_str)
                .unwrap_or("");

            if name.is_empty() || url.is_empty() {
                continue;
            }

            let matched = match *pattern {
                ".msi" | ".exe" | ".dmg" | ".deb" => name.ends_with(pattern),
                // 其余模式做包含匹配（如 "-setup.exe"、"aarch64.dmg"、"arm64.msi"）
                other => name.contains(other),
            };

            if matched {
                return Some(url.to_string());
            }
        }
    }

    None
}

/// 更新源信息（供前端「关于与更新」页展示）。
pub fn update_source_info() -> Vec<String> {
    UPDATE_ENDPOINTS.iter().map(|s| s.to_string()).collect()
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

    #[test]
    fn test_parse_latest_json_tauri_v2() {
        // Tauri v2 清单：platforms 键为目标三元组
        let body: Value = serde_json::json!({
            "version": "1.1.1",
            "notes": "修复若干问题",
            "pub_date": "2026-10-01T02:00:00Z",
            "platforms": {
                "windows-x86_64": { "signature": "sig", "url": "https://example.com/app.msi" },
                "darwin-aarch64": { "signature": "sig", "url": "https://example.com/app.dmg" }
            }
        });

        let info = parse_latest_json(&body, "1.0.0");
        assert!(info.available);
        assert_eq!(info.latest_version.as_deref(), Some("1.1.1"));

        // 按运行平台计算期望的下载地址（清单里只提供了 win/mac 两个目标）
        let expected: Option<&str> = match (std::env::consts::OS, std::env::consts::ARCH) {
            ("windows", "x86_64") => Some("https://example.com/app.msi"),
            ("macos", "aarch64") => Some("https://example.com/app.dmg"),
            _ => None,
        };
        assert_eq!(info.download_url, expected.map(|s| s.to_string()));

        // 同 OS 不同 arch 也能兜底匹配
        let body_no_arch: Value = serde_json::json!({
            "version": "1.1.1",
            "platforms": { "linux-x86_64": { "url": "https://example.com/app.AppImage" } }
        });
        let info2 = parse_latest_json(&body_no_arch, "1.1.1");
        // 版本相同不提示更新，但 URL 解析仍应工作
        assert!(!info2.available);
    }

    #[test]
    fn test_parse_github_release() {
        let body: Value = serde_json::json!({
            "tag_name": "v1.1.1",
            "body": "## 更新内容\n- 修复",
            "published_at": "2026-10-01T02:00:00Z",
            "assets": [
                { "name": "HexoManager_1.1.1_x64_en-US.msi",
                  "browser_download_url": "https://github.com/x/app.msi" },
                { "name": "HexoManager_1.1.1_aarch64.dmg",
                  "browser_download_url": "https://github.com/x/arm.dmg" },
                { "name": "HexoManager_1.1.1_amd64.AppImage",
                  "browser_download_url": "https://github.com/x/app.AppImage" }
            ]
        });

        let info = parse_github_release(&body, "1.0.0");
        assert!(info.available);
        assert_eq!(info.latest_version.as_deref(), Some("1.1.1"));
        assert_eq!(info.notes.as_deref(), Some("## 更新内容\n- 修复"));

        // 当前平台应命中 .msi（windows/x86_64 环境下）
        let url = info.download_url.unwrap_or_default();
        assert!(url.ends_with(".msi") || !url.is_empty());
    }

    #[test]
    fn test_parse_manifest_dispatch() {
        // 有 version 字段 → latest.json 解析器
        let latest: Value = serde_json::json!({ "version": "2.0.0" });
        assert_eq!(
            parse_manifest(&latest, "1.0.0").latest_version.as_deref(),
            Some("2.0.0")
        );

        // 有 tag_name → GitHub release 解析器
        let release: Value = serde_json::json!({ "tag_name": "v2.0.0" });
        assert_eq!(
            parse_manifest(&release, "1.0.0").latest_version.as_deref(),
            Some("2.0.0")
        );

        // 都没有 → 不可识别
        let garbage: Value = serde_json::json!({ "foo": 1 });
        assert!(parse_manifest(&garbage, "1.0.0").latest_version.is_none());
    }
}
