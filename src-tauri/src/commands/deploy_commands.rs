//! 部署配置命令（对应大纲 7.5）。

use crate::db::Db;
use crate::models::{
    DeployConfig, DeployLog, DeployTemplate, EnvVar, GenerateConfigInput, GeneratedFile,
};
use crate::utils::blocking;
use crate::err;
use crate::utils::error::{AppError, AppResult};
use crate::AppState;
use rusqlite::params;
use serde_json::Value;
use tauri::State;

/// 生成部署配置（可选写盘）。
///
/// 会渲染全部模板并写文件，放到阻塞线程池。
#[tauri::command]
pub async fn generate_deploy_config(
    input: GenerateConfigInput,
) -> AppResult<Vec<GeneratedFile>> {
    blocking::run(move || {
        validate_input(&input)?;
        crate::deploy::config_generator::generate_all(&input)
    })
    .await
}

/// 预览部署配置（不写盘）。
#[tauri::command]
pub async fn preview_deploy_config(
    input: GenerateConfigInput,
) -> AppResult<Vec<GeneratedFile>> {
    blocking::run(move || {
        crate::deploy::config_generator::preview_all(&input)
    })
    .await
}

/// 生成指定 Pages 平台的配置。
#[tauri::command]
pub async fn generate_pages_config(
    input: GenerateConfigInput,
    platform: String,
) -> AppResult<Vec<GeneratedFile>> {
    blocking::run(move || {
        crate::deploy::pages_generator::generate_for_platform(&input, &platform)
            
    })
    .await
}

/// 获取可用的部署模板清单。
#[tauri::command]
pub fn get_deploy_templates() -> Vec<DeployTemplate> {
    crate::deploy::config_generator::list_templates()
}

/// 保存部署配置到数据库。
#[tauri::command]
pub fn save_deploy_config(
    state: State<'_, AppState>,
    site_id: i64,
    config: Value,
) -> AppResult<()> {
    let db = &state.db;
    let conn = db.conn()?;

    let repo_platform = config
        .get("repoPlatform")
        .and_then(Value::as_str)
        .unwrap_or("github");
    let ci_platforms = config
        .get("ciPlatforms")
        .cloned()
        .unwrap_or_else(|| serde_json::json!(["github"]));
    let node_version = config
        .get("nodeVersion")
        .and_then(Value::as_str)
        .unwrap_or("20");
    let build_command = config
        .get("buildCommand")
        .and_then(Value::as_str)
        .unwrap_or("npm install && npx hexo generate");
    let branch = config.get("branch").and_then(Value::as_str).unwrap_or("main");
    let output_dir = config
        .get("outputDir")
        .and_then(Value::as_str)
        .unwrap_or("public");
    let deploy_targets = config
        .get("deployTargets")
        .cloned()
        .unwrap_or_else(|| serde_json::json!([]));
    let env_vars = config
        .get("envVars")
        .cloned()
        .unwrap_or_else(|| serde_json::json!([]));
    let edge_provider = config.get("edgeProvider").and_then(Value::as_str);
    let edge_domain = config.get("edgeDomain").and_then(Value::as_str);
    let origin_strategy = config
        .get("originStrategy")
        .and_then(Value::as_str)
        .unwrap_or("smart_routing");

    conn.execute(
        "INSERT INTO deploy_configs (site_id, repo_platform, ci_platforms, node_version,
            build_command, deploy_targets, env_vars, edge_provider, edge_domain, origin_strategy,
            branch, output_dir)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
         ON CONFLICT(site_id) DO UPDATE SET
            repo_platform = excluded.repo_platform,
            ci_platforms = excluded.ci_platforms,
            node_version = excluded.node_version,
            build_command = excluded.build_command,
            deploy_targets = excluded.deploy_targets,
            env_vars = excluded.env_vars,
            edge_provider = excluded.edge_provider,
            edge_domain = excluded.edge_domain,
            origin_strategy = excluded.origin_strategy,
            branch = excluded.branch,
            output_dir = excluded.output_dir",
        params![
            site_id,
            repo_platform,
            ci_platforms.to_string(),
            node_version,
            build_command,
            deploy_targets.to_string(),
            env_vars.to_string(),
            edge_provider,
            edge_domain,
            origin_strategy,
            branch,
            output_dir
        ],
    )?;

    Ok(())
}

/// 读取部署配置。
#[tauri::command]
pub fn get_deploy_config(state: State<'_, AppState>, site_id: i64) -> AppResult<DeployConfig> {
    let conn = state.db.conn()?;

    let result = conn
        .query_row(
            "SELECT site_id, repo_platform, ci_platforms, node_version, build_command,
                    deploy_targets, env_vars, edge_provider, edge_domain, origin_strategy,
                    branch, output_dir
             FROM deploy_configs WHERE site_id = ?1",
            params![site_id],
            |r| {
                let parse_list = |raw: Option<String>| -> Vec<String> {
                    raw.and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
                        .unwrap_or_default()
                };
                let parse_env = |raw: Option<String>| -> Vec<EnvVar> {
                    raw.and_then(|s| serde_json::from_str::<Vec<EnvVar>>(&s).ok())
                        .unwrap_or_default()
                };

                Ok(DeployConfig {
                    site_id: r.get(0)?,
                    repo_platform: r
                        .get::<_, Option<String>>(1)?
                        .unwrap_or_else(|| "github".into()),
                    ci_platforms: parse_list(r.get(2)?),
                    node_version: r
                        .get::<_, Option<String>>(3)?
                        .unwrap_or_else(|| "20".into()),
                    build_command: r
                        .get::<_, Option<String>>(4)?
                        .unwrap_or_else(|| "npm install && npx hexo generate".into()),
                    branch: r
                        .get::<_, Option<String>>(10)?
                        .unwrap_or_else(|| "main".into()),
                    output_dir: r
                        .get::<_, Option<String>>(11)?
                        .unwrap_or_else(|| "public".into()),
                    deploy_targets: parse_list(r.get(5)?),
                    env_vars: parse_env(r.get(6)?),
                    edge_provider: r.get(7)?,
                    edge_domain: r.get(8)?,
                    origin_strategy: r
                        .get::<_, Option<String>>(9)?
                        .unwrap_or_else(|| "smart_routing".into()),
                })
            },
        )
        .ok();

    // 无记录时返回默认配置
    Ok(result.unwrap_or_else(|| DeployConfig {
        site_id,
        repo_platform: "github".into(),
        ci_platforms: vec!["github".into()],
        node_version: "20".into(),
        build_command: "npm install && npx hexo generate".into(),
        branch: "main".into(),
        output_dir: "public".into(),
        deploy_targets: vec![],
        env_vars: vec![],
        edge_provider: Some("cloudflare".into()),
        edge_domain: None,
        origin_strategy: "smart_routing".into(),
    }))
}

/// 获取部署历史。
#[tauri::command]
pub async fn get_deploy_logs(
    state: State<'_, AppState>,
    site_id: i64,
    limit: Option<i64>,
) -> AppResult<Vec<DeployLog>> {
    let db = Db::from_arc(&state.db);
    blocking::run(move || get_deploy_logs_impl(&db, site_id, limit)).await
}

fn get_deploy_logs_impl(
    db: &Db,
    site_id: i64,
    limit: Option<i64>,
) -> AppResult<Vec<DeployLog>> {
    let conn = db.conn()?;
    let n = limit.unwrap_or(50);

    let mut stmt = conn
        .prepare(
            "SELECT id, site_id, status, commit_message, commit_hash, branch, duration_ms,
                    error_message, output, created_at
             FROM deploy_logs WHERE site_id = ?1 ORDER BY id DESC LIMIT ?2",
        )?;

    let rows = stmt
        .query_map(params![site_id, n], |r| {
            Ok(DeployLog {
                id: r.get(0)?,
                site_id: r.get(1)?,
                status: r.get(2)?,
                commit_message: r.get(3)?,
                commit_hash: r.get(4)?,
                branch: r.get(5)?,
                duration_ms: r.get(6)?,
                error_message: r.get(7)?,
                output: r.get(8)?,
                created_at: r.get(9)?,
            })
        })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

/// 回滚部署到指定提交。
#[tauri::command]
pub async fn rollback_deploy(
    state: State<'_, AppState>,
    site_id: i64,
    commit_hash: String,
) -> AppResult<String> {
    let db = Db::from_arc(&state.db);
    let db = &db;
    let path: String = {
        let conn = db.conn()?;
        conn.query_row(
            "SELECT path FROM sites WHERE id = ?1",
            params![site_id],
            |r| r.get(0),
        )
        .map_err(|_| err!("站点不存在：{}", site_id))?
    };

    // 回滚前先暂存当前改动，避免丢失
    let _ = crate::git::operations::stash(&path).await;

    let out = crate::git::operations::reset_hard(&path, &commit_hash)
        .await?;

    // 记录一条回滚日志
    if let Ok(conn) = db.conn() {
        let _ = conn.execute(
            "INSERT INTO deploy_logs (site_id, status, commit_message, commit_hash, output)
             VALUES (?1, 'rollback', ?2, ?3, ?4)",
            params![site_id, format!("回滚到 {}", commit_hash), commit_hash, out],
        );
    }

    Ok(out)
}

/// 触发 Webhook（用于通知 CI/CD 平台重建）。
#[tauri::command]
pub async fn trigger_webhook(url: String, payload: Option<Value>) -> AppResult<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("HexoManager-Webhook/1.0")
        .build()
        .map_err(|e| err!("创建请求客户端失败：{}", e))?;

    let body = payload.unwrap_or_else(|| serde_json::json!({ "triggeredBy": "HexoManager" }));

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| err!("Webhook 请求失败：{}", e))?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(err!("Webhook 返回状态码 {}：{}", status, text));
    }

    Ok(format!("状态码 {}：{}", status, text))
}

/// 校验生成入参。
fn validate_input(input: &GenerateConfigInput) -> AppResult<()> {
    if input.site_path.trim().is_empty() {
        return Err(AppError::InvalidArgument("站点路径不能为空".into()));
    }
    if let Some(domain) = input.domain.as_ref().filter(|d| !d.trim().is_empty()) {
        crate::deploy::pages_generator::validate_domain(domain)
            .map_err(AppError::InvalidArgument)?;
    }
    if let Some(edge) = input.edge_domain.as_ref().filter(|d| !d.trim().is_empty()) {
        crate::deploy::pages_generator::validate_domain(edge).map_err(AppError::InvalidArgument)?;
    }
    Ok(())
}

/// 校验域名格式（供前端即时提示）。
#[tauri::command]
pub fn validate_domain(domain: String) -> AppResult<()> {
    crate::deploy::pages_generator::validate_domain(&domain).map_err(AppError::from)
}

/// 检查部署配置文件是否已存在（避免覆盖用户手写内容）。
///
/// 需要渲染全部模板再逐个 `stat`，放到阻塞线程池。
#[tauri::command]
pub async fn check_deploy_files(
    input: GenerateConfigInput,
) -> AppResult<Vec<(String, bool)>> {
    blocking::run(move || {
        let files =
            crate::deploy::config_generator::preview_all(&input)?;
        let root = std::path::Path::new(&input.site_path);

        Ok(files
            .into_iter()
            .map(|f| {
                let exists = root.join(&f.path).exists();
                (f.path, exists)
            })
            .collect())
    })
    .await
}
