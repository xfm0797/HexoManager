//! Git 操作命令（对应大纲 7.4）。

use crate::db::{site_path_of, Db};
use crate::models::{CommitLog, GitConfig, GitStatus};
use crate::utils::error::{AppError, AppResult};
use crate::utils::now_utc;
use crate::AppState;
use rusqlite::params;
use tauri::State;

/// 初始化 Git 仓库。
#[tauri::command]
pub async fn git_init(state: State<'_, AppState>, site_id: i64) -> AppResult<String> {
    let path = site_path_of(&state.db, site_id)?;
    crate::git::operations::init(&path).await
}

/// 查看 Git 状态。
#[tauri::command]
pub async fn git_status(state: State<'_, AppState>, site_id: i64) -> AppResult<GitStatus> {
    let path = site_path_of(&state.db, site_id)?;
    crate::git::status::git_status(&path).await
}

/// 暂存文件。
#[tauri::command]
pub async fn git_add(
    state: State<'_, AppState>,
    site_id: i64,
    files: Option<Vec<String>>,
) -> AppResult<()> {
    let db = Db::from_arc(&state.db);
    let path = site_path_of(&db, site_id)?;
    crate::git::operations::add(&path, files).await
}

/// 提交变更。
#[tauri::command]
pub async fn git_commit(
    state: State<'_, AppState>,
    site_id: i64,
    message: String,
) -> AppResult<CommitLog> {
    let db = Db::from_arc(&state.db);
    let db = &db;
    let path = site_path_of(db, site_id)?;
    let hash = crate::git::operations::commit(&path, &message).await?;

    if hash.is_empty() {
        return Err(AppError::coded(
            "git.nothing_to_commit",
            "没有可提交的变更",
            &[],
        ));
    }

    // 写入 Git 配置表
    {
        let conn = db.conn()?;
        let _ = conn.execute(
            "UPDATE git_configs SET last_commit = ?2, last_commit_msg = ?3 WHERE site_id = ?1",
            params![site_id, hash, message],
        );
    }

    let logs = crate::git::operations::log(&path, Some(1)).await?;

    logs.into_iter()
        .next()
        .ok_or_else(|| AppError::coded("git.commit_read_failed", "提交成功但未能读取提交记录", &[]))
}

/// 推送到远程。
#[tauri::command]
pub async fn git_push(state: State<'_, AppState>, site_id: i64) -> AppResult<String> {
    let db = &state.db;
    let path = site_path_of(db, site_id)?;
    let out = crate::git::operations::push(&path).await?;

    if let Ok(conn) = db.conn() {
        let _ = conn.execute(
            "UPDATE git_configs SET last_push_at = ?2 WHERE site_id = ?1",
            params![site_id, now_utc()],
        );
    }

    Ok(out)
}

/// 拉取远程更新。
#[tauri::command]
pub async fn git_pull(state: State<'_, AppState>, site_id: i64) -> AppResult<String> {
    let path = site_path_of(&state.db, site_id)?;
    crate::git::operations::pull(&path).await
}

/// 获取提交历史。
#[tauri::command]
pub async fn git_log(
    state: State<'_, AppState>,
    site_id: i64,
    limit: Option<i64>,
) -> AppResult<Vec<CommitLog>> {
    let db = Db::from_arc(&state.db);
    let path = site_path_of(&db, site_id)?;
    crate::git::operations::log(&path, limit).await
}

/// 查看工作区差异。
#[tauri::command]
pub async fn git_diff(state: State<'_, AppState>, site_id: i64) -> AppResult<String> {
    let path = site_path_of(&state.db, site_id)?;
    crate::git::operations::diff(&path).await
}

/// 设置远程仓库。
#[tauri::command]
pub async fn git_set_remote(
    state: State<'_, AppState>,
    site_id: i64,
    url: String,
    branch: Option<String>,
) -> AppResult<()> {
    let db = Db::from_arc(&state.db);
    let db = &db;
    let path = site_path_of(db, site_id)?;
    let branch_ref = branch.as_deref();
    crate::git::operations::set_remote(&path, &url, branch_ref).await?;

    let branch_value = branch.unwrap_or_else(|| "main".into());
    {
        let conn = db.conn()?;
        conn.execute(
            "INSERT INTO git_configs (site_id, remote_url, branch, auto_deploy)
             VALUES (?1, ?2, ?3, 1)
             ON CONFLICT(site_id) DO UPDATE SET remote_url = excluded.remote_url,
                                                branch = excluded.branch",
            params![site_id, url, branch_value],
        )?;
    }

    Ok(())
}

/// 放弃工作区改动。
#[tauri::command]
pub async fn git_discard_changes(
    state: State<'_, AppState>,
    site_id: i64,
    files: Option<Vec<String>>,
) -> AppResult<()> {
    let db = Db::from_arc(&state.db);
    let path = site_path_of(&db, site_id)?;
    crate::git::operations::discard_changes(&path, files).await
}

/// 暂存当前改动。
#[tauri::command]
pub async fn git_stash(state: State<'_, AppState>, site_id: i64) -> AppResult<String> {
    let path = site_path_of(&state.db, site_id)?;
    crate::git::operations::stash(&path).await
}

/// 恢复暂存的改动。
#[tauri::command]
pub async fn git_stash_pop(state: State<'_, AppState>, site_id: i64) -> AppResult<String> {
    let path = site_path_of(&state.db, site_id)?;
    crate::git::operations::stash_pop(&path).await
}

/// 获取站点的 Git 配置。
#[tauri::command]
pub fn get_git_config(state: State<'_, AppState>, site_id: i64) -> AppResult<Option<GitConfig>> {
    let conn = state.db.conn()?;
    let result = conn
        .query_row(
            "SELECT site_id, remote_url, branch, auto_deploy, last_commit, last_commit_msg, last_push_at
             FROM git_configs WHERE site_id = ?1",
            params![site_id],
            |r| {
                Ok(GitConfig {
                    site_id: r.get(0)?,
                    remote_url: r.get(1)?,
                    branch: r.get::<_, Option<String>>(2)?.unwrap_or_else(|| "main".into()),
                    auto_deploy: r.get::<_, Option<i64>>(3)?.unwrap_or(1) != 0,
                    last_commit: r.get(4)?,
                    last_commit_msg: r.get(5)?,
                    last_push_at: r.get(6)?,
                })
            },
        )
        .ok();
    Ok(result)
}
