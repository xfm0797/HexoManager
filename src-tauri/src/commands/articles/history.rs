//! 文章的历史版本（基于 Git 提交记录）。

use crate::db::{site_path_of, Db};
use crate::models::CommitLog;
use crate::utils::error::{AppError, AppResult};
use crate::AppState;
use rusqlite::params;
use tauri::State;

/// 获取文章的历史版本（基于 Git 提交记录）。
#[tauri::command]
pub async fn get_article_history(
    state: State<'_, AppState>,
    article_id: i64,
    limit: Option<i64>,
) -> AppResult<Vec<CommitLog>> {
    let db = Db::from_arc(&state.db);
    let db = &db;
    let (site_id, file_path) = {
        let conn = db.conn()?;
        conn.query_row(
            "SELECT site_id, file_path FROM articles WHERE id = ?1",
            params![article_id],
            |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::coded(
                "article.not_found",
                format!("文章不存在：{}", article_id),
                &[("id", article_id.to_string())],
            ),
            other => AppError::Database(other),
        })?
    };

    let site_path = site_path_of(db, site_id)?;
    if !crate::git::status::is_repo(&site_path).await {
        return Ok(Vec::new());
    }

    // 转为仓库内相对路径
    let root = std::path::Path::new(&site_path);
    let rel = std::path::Path::new(&file_path)
        .strip_prefix(root)
        .map(|p| p.display().to_string())
        .unwrap_or(file_path);

    let n = limit.unwrap_or(30).to_string();
    let out = crate::utils::process::run(
        "git",
        &[
            "log",
            crate::git::operations::LOG_FORMAT,
            "-n",
            &n,
            "--",
            &rel,
        ],
        Some(root),
        Some(60),
    )
    .await?;

    Ok(crate::git::operations::parse_log_lines(&out.stdout))
}

/// 读取指定提交版本的文章内容。
#[tauri::command]
pub async fn get_article_at_commit(
    state: State<'_, AppState>,
    article_id: i64,
    commit_hash: String,
) -> AppResult<String> {
    let db = Db::from_arc(&state.db);
    let db = &db;
    let (site_id, file_path) = {
        let conn = db.conn()?;
        conn.query_row(
            "SELECT site_id, file_path FROM articles WHERE id = ?1",
            params![article_id],
            |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::coded(
                "article.not_found",
                format!("文章不存在：{}", article_id),
                &[("id", article_id.to_string())],
            ),
            other => AppError::Database(other),
        })?
    };

    let site_path = site_path_of(db, site_id)?;
    let root = std::path::Path::new(&site_path);
    let rel = std::path::Path::new(&file_path)
        .strip_prefix(root)
        .map(|p| p.display().to_string())
        .unwrap_or(file_path);

    let spec = format!("{}:{}", commit_hash, rel);
    let out = crate::utils::process::run("git", &["show", &spec], Some(root), Some(60))
        .await?;

    if !out.success {
        return Err(AppError::coded(
            "git.show_failed",
            format!("读取历史版本失败：{}", out.combined()),
            &[("commit", commit_hash.clone())],
        ));
    }

    Ok(out.stdout)
}
