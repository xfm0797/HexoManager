//! Hexo 操作命令（对应大纲 7.3）。

use crate::db::Db;
use crate::models::{Article, BuildResult, DeployResult, EnvCheck, PreviewServer};
use crate::utils::error::{AppError, AppResult};
use crate::utils::now_utc;
use crate::AppState;
use tauri::{Emitter, State};

/// 从数据库读取站点路径。
fn site_path_of(db: &Db, site_id: i64) -> AppResult<String> {
    let conn = db.conn()?;
    conn.query_row(
        "SELECT path FROM sites WHERE id = ?1",
        params![site_id],
        |r| r.get(0),
    )
    .map_err(|_| AppError::NotFound(format!("站点不存在：{}", site_id)))
}

use rusqlite::params;

/// 记录一次部署日志。
///
/// 参数与 `deploy_logs` 表的字段一一对应，展开为独立参数便于调用方直传，
/// 因此此处显式放宽 clippy 的参数数量检查。
#[allow(clippy::too_many_arguments)]
pub fn record_deploy_log(
    db: &Db,
    site_id: i64,
    status: &str,
    commit_message: Option<&str>,
    commit_hash: Option<&str>,
    branch: Option<&str>,
    duration_ms: Option<i64>,
    error_message: Option<&str>,
    output: Option<&str>,
) -> AppResult<i64> {
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO deploy_logs (site_id, status, commit_message, commit_hash, branch,
            duration_ms, error_message, output)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        params![
            site_id,
            status,
            commit_message,
            commit_hash,
            branch,
            duration_ms,
            error_message,
            output
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// 构建站点：`hexo clean && hexo generate`。
#[tauri::command]
pub async fn hexo_build(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    site_id: i64,
) -> Result<BuildResult, String> {
    let db = Db::from_arc(&state.db);
    let path = site_path_of(&db, site_id).map_err(|e| e.to_string())?;

    let _ = app.emit("hexo:build-start", serde_json::json!({ "siteId": site_id }));
    let result = crate::hexo::builder::build(&path)
        .await
        .map_err(|e| e.to_string())?;
    let _ = app.emit(
        "hexo:build-finish",
        serde_json::json!({
            "siteId": site_id,
            "success": result.success,
            "durationMs": result.duration_ms,
        }),
    );

    Ok(result)
}

/// 清理缓存：`hexo clean`。
#[tauri::command]
pub async fn hexo_clean(state: State<'_, AppState>, site_id: i64) -> Result<BuildResult, String> {
    let path = site_path_of(&state.db, site_id).map_err(|e| e.to_string())?;
    crate::hexo::builder::clean(&path)
        .await
        .map_err(|e| e.to_string())
}

/// 生成静态文件：`hexo generate`。
#[tauri::command]
pub async fn hexo_generate(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    site_id: i64,
) -> Result<BuildResult, String> {
    let db = Db::from_arc(&state.db);
    let path = site_path_of(&db, site_id).map_err(|e| e.to_string())?;
    let _ = app.emit(
        "hexo:generate-start",
        serde_json::json!({ "siteId": site_id }),
    );
    let result = crate::hexo::builder::generate(&path)
        .await
        .map_err(|e| e.to_string())?;
    let _ = app.emit(
        "hexo:generate-finish",
        serde_json::json!({ "siteId": site_id, "success": result.success }),
    );
    Ok(result)
}

/// 启动本地预览服务。
#[tauri::command]
pub async fn hexo_server_start(
    state: State<'_, AppState>,
    site_id: i64,
    port: Option<u16>,
) -> Result<PreviewServer, String> {
    let db = Db::from_arc(&state.db);
    let path = site_path_of(&db, site_id).map_err(|e| e.to_string())?;

    // 已在运行则直接返回，避免重复启动
    if let Some(existing) = state.servers.get(site_id) {
        if crate::hexo::server::is_running(existing.pid) {
            return Ok(existing);
        }
        state.servers.remove(site_id);
    }

    let desired = port.unwrap_or(4000);
    let actual_port = crate::hexo::server::find_free_port(desired).await;

    let server = crate::hexo::server::spawn_server(site_id, &path, actual_port)
        .await
        .map_err(|e| e.to_string())?;

    state.servers.insert(server.clone());
    Ok(server)
}

/// 停止本地预览服务。
#[tauri::command]
pub fn hexo_server_stop(state: State<'_, AppState>, pid: u32) -> Result<(), String> {
    // 先按 PID 结束
    let _ = crate::hexo::server::kill_by_pid(pid);

    // 同步清理注册表
    let list = state.servers.list();
    for server in list {
        if server.pid == pid {
            state.servers.remove(server.site_id);
        }
    }

    Ok(())
}

/// 列出全部运行中的预览服务。
#[tauri::command]
pub fn hexo_server_list(state: State<'_, AppState>) -> Result<Vec<PreviewServer>, String> {
    let mut list = state.servers.list();
    // 过滤掉已退出的进程
    list.retain(|s| crate::hexo::server::is_running(s.pid));
    Ok(list)
}

/// 新建文章：`hexo new post <title>`。
#[tauri::command]
pub async fn hexo_new_post(
    state: State<'_, AppState>,
    site_id: i64,
    title: String,
) -> Result<String, String> {
    let db = Db::from_arc(&state.db);
    let db = &db;
    let path = site_path_of(db, site_id).map_err(|e| e.to_string())?;
    let out = crate::hexo::builder::new_post(&path, "post", &title)
        .await
        .map_err(|e| e.to_string())?;
    let _ = crate::commands::site_commands::rescan_articles(db, site_id, &path).await;
    Ok(out)
}

/// 新建草稿：`hexo new draft <title>`。
#[tauri::command]
pub async fn hexo_new_draft(
    state: State<'_, AppState>,
    site_id: i64,
    title: String,
) -> Result<String, String> {
    let db = Db::from_arc(&state.db);
    let db = &db;
    let path = site_path_of(db, site_id).map_err(|e| e.to_string())?;
    let out = crate::hexo::builder::new_post(&path, "draft", &title)
        .await
        .map_err(|e| e.to_string())?;
    let _ = crate::commands::site_commands::rescan_articles(db, site_id, &path).await;
    Ok(out)
}

/// 发布草稿：`hexo publish <slug>`。
#[tauri::command]
pub async fn hexo_publish(
    state: State<'_, AppState>,
    site_id: i64,
    slug: String,
) -> Result<String, String> {
    let db = Db::from_arc(&state.db);
    let db = &db;
    let path = site_path_of(db, site_id).map_err(|e| e.to_string())?;
    let out = crate::hexo::builder::publish_post(&path, &slug)
        .await
        .map_err(|e| e.to_string())?;
    let _ = crate::commands::site_commands::rescan_articles(db, site_id, &path).await;
    Ok(out)
}

/// 使用站点配置的 deploy 方式部署：`hexo deploy`。
#[tauri::command]
pub async fn hexo_deploy(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    site_id: i64,
) -> Result<BuildResult, String> {
    let db = Db::from_arc(&state.db);
    let db = &db;
    let path = site_path_of(db, site_id).map_err(|e| e.to_string())?;

    let _ = app.emit(
        "hexo:deploy-start",
        serde_json::json!({ "siteId": site_id }),
    );
    let result = crate::hexo::builder::deploy_local(&path)
        .await
        .map_err(|e| e.to_string())?;

    let _ = record_deploy_log(
        db,
        site_id,
        if result.success { "success" } else { "failed" },
        Some("hexo deploy"),
        None,
        None,
        Some(result.duration_ms as i64),
        result.error.as_deref(),
        Some(&result.output),
    );

    if result.success {
        if let Ok(conn) = db.conn() {
            let _ = conn.execute(
                "UPDATE sites SET last_deploy_at = ?2 WHERE id = ?1",
                params![site_id, now_utc()],
            );
        }
    }

    let _ = app.emit(
        "hexo:deploy-finish",
        serde_json::json!({ "siteId": site_id, "success": result.success }),
    );

    Ok(result)
}

/// 检查 Hexo 环境。
#[tauri::command]
pub async fn check_hexo_env(
    state: State<'_, AppState>,
    path: Option<String>,
    site_id: Option<i64>,
) -> Result<EnvCheck, String> {
    let target = match (path, site_id) {
        (Some(p), _) => p,
        (None, Some(id)) => site_path_of(&state.db, id).map_err(|e| e.to_string())?,
        (None, None) => ".".to_string(),
    };
    crate::hexo::installer::check_env(&target)
        .await
        .map_err(|e| e.to_string())
}

/// 安装 Hexo CLI。
#[tauri::command]
pub async fn install_hexo(path: Option<String>) -> Result<String, String> {
    crate::hexo::installer::install_hexo(path.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// 一键部署：git add + commit + push。
#[tauri::command]
pub async fn deploy_site(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    site_id: i64,
    message: String,
) -> Result<DeployResult, String> {
    let db = Db::from_arc(&state.db);
    deploy_site_impl(&app, &db, site_id, &message)
        .await
        .map_err(|e| e.to_string())
}

async fn deploy_site_impl(
    app: &tauri::AppHandle,
    db: &Db,
    site_id: i64,
    message: &str,
) -> AppResult<DeployResult> {
    let path = site_path_of(db, site_id)?;
    let started = std::time::Instant::now();

    let _ = app.emit(
        "deploy:start",
        serde_json::json!({ "siteId": site_id, "message": message }),
    );

    // 1) 确保是 Git 仓库
    if !crate::git::status::is_repo(&path).await {
        let _ = app.emit("deploy:log", "未检测到 Git 仓库，正在初始化…");
        crate::git::operations::init(&path).await?;
    }

    // 2) 暂存全部变更
    let _ = app.emit("deploy:log", "正在暂存变更（git add -A）…");
    crate::git::operations::add(&path, None).await?;

    // 3) 提交
    let _ = app.emit("deploy:log", format!("正在提交：{}", message));
    let commit_msg = if message.trim().is_empty() {
        format!("chore: 自动部署于 {}", now_utc())
    } else {
        message.to_string()
    };

    let commit_hash = crate::git::operations::commit(&path, &commit_msg).await?;
    let has_commit = !commit_hash.is_empty();

    if !has_commit {
        let _ = app.emit("deploy:log", "没有需要提交的变更");
    }

    // 4) 推送
    let _ = app.emit("deploy:log", "正在推送到远程仓库（git push）…");
    let push_result = crate::git::operations::push(&path).await;

    let duration = started.elapsed().as_millis() as i64;
    let status = crate::git::status::git_status(&path)
        .await
        .unwrap_or_default();
    let branch = status.branch.clone();
    let remote = status.remote.clone();

    let (success, output, error) = match push_result {
        Ok(out) => (true, out, None),
        Err(e) => (false, String::new(), Some(e.to_string())),
    };

    // 记录部署日志
    let _ = record_deploy_log(
        db,
        site_id,
        if success { "success" } else { "failed" },
        Some(&commit_msg),
        if has_commit { Some(&commit_hash) } else { None },
        branch.as_deref(),
        Some(duration),
        error.as_deref(),
        Some(&output),
    );

    // 更新站点与 Git 配置表
    if success {
        if let Ok(conn) = db.conn() {
            let _ = conn.execute(
                "UPDATE sites SET last_deploy_at = ?2 WHERE id = ?1",
                params![site_id, now_utc()],
            );
            let _ = conn.execute(
                "UPDATE git_configs SET last_commit = ?2, last_commit_msg = ?3, last_push_at = ?4
                 WHERE site_id = ?1",
                params![site_id, commit_hash, commit_msg, now_utc()],
            );
        }
    }

    let result = DeployResult {
        success,
        commit_hash: if has_commit { Some(commit_hash) } else { None },
        remote,
        branch,
        duration_ms: duration as u64,
        output,
        error,
    };

    let _ = app.emit(
        "deploy:finish",
        serde_json::json!({ "siteId": site_id, "success": result.success, "durationMs": duration }),
    );

    Ok(result)
}

/// 新建文章（返回文章记录而非原始输出）。
#[tauri::command]
pub async fn hexo_new_post_article(
    state: State<'_, AppState>,
    site_id: i64,
    title: String,
    is_draft: Option<bool>,
) -> Result<Article, String> {
    crate::commands::article_commands::create_article(
        state,
        site_id,
        title,
        Some(is_draft.unwrap_or(false)),
        None,
        None,
    )
    .await
}
