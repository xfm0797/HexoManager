//! Hexo 环境检测与站点初始化。

use crate::models::EnvCheck;
use crate::utils::error::{AppError, AppResult};
use crate::utils::process;
use std::path::Path;

/// 检测 Node / npm / Git / Hexo 是否就绪，以及目标目录是否为合法 Hexo 站点。
pub async fn check_env(path: &str) -> AppResult<EnvCheck> {
    let mut issues: Vec<String> = Vec::new();

    // ---- Node ----
    let node_out = process::run("node", &["--version"], None, Some(30))
        .await
        .ok();
    let node_installed = node_out.as_ref().map(|o| o.success).unwrap_or(false);
    let node_version = node_out
        .filter(|o| o.success)
        .map(|o| o.stdout.trim().trim_start_matches('v').to_string());
    if !node_installed {
        issues.push("未检测到 Node.js，请先安装 Node.js 18 或更高版本".into());
    }

    // ---- npm ----
    let npm_bin = if cfg!(target_os = "windows") {
        "npm.cmd"
    } else {
        "npm"
    };
    let npm_out = process::run(npm_bin, &["--version"], None, Some(30))
        .await
        .ok();
    let npm_installed = npm_out.as_ref().map(|o| o.success).unwrap_or(false);
    let npm_version = npm_out
        .filter(|o| o.success)
        .map(|o| o.stdout.trim().to_string());
    if !npm_installed {
        issues.push("未检测到 npm，请检查 Node.js 安装是否完整".into());
    }

    // ---- Git ----
    let git_out = process::run("git", &["--version"], None, Some(30))
        .await
        .ok();
    let git_installed = git_out.as_ref().map(|o| o.success).unwrap_or(false);
    let git_version = git_out
        .filter(|o| o.success)
        .map(|o| o.stdout.trim().replace("git version ", ""));
    if !git_installed {
        issues.push("未检测到 Git，部署功能将不可用".into());
    }

    // ---- 站点目录特征 ----
    let site_dir = Path::new(path);
    let is_hexo_site = site_dir.join("_config.yml").exists()
        && (site_dir.join("source").is_dir() || site_dir.join("themes").is_dir());
    let has_node_modules = site_dir.join("node_modules").is_dir();

    if !site_dir.exists() {
        issues.push(format!("目录不存在：{}", path));
    } else if !is_hexo_site {
        issues.push("目标目录不是有效的 Hexo 站点（缺少 _config.yml 或 source 目录）".into());
    }
    if is_hexo_site && !has_node_modules {
        issues.push("站点尚未安装依赖，请先执行 npm install".into());
    }

    // ---- Hexo ----
    let mut hexo_installed = false;
    let mut hexo_version = None;
    if is_hexo_site {
        if let Ok(Some(v)) = crate::hexo::builder::hexo_version(path).await {
            hexo_installed = true;
            hexo_version = Some(v);
        }
    }

    let ready = node_installed && npm_installed && is_hexo_site;

    Ok(EnvCheck {
        node_installed,
        node_version,
        npm_installed,
        npm_version,
        git_installed,
        git_version,
        hexo_installed,
        hexo_version,
        is_hexo_site,
        has_node_modules,
        issues,
        ready,
    })
}

/// 在指定目录初始化一个全新 Hexo 站点。
///
/// 优先使用本地 `hexo` 脚手架（`npx hexo init`），若目录非空则先校验。
pub async fn init_site(path: &str, name: Option<&str>) -> AppResult<String> {
    let target = Path::new(path);

    if target.exists() {
        let mut entries = std::fs::read_dir(target)?;
        if entries.next().is_some() {
            return Err(AppError::InvalidArgument(format!(
                "目标目录非空，无法初始化站点：{}",
                path
            )));
        }
    } else {
        std::fs::create_dir_all(target)?;
    }

    let npx_bin = if cfg!(target_os = "windows") {
        "npx.cmd"
    } else {
        "npx"
    };

    // `hexo init` 会脚手架 + 自动 npm install
    let out = process::run(npx_bin, &["hexo", "init", "."], Some(target), Some(900)).await?;

    if !out.success {
        // 回退：下载 hexo-starter 模板
        let fallback = process::run(
            "git",
            &["clone", "https://github.com/hexojs/hexo-starter.git", "."],
            Some(target),
            Some(600),
        )
        .await?;
        if !fallback.success {
            return Err(AppError::Process(format!(
                "Hexo 初始化失败：\n{}\n---回退方案---\n{}",
                out.combined(),
                fallback.combined()
            )));
        }
        // 安装依赖
        let npm_bin = if cfg!(target_os = "windows") {
            "npm.cmd"
        } else {
            "npm"
        };
        let install = process::run(npm_bin, &["install"], Some(target), Some(900)).await?;
        if !install.success {
            return Err(AppError::Process(format!(
                "依赖安装失败：\n{}",
                install.combined()
            )));
        }
    }

    // 若提供了站点名，写入 _config.yml 的 title 字段
    if let Some(site_name) = name {
        let cfg_path = target.join("_config.yml");
        if cfg_path.exists() {
            if let Ok(value) =
                crate::hexo::config_parser::parse_yaml_file(&cfg_path.display().to_string())
            {
                if let Some(obj) = value.as_object() {
                    let mut obj = obj.clone();
                    obj.insert(
                        "title".into(),
                        serde_json::Value::String(site_name.to_string()),
                    );
                    let _ = crate::hexo::config_parser::write_yaml_file(
                        &cfg_path.display().to_string(),
                        &serde_json::Value::Object(obj),
                    );
                }
            }
        }
    }

    Ok(out.combined())
}

/// 安装 Hexo CLI（全局）。
pub async fn install_hexo(path: Option<&str>) -> AppResult<String> {
    let npm_bin = if cfg!(target_os = "windows") {
        "npm.cmd"
    } else {
        "npm"
    };
    let cwd = path.map(Path::new);
    let out = process::run(npm_bin, &["install", "-g", "hexo-cli"], cwd, Some(600)).await?;
    if !out.success {
        return Err(AppError::Process(out.combined()));
    }
    Ok(out.combined())
}
