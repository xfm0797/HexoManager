//! 文章增删改命令：新建、更新、删除、批量导入。

use crate::commands::articles::front_matter::{
    build_front_matter, read_article_file, split_front_matter, to_string_list,
};
use crate::commands::articles::store::{
    file_stamp, row_to_article, upsert_article, ScannedArticle, ARTICLE_COLUMNS,
};
use crate::db::{site_path_of, Db};
use crate::models::{Article, UpdateArticleInput};
use crate::utils::error::{AppError, AppResult};
use crate::utils::{count_words, now_utc, slugify};
use crate::AppState;
use rusqlite::{params, OptionalExtension};
use serde_json::Value;
use tauri::State;

/// 新建文章。
///
/// `template_id` 非空时，会把该 Front Matter 模板的字段与正文骨架一并写入，
/// 省去手动补 `toc` / `comments` / `cover` 等常用字段。
#[tauri::command]
pub async fn create_article(
    state: State<'_, AppState>,
    site_id: i64,
    title: String,
    is_draft: Option<bool>,
    categories: Option<Vec<String>>,
    tags: Option<Vec<String>>,
    template_id: Option<i64>,
) -> AppResult<Article> {
    let db = Db::from_arc(&state.db);
    create_article_impl(
        &db,
        site_id,
        &title,
        is_draft.unwrap_or(false),
        categories.unwrap_or_default(),
        tags.unwrap_or_default(),
        template_id,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn create_article_impl(
    db: &Db,
    site_id: i64,
    title: &str,
    is_draft: bool,
    categories: Vec<String>,
    tags: Vec<String>,
    template_id: Option<i64>,
) -> AppResult<Article> {
    let site_path = site_path_of(db, site_id)?;
    let slug = slugify(title);
    let slug = if slug.is_empty() {
        format!("post-{}", chrono::Utc::now().timestamp())
    } else {
        slug
    };

    // 先取出模板（若有），后面统一合并字段与正文骨架
    let template = match template_id {
        Some(id) => {
            let conn = db.conn()?;
            Some(crate::commands::template_commands::load_template(&conn, id)?)
        }
        None => None,
    };

    let sub_dir = if is_draft { "_drafts" } else { "_posts" };
    let dir = std::path::Path::new(&site_path)
        .join("source")
        .join(sub_dir);
    std::fs::create_dir_all(&dir)?;

    let mut file_path = dir.join(format!("{}.md", slug));
    // 避免覆盖已有文件
    let mut counter = 1;
    while file_path.exists() {
        file_path = dir.join(format!("{}-{}.md", slug, counter));
        counter += 1;
    }

    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let mut front = serde_json::json!({
        "title": title,
        "date": now,
        "tags": tags,
        "categories": categories,
    });

    // 模板字段只补缺失：外观里手填的分类/标签优先级更高
    if let Some(tpl) = &template {
        if let Some(obj) = front.as_object_mut() {
            crate::commands::template_commands::merge_template_fields(obj, &tpl.fields, false);
        }
    }

    if is_draft {
        // 草稿通常不写 date
        if let Some(obj) = front.as_object_mut() {
            obj.remove("date");
        }
    }

    // 正文骨架：模板提供了就用它（渲染 {{title}} 等占位符），否则退回「一级标题 + 空行」
    let body = match template.as_ref().and_then(|t| t.body.as_deref()) {
        Some(skeleton) if !skeleton.trim().is_empty() => {
            crate::commands::template_commands::render_body(
                skeleton,
                &crate::commands::template_commands::RenderContext { title, slug: &slug },
            )
        }
        _ => format!("# {}\n\n", title),
    };
    let content = build_front_matter(&front, &body)?;
    std::fs::write(&file_path, &content)?;

    // 最终落库的分类/标签以实际写出的 front matter 为准（模板可能补了分类）
    let categories = front
        .get("categories")
        .map(to_string_list)
        .unwrap_or_default();
    let tags = front.get("tags").map(to_string_list).unwrap_or_default();

    let path_str = file_path.display().to_string();
    let (file_mtime, file_size) = file_stamp(&path_str);
    let scanned = ScannedArticle {
        title: title.to_string(),
        slug: Some(slug),
        file_path: path_str,
        content: body,
        excerpt: None,
        status: if is_draft { "draft" } else { "published" }.to_string(),
        categories,
        tags,
        cover_image: None,
        is_top: false,
        allow_comment: true,
        word_count: count_words(&content),
        created_at: Some(now_utc()),
        updated_at: Some(now_utc()),
        published_at: if is_draft { None } else { Some(now_utc()) },
        file_mtime,
        file_size,
    };

    // 只回写这一篇：整站对账会把其他文章的行误删
    let article_id = upsert_article(db, site_id, scanned).await?;
    let conn = db.conn()?;
    let sql = format!("SELECT {} FROM articles WHERE id = ?1", ARTICLE_COLUMNS);
    conn.query_row(&sql, params![article_id], row_to_article)
        .map_err(|e| match e {
            // 记录确实不存在
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound(format!("新建文章后未能读取记录：{}", file_path.display()))
            }
            // 其他错误（如列索引错位）保留原始信息，避免再次被误报为「记录不存在」
            other => AppError::Other(format!("读取新建文章记录失败：{}", other)),
        })
}

/// 更新文章。
#[tauri::command]
pub async fn update_article(
    state: State<'_, AppState>,
    article_id: i64,
    updates: UpdateArticleInput,
) -> AppResult<Article> {
    let db = Db::from_arc(&state.db);
    update_article_impl(&db, article_id, updates)
        .await
}

pub(crate) async fn update_article_impl(
    db: &Db,
    article_id: i64,
    updates: UpdateArticleInput,
) -> AppResult<Article> {
    let (site_id, file_path, current_status, current_published_at) = {
        let conn = db.conn()?;
        conn.query_row(
            "SELECT site_id, file_path, status, published_at FROM articles WHERE id = ?1",
            params![article_id],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, Option<String>>(3)?,
                ))
            },
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

    // 只读一次原文：既用于解析，也用于判断「这次保存到底有没有改东西」
    let raw = std::fs::read_to_string(&file_path)?;
    let (parsed_front, parsed_body) = split_front_matter(&raw);
    let mut front = parsed_front
        .filter(|f| f.is_object())
        .unwrap_or_else(|| serde_json::json!({}));
    let body = updates.content.clone().unwrap_or(parsed_body);

    // 逐字段写回 Front Matter
    if let Some(obj) = front.as_object_mut() {
        if let Some(title) = &updates.title {
            obj.insert("title".into(), Value::String(title.clone()));
        }
        if let Some(excerpt) = &updates.excerpt {
            obj.insert("excerpt".into(), Value::String(excerpt.clone()));
        }
        if let Some(cats) = &updates.categories {
            obj.insert(
                "categories".into(),
                Value::Array(cats.iter().map(|c| Value::String(c.clone())).collect()),
            );
        }
        if let Some(tgs) = &updates.tags {
            obj.insert(
                "tags".into(),
                Value::Array(tgs.iter().map(|t| Value::String(t.clone())).collect()),
            );
        }
        if let Some(cover) = &updates.cover_image {
            obj.insert("cover".into(), Value::String(cover.clone()));
        }
        if let Some(top) = updates.is_top {
            obj.insert("sticky".into(), Value::Bool(top));
        }
        if let Some(ac) = updates.allow_comment {
            obj.insert("comments".into(), Value::Bool(ac));
        }
        // 状态变化时补写/移除 date
        if let Some(status) = &updates.status {
            if status != &current_status && status == "published" && !obj.contains_key("date") {
                obj.insert(
                    "date".into(),
                    Value::String(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()),
                );
            }
        }
    }

    // 先构建一次「不含 updated」的结果：与磁盘原文完全一致说明本次保存没有任何实际变化。
    // 此时既不写盘也不改 updated —— 否则 30 秒自动保存会给每篇文章刷出一个空 diff。
    // 注意：状态变更（发布/转草稿）必须落库，不能因为正文没改就提前返回。
    let status_unchanged = updates
        .status
        .as_deref()
        .map(|s| s == current_status)
        .unwrap_or(true);
    let candidate = build_front_matter(&front, &body)?;
    if candidate == raw && status_unchanged {
        let conn = db.conn()?;
        let sql = format!("SELECT {} FROM articles WHERE id = ?1", ARTICLE_COLUMNS);
        return conn
            .query_row(&sql, params![article_id], row_to_article)
            .map_err(|_| AppError::coded("article.reload_failed", "更新后未能读取文章", &[]));
    }

    // 确有改动：才写入 updated 并落盘
    if let Some(obj) = front.as_object_mut() {
        obj.insert(
            "updated".into(),
            Value::String(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()),
        );
    }

    let new_content = build_front_matter(&front, &body)?;
    std::fs::write(&file_path, &new_content)?;
    let (file_mtime, file_size) = file_stamp(&file_path);

    let (front2, body2) = read_article_file(&file_path)?;
    let title = front2
        .get("title")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .unwrap_or_else(|| "未命名".into());
    let categories = front2
        .get("categories")
        .map(to_string_list)
        .unwrap_or_default();
    let tags = front2.get("tags").map(to_string_list).unwrap_or_default();
    let is_top = front2
        .get("sticky")
        .or_else(|| front2.get("top"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let allow_comment = front2
        .get("comments")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let excerpt = front2
        .get("excerpt")
        .or_else(|| front2.get("description"))
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let cover = front2
        .get("cover")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let created_at = front2
        .get("date")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let updated_at = front2
        .get("updated")
        .and_then(|v| v.as_str())
        .map(str::to_string);

    let final_status = updates.status.clone().unwrap_or(current_status);

    let scanned = ScannedArticle {
        title,
        slug: front2
            .get("slug")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        file_path: file_path.clone(),
        content: body2,
        excerpt,
        status: final_status.clone(),
        categories,
        tags,
        cover_image: cover,
        is_top,
        allow_comment,
        word_count: count_words(&new_content),
        created_at,
        updated_at,
        // 已发布文章重复保存时保留原始发布时间：此前每次都写 now_utc()，
        // 改个错别字就会跳到列表最前，也让「最近更新」排序失去意义
        published_at: if final_status == "published" {
            current_published_at.clone().or_else(|| Some(now_utc()))
        } else {
            None
        },
        file_mtime,
        file_size,
    };

    // 只回写这一篇：整站对账会把其他文章的行误删
    upsert_article(db, site_id, scanned).await?;

    let conn = db.conn()?;
    let sql = format!("SELECT {} FROM articles WHERE id = ?1", ARTICLE_COLUMNS);
    conn.query_row(&sql, params![article_id], row_to_article)
        .map_err(|_| AppError::NotFound("更新后未能读取文章".into()))
}

/// 删除文章（同时删除磁盘文件）。
#[tauri::command]
pub async fn delete_article(state: State<'_, AppState>, article_id: i64) -> AppResult<()> {
    let db = &state.db;
    let (site_id, file_path) = {
        let conn = db.conn()?;
        conn.query_row(
            "SELECT site_id, file_path FROM articles WHERE id = ?1",
            params![article_id],
            |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)),
        )
        .map_err(|_| format!("文章不存在：{}", article_id))?
    };

    let p = std::path::Path::new(&file_path);
    if p.exists() {
        std::fs::remove_file(p).map_err(|e| format!("删除文件失败：{}", e))?;
    }

    {
        let conn = db.conn()?;
        conn.execute("DELETE FROM articles WHERE id = ?1", params![article_id])?;
    }

    // 同步站点计数
    if let Ok(site_path) = site_path_of(db, site_id) {
        let _ = crate::commands::site_commands::rescan_articles(db, site_id, &site_path).await;
    }

    Ok(())
}

/// 批量导入 Markdown 文件。
#[tauri::command]
pub async fn import_articles(
    state: State<'_, AppState>,
    site_id: i64,
    files: Vec<String>,
) -> AppResult<Vec<Article>> {
    let db = Db::from_arc(&state.db);
    let db = &db;
    let site_path = site_path_of(db, site_id)?;
    let posts_dir = std::path::Path::new(&site_path)
        .join("source")
        .join("_posts");
    std::fs::create_dir_all(&posts_dir)?;

    let mut imported = Vec::new();
    for file in files {
        let src = std::path::Path::new(&file);
        if !src.exists() {
            continue;
        }
        let name = src
            .file_name()
            .ok_or_else(|| "无法解析文件名".to_string())?
            .to_string_lossy()
            .to_string();
        let mut dst = posts_dir.join(&name);
        let mut counter = 1;
        while dst.exists() {
            let stem = src
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let ext = src
                .extension()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "md".into());
            dst = posts_dir.join(format!("{}-{}.{}", stem, counter, ext));
            counter += 1;
        }
        std::fs::copy(src, &dst).map_err(|e| format!("复制文件失败：{}", e))?;
        imported.push(dst.display().to_string());
    }

    crate::commands::site_commands::rescan_articles(db, site_id, &site_path)
        .await?;

    // 返回新导入文章的记录
    let mut result = Vec::new();
    for path in imported {
        let (_, article_id) = {
            let conn = db.conn()?;
            let id: Option<i64> = conn
                .query_row(
                    "SELECT id FROM articles WHERE site_id = ?1 AND file_path = ?2",
                    params![site_id, path],
                    |r| r.get(0),
                )
                .optional()?;
            ((), id)
        };
        if let Some(id) = article_id {
            let conn = db.conn()?;
            let sql = format!("SELECT {} FROM articles WHERE id = ?1", ARTICLE_COLUMNS);
            if let Ok(a) = conn.query_row(&sql, params![id], row_to_article) {
                result.push(a);
            }
        }
    }

    Ok(result)
}
