//! Hexo 构建、生成、清理与部署（本地 `hexo deploy`）。

use crate::models::BuildResult;
use crate::utils::error::{AppError, AppResult};
use crate::utils::process;
use std::path::Path;

/// 解析 `npx` 可执行文件名（Windows 下为 `npx.cmd`）。
fn npx_bin() -> &'static str {
    if cfg!(target_os = "windows") {
        "npx.cmd"
    } else {
        "npx"
    }
}

/// 依次尝试 `npx hexo <args>`；若失败则回退到全局 `hexo <args>`。
async fn run_hexo(
    cwd: &Path,
    args: &[&str],
    timeout_secs: u64,
) -> AppResult<process::ProcessOutput> {
    let mut full_args = vec!["hexo"];
    full_args.extend_from_slice(args);

    let npx_out = process::run(npx_bin(), &full_args, Some(cwd), Some(timeout_secs)).await;

    match npx_out {
        Ok(out) if out.success => Ok(out),
        Ok(out) => {
            // npx 执行但失败，尝试全局 hexo
            let global = process::run("hexo", args, Some(cwd), Some(timeout_secs)).await;
            match global {
                Ok(g) if g.success => Ok(g),
                Ok(_) | Err(_) => Ok(out),
            }
        }
        Err(_) => process::run("hexo", args, Some(cwd), Some(timeout_secs)).await,
    }
}

/// 构建结果转换。
fn to_build_result(out: process::ProcessOutput) -> BuildResult {
    let combined = out.combined();
    // 尝试从输出中解析生成的文件数（Hexo 输出形如 "INFO  Generated: 42 files in 1.2s"）
    let files_generated = combined.lines().find_map(|line| {
        if line.contains("Generated") {
            line.split_whitespace()
                .filter_map(|tok| tok.parse::<usize>().ok())
                .next()
        } else {
            None
        }
    });

    BuildResult {
        success: out.success,
        duration_ms: out.duration_ms,
        error: if out.success {
            None
        } else {
            Some(combined.clone())
        },
        output: combined,
        files_generated,
    }
}

/// `hexo generate` — 生成静态文件。
pub async fn generate(site_path: &str) -> AppResult<BuildResult> {
    let cwd = Path::new(site_path);
    let out = run_hexo(cwd, &["generate"], 600).await?;
    Ok(to_build_result(out))
}

/// `hexo clean` — 清理缓存与已生成的静态文件。
pub async fn clean(site_path: &str) -> AppResult<BuildResult> {
    let cwd = Path::new(site_path);
    let out = run_hexo(cwd, &["clean"], 180).await?;
    Ok(to_build_result(out))
}

/// 完整构建：先 clean 再 generate。
pub async fn build(site_path: &str) -> AppResult<BuildResult> {
    let cwd = Path::new(site_path);
    let clean_out = run_hexo(cwd, &["clean"], 180).await;
    if let Ok(o) = clean_out {
        if !o.success {
            return Ok(to_build_result(o));
        }
    }
    let out = run_hexo(cwd, &["generate"], 600).await?;
    Ok(to_build_result(out))
}

/// `hexo deploy` — 使用 `_config.yml` 中配置的 deploy 方式发布。
pub async fn deploy_local(site_path: &str) -> AppResult<BuildResult> {
    let cwd = Path::new(site_path);
    // 先确保已生成
    let out = run_hexo(cwd, &["deploy", "--generate"], 900).await?;
    Ok(to_build_result(out))
}

/// 获取站点本地 Hexo 版本号。
pub async fn hexo_version(site_path: &str) -> AppResult<Option<String>> {
    let cwd = Path::new(site_path);
    let out = run_hexo(cwd, &["version"], 60).await?;
    if !out.success {
        return Ok(None);
    }
    let version = out.stdout.lines().chain(out.stderr.lines()).find_map(|l| {
        let t = l.trim();
        if t.starts_with("hexo:") {
            Some(t.trim_start_matches("hexo:").trim().to_string())
        } else {
            None
        }
    });
    Ok(version)
}

/// 新建文章：`hexo new <layout> <title>`。
pub async fn new_post(site_path: &str, layout: &str, title: &str) -> AppResult<String> {
    let cwd = Path::new(site_path);
    let out = run_hexo(cwd, &["new", layout, title], 120).await?;
    if !out.success {
        return Err(AppError::Process(out.combined()));
    }
    Ok(out.combined())
}

/// 发布草稿：`hexo publish <title>`。
pub async fn publish_post(site_path: &str, title: &str) -> AppResult<String> {
    let cwd = Path::new(site_path);
    let out = run_hexo(cwd, &["publish", title], 120).await?;
    if !out.success {
        return Err(AppError::Process(out.combined()));
    }
    Ok(out.combined())
}
