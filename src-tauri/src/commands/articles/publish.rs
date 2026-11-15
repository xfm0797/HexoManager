//! 文章发布命令：草稿发布、下架、新建草稿。
//!
//! 发布/下架是「移动文件 + 改 Front Matter」，两边都可能撞到同名文件，
//! 因此统一走 `unique_target_path` 改名而不是覆盖。

use crate::commands::articles::crud::create_article_impl;
use crate::commands::articles::front_matter::{build_front_matter, read_article_file};
use crate::commands::articles::store::{row_to_article, ARTICLE_COLUMNS};
use crate::db::{site_path_of, Db};
use crate::models::Article;
use crate::utils::error::{AppError, AppResult};
use crate::utils::now_utc;
use crate::AppState;
use rusqlite::params;
use serde_json::Value;
use tauri::State;

/// 发布草稿（移动到 _posts 并写入 date）。
#[tauri::command]
pub async fn publish_article(state: State<'_, AppState>, article_id: i64) -> AppResult<Article> {
    publish_article_impl(&state.db, article_id, true).await
}

/// 下架文章（移回 _drafts）。
#[tauri::command]
pub async fn unpublish_article(state: State<'_, AppState>, article_id: i64) -> AppResult<Article> {
    publish_article_impl(&state.db, article_id, false).await
}

/// 在 `dir` 下为 `file_name` 找一个不冲突的路径：`x.md` → `x-1.md` → `x-2.md`…
///
/// 与 `create_article` / `import_articles` 的去重策略保持一致。
fn unique_target_path(dir: &std::path::Path, file_name: &std::ffi::OsStr) -> std::path::PathBuf {
    let candidate = dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }

    let path = std::path::Path::new(file_name);
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let ext = path.extension().map(|s| s.to_string_lossy().to_string());

    let mut counter = 1;
    loop {
        let name = match &ext {
            Some(e) => format!("{}-{}.{}", stem, counter, e),
            None => format!("{}-{}", stem, counter),
        };
        let candidate = dir.join(name);
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
    }
}

pub(crate) async fn publish_article_impl(
    db: &Db,
    article_id: i64,
    publish: bool,
) -> AppResult<Article> {
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
    let src = std::path::Path::new(&file_path);
    if !src.exists() {
        return Err(AppError::coded(
            "article.file_missing",
            format!("路径不存在: {}", file_path),
            &[("path", file_path.clone())],
        ));
    }

    let target_dir = if publish { "_posts" } else { "_drafts" };
    let dir = std::path::Path::new(&site_path)
        .join("source")
        .join(target_dir);
    std::fs::create_dir_all(&dir)?;

    let file_name = src
        .file_name()
        .ok_or_else(|| AppError::coded("article.filename_invalid", "无法解析文件名", &[]))?;

    // 已在目标目录（例如对已发布文章再点一次「发布」）→ 原路径处理，不产生副本
    let dst = if src.parent() == Some(dir.as_path()) {
        src.to_path_buf()
    } else {
        // 目标目录已有同名文件时必须改名，绝不覆盖：
        // `_drafts/hello.md` 发布时若 `_posts/hello.md` 已存在，
        // 直接 write 会静默抹掉线上文章，且不可撤销
        unique_target_path(&dir, file_name)
    };

    // 更新 Front Matter 的 date 字段
    let (mut front, body) = read_article_file(&file_path)?;
    if !front.is_object() {
        front = serde_json::json!({});
    }
    if let Some(obj) = front.as_object_mut() {
        if publish {
            if !obj.contains_key("date") {
                obj.insert(
                    "date".into(),
                    Value::String(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()),
                );
            }
        } else {
            obj.remove("date");
        }
    }

    let content = build_front_matter(&front, &body)?;
    // 先写目标、成功后再删源：中途失败最多留下两份，不会丢内容
    std::fs::write(&dst, content)?;
    if dst != src {
        std::fs::remove_file(src).map_err(|e| {
            AppError::coded(
                "article.source_cleanup_failed",
                format!(
                    "已写入 {}，但删除源文件 {} 失败：{}",
                    dst.display(),
                    src.display(),
                    e
                ),
                &[
                    ("to", dst.display().to_string()),
                    ("from", src.display().to_string()),
                    ("detail", e.to_string()),
                ],
            )
        })?;
    }

    let new_path = dst.display().to_string();
    {
        let conn = db.conn()?;
        conn.execute(
            "UPDATE articles SET file_path = ?2, status = ?3, published_at = ?4 WHERE id = ?1",
            params![
                article_id,
                new_path,
                if publish { "published" } else { "draft" },
                if publish { Some(now_utc()) } else { None }
            ],
        )?;
    }

    let _ = crate::commands::site_commands::rescan_articles(db, site_id, &site_path).await;

    let conn = db.conn()?;
    let sql = format!("SELECT {} FROM articles WHERE id = ?1", ARTICLE_COLUMNS);
    conn.query_row(&sql, params![article_id], row_to_article)
        .map_err(|_| AppError::coded("article.reload_failed", "操作后未能读取文章", &[]))
}

/// 新建草稿。
///
/// `template_id` 语义同 `create_article`。
#[tauri::command]
pub async fn create_draft(
    state: State<'_, AppState>,
    site_id: i64,
    title: String,
    template_id: Option<i64>,
) -> AppResult<Article> {
    let db = Db::from_arc(&state.db);
    create_article_impl(
        &db,
        site_id,
        &title,
        true,
        Vec::new(),
        Vec::new(),
        template_id,
    )
    .await
}
