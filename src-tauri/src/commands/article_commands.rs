//! 文章管理命令（对应大纲 7.2）。

use crate::db::Db;
use crate::models::{Article, ArticleQuery, Category, PaginatedArticles, Tag, UpdateArticleInput};
use crate::utils::error::{AppError, AppResult};
use crate::utils::{count_words, now_utc, slugify};
use crate::AppState;
use rusqlite::{params, OptionalExtension};
use serde_json::Value;
use tauri::State;

/// 扫描得到的文章中间结构。
#[derive(Debug, Clone)]
pub struct ScannedArticle {
    pub title: String,
    pub slug: Option<String>,
    pub file_path: String,
    pub content: String,
    pub excerpt: Option<String>,
    pub status: String,
    pub categories: Vec<String>,
    pub tags: Vec<String>,
    pub cover_image: Option<String>,
    pub is_top: bool,
    pub allow_comment: bool,
    pub word_count: i64,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub published_at: Option<String>,
}

/// 将 YAML 值统一转为字符串列表（兼容 `["a"]`、`"a"`、`[["a","b"]]`）。
pub fn to_string_list(value: &Value) -> Vec<String> {
    match value {
        Value::String(s) => {
            if s.trim().is_empty() {
                Vec::new()
            } else {
                vec![s.clone()]
            }
        }
        Value::Array(arr) => {
            let mut out = Vec::new();
            for item in arr {
                match item {
                    Value::String(s) => {
                        if !s.trim().is_empty() {
                            out.push(s.clone());
                        }
                    }
                    // Hexo 支持嵌套数组表示多级分类：categories: [[a, b]]
                    Value::Array(inner) => {
                        for sub in inner {
                            if let Some(s) = sub.as_str() {
                                if !s.trim().is_empty() {
                                    out.push(s.to_string());
                                }
                            }
                        }
                    }
                    Value::Number(n) => out.push(n.to_string()),
                    _ => {}
                }
            }
            out
        }
        _ => Vec::new(),
    }
}

/// 拆分 Markdown 文件的 Front Matter 与正文。
///
/// 返回 `(front_matter_json, body)`。
pub fn split_front_matter(content: &str) -> (Option<Value>, String) {
    let trimmed = content.trim_start_matches('\u{feff}');
    if !trimmed.starts_with("---") {
        return (None, content.to_string());
    }

    // 找结束分隔符
    let after_first = &trimmed[3..];
    let end_idx = after_first
        .find("\n---")
        .or_else(|| after_first.find("\r\n---"));

    let Some(idx) = end_idx else {
        return (None, content.to_string());
    };

    let front_str = &after_first[..idx];
    // 跳过结束标记所在行
    let rest = &after_first[idx..];
    let body_start = rest
        .find('\n')
        .map(|i| idx + i + 1)
        .unwrap_or(after_first.len());

    let body = after_first[body_start..].to_string();

    match crate::hexo::config_parser::parse_yaml_str(front_str) {
        Ok(v) => (Some(v), body),
        Err(_) => (None, content.to_string()),
    }
}

/// 组装 Front Matter 与正文。
pub fn build_front_matter(front: &Value, body: &str) -> AppResult<String> {
    let yaml = serde_yaml::to_string(front).map_err(|e| AppError::Yaml(e.to_string()))?;
    let yaml = yaml.trim_start_matches("---\n").trim_end_matches('\n');
    Ok(format!(
        "---\n{}\n---\n\n{}",
        yaml,
        body.trim_start_matches('\n')
    ))
}

/// 数据库行 → Article。
/// 将查询行映射为 `Article`。
///
/// 索引必须与 `ARTICLE_COLUMNS` 的列顺序严格一一对应（0 起）：
/// id=0, site_id=1, title=2, slug=3, file_path=4, content=5, excerpt=6, status=7,
/// categories=8, tags=9, cover_image=10, is_top=11, allow_comment=12, word_count=13,
/// created_at=14, updated_at=15, published_at=16
fn row_to_article(row: &rusqlite::Row<'_>) -> rusqlite::Result<Article> {
    let categories_raw: Option<String> = row.get(8)?;
    let tags_raw: Option<String> = row.get(9)?;

    Ok(Article {
        id: row.get(0)?,
        site_id: row.get(1)?,
        title: row.get(2)?,
        slug: row.get(3)?,
        file_path: row.get(4)?,
        content: row.get(5)?,
        excerpt: row.get(6)?,
        status: row
            .get::<_, Option<String>>(7)?
            .unwrap_or_else(|| "draft".into()),
        categories: categories_raw
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default(),
        tags: tags_raw
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default(),
        cover_image: row.get(10)?,
        is_top: row.get::<_, Option<i64>>(11)?.unwrap_or(0) != 0,
        allow_comment: row.get::<_, Option<i64>>(12)?.unwrap_or(1) != 0,
        word_count: row.get::<_, Option<i64>>(13)?.unwrap_or(0),
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
        published_at: row.get(16)?,
    })
}

const ARTICLE_COLUMNS: &str = "id, site_id, title, slug, file_path, content, excerpt, status, \
                               categories, tags, cover_image, is_top, allow_comment, word_count, \
                               created_at, updated_at, published_at";

/// 与 ScannedArticle 列表同步到数据库。
pub async fn sync_articles(db: &Db, site_id: i64, found: Vec<ScannedArticle>) -> AppResult<()> {
    let mut conn = db.conn()?;
    let tx = conn.transaction()?;

    // 现有记录映射：file_path -> id
    let mut existing: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    {
        let mut stmt = tx.prepare("SELECT id, file_path FROM articles WHERE site_id = ?1")?;
        let rows = stmt.query_map(params![site_id], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
        })?;
        for row in rows.flatten() {
            existing.insert(row.1, row.0);
        }
    }

    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    for art in &found {
        seen.insert(art.file_path.clone());
        let cats = serde_json::to_string(&art.categories).unwrap_or_else(|_| "[]".into());
        let tags = serde_json::to_string(&art.tags).unwrap_or_else(|_| "[]".into());

        if let Some(id) = existing.get(&art.file_path) {
            tx.execute(
                "UPDATE articles SET title=?2, slug=?3, content=?4, excerpt=?5, status=?6,
                    categories=?7, tags=?8, cover_image=?9, is_top=?10, allow_comment=?11,
                    word_count=?12, updated_at=?13, published_at=?14
                 WHERE id=?1",
                params![
                    id,
                    art.title,
                    art.slug,
                    art.content,
                    art.excerpt,
                    art.status,
                    cats,
                    tags,
                    art.cover_image,
                    art.is_top as i64,
                    art.allow_comment as i64,
                    art.word_count,
                    art.updated_at.clone().unwrap_or_else(now_utc),
                    art.published_at
                ],
            )?;
        } else {
            tx.execute(
                "INSERT INTO articles (site_id, title, slug, file_path, content, excerpt, status,
                    categories, tags, cover_image, is_top, allow_comment, word_count,
                    created_at, updated_at, published_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)",
                params![
                    site_id,
                    art.title,
                    art.slug,
                    art.file_path,
                    art.content,
                    art.excerpt,
                    art.status,
                    cats,
                    tags,
                    art.cover_image,
                    art.is_top as i64,
                    art.allow_comment as i64,
                    art.word_count,
                    art.created_at.clone().unwrap_or_else(now_utc),
                    art.updated_at.clone().unwrap_or_else(now_utc),
                    art.published_at
                ],
            )?;
        }
    }

    // 删除磁盘上已不存在的记录
    let stale: Vec<i64> = existing
        .iter()
        .filter(|(path, _)| !seen.contains(*path))
        .map(|(_, id)| *id)
        .collect();
    for id in stale {
        tx.execute("DELETE FROM articles WHERE id = ?1", params![id])?;
    }

    // 同步站点表的文章计数
    let article_count: i64 = tx.query_row(
        "SELECT COUNT(*) FROM articles WHERE site_id = ?1 AND status = 'published'",
        params![site_id],
        |r| r.get(0),
    )?;
    let draft_count: i64 = tx.query_row(
        "SELECT COUNT(*) FROM articles WHERE site_id = ?1 AND status = 'draft'",
        params![site_id],
        |r| r.get(0),
    )?;
    tx.execute(
        "UPDATE sites SET article_count = ?2, draft_count = ?3, updated_at = ?4 WHERE id = ?1",
        params![site_id, article_count, draft_count, now_utc()],
    )?;

    tx.commit()?;
    Ok(())
}

/// 根据站点 ID 取站点路径。
fn site_path_of(db: &Db, site_id: i64) -> AppResult<String> {
    let conn = db.conn()?;
    conn.query_row(
        "SELECT path FROM sites WHERE id = ?1",
        params![site_id],
        |r| r.get(0),
    )
    .map_err(|_| AppError::NotFound(format!("站点不存在：{}", site_id)))
}

/// 读取文章源文件并解析。
fn read_article_file(file_path: &str) -> AppResult<(Value, String)> {
    let content = std::fs::read_to_string(file_path)?;
    let (front, body) = split_front_matter(&content);
    Ok((front.unwrap_or_else(|| serde_json::json!({})), body))
}

// ==================== Tauri 命令 ====================

/// 新建文章。
#[tauri::command]
pub async fn create_article(
    state: State<'_, AppState>,
    site_id: i64,
    title: String,
    is_draft: Option<bool>,
    categories: Option<Vec<String>>,
    tags: Option<Vec<String>>,
) -> Result<Article, String> {
    let db = Db::from_arc(&state.db);
    create_article_impl(
        &db,
        site_id,
        &title,
        is_draft.unwrap_or(false),
        categories.unwrap_or_default(),
        tags.unwrap_or_default(),
    )
    .await
    .map_err(|e| e.to_string())
}

async fn create_article_impl(
    db: &Db,
    site_id: i64,
    title: &str,
    is_draft: bool,
    categories: Vec<String>,
    tags: Vec<String>,
) -> AppResult<Article> {
    let site_path = site_path_of(db, site_id)?;
    let slug = slugify(title);
    let slug = if slug.is_empty() {
        format!("post-{}", chrono::Utc::now().timestamp())
    } else {
        slug
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

    if is_draft {
        // 草稿通常不写 date
        if let Some(obj) = front.as_object_mut() {
            obj.remove("date");
        }
    }

    let body = format!("# {}\n\n", title);
    let content = build_front_matter(&front, &body)?;
    std::fs::write(&file_path, &content)?;

    let scanned = ScannedArticle {
        title: title.to_string(),
        slug: Some(slug),
        file_path: file_path.display().to_string(),
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
    };

    sync_articles(db, site_id, vec![scanned]).await?;

    let path_str = file_path.display().to_string();
    let conn = db.conn()?;
    let sql = format!(
        "SELECT {} FROM articles WHERE site_id = ?1 AND file_path = ?2",
        ARTICLE_COLUMNS
    );
    conn.query_row(&sql, params![site_id, path_str], row_to_article)
        .map_err(|e| match e {
            // 记录确实不存在
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound(format!("新建文章后未能读取记录：{}", file_path.display()))
            }
            // 其他错误（如列索引错位）保留原始信息，避免再次被误报为「记录不存在」
            other => AppError::Other(format!("读取新建文章记录失败：{}", other)),
        })
}

/// 获取文章列表（分页 + 过滤）。
#[tauri::command]
pub async fn get_articles(
    state: State<'_, AppState>,
    query: ArticleQuery,
) -> Result<PaginatedArticles, String> {
    let db = Db::from_arc(&state.db);
    get_articles_impl(&db, query)
        .await
        .map_err(|e| e.to_string())
}

async fn get_articles_impl(db: &Db, query: ArticleQuery) -> AppResult<PaginatedArticles> {
    let site_path = site_path_of(db, query.site_id)?;
    // 每次查询前同步磁盘，保证内容最新
    let _ = crate::commands::site_commands::rescan_articles(db, query.site_id, &site_path).await;

    let page = query.page.unwrap_or(1).max(1);
    let limit = query.limit.unwrap_or(20).clamp(1, 500);
    let offset = (page - 1) * limit;

    let mut where_clauses = vec!["site_id = ?1".to_string()];
    let mut binds: Vec<String> = vec![query.site_id.to_string()];

    if let Some(status) = query
        .status
        .as_ref()
        .filter(|s| !s.is_empty() && *s != "all")
    {
        binds.push(status.clone());
        where_clauses.push(format!("status = ?{}", binds.len()));
    }
    if let Some(cat) = query.category.as_ref().filter(|s| !s.is_empty()) {
        binds.push(format!("%\"{}\"%", cat));
        where_clauses.push(format!("categories LIKE ?{}", binds.len()));
    }
    if let Some(tag) = query.tag.as_ref().filter(|s| !s.is_empty()) {
        binds.push(format!("%\"{}\"%", tag));
        where_clauses.push(format!("tags LIKE ?{}", binds.len()));
    }
    if let Some(q) = query.query.as_ref().filter(|s| !s.trim().is_empty()) {
        binds.push(format!("%{}%", q.trim()));
        let idx = binds.len();
        where_clauses.push(format!("(title LIKE ?{0} OR content LIKE ?{0})", idx));
    }

    let where_sql = where_clauses.join(" AND ");
    let conn = db.conn()?;

    let total: i64 = {
        let sql = format!("SELECT COUNT(*) FROM articles WHERE {}", where_sql);
        let mut stmt = conn.prepare(&sql)?;
        let refs: Vec<&dyn rusqlite::ToSql> =
            binds.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
        stmt.query_row(refs.as_slice(), |r| r.get(0))?
    };

    let sql = format!(
        "SELECT {} FROM articles WHERE {} ORDER BY is_top DESC, COALESCE(published_at, created_at) DESC, id DESC LIMIT {} OFFSET {}",
        ARTICLE_COLUMNS, where_sql, limit, offset
    );
    let mut stmt = conn.prepare(&sql)?;
    let refs: Vec<&dyn rusqlite::ToSql> = binds.iter().map(|s| s as &dyn rusqlite::ToSql).collect();

    // 列表场景不返回全文，节省传输
    let items = stmt
        .query_map(refs.as_slice(), row_to_article)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(PaginatedArticles {
        items,
        total,
        page,
        limit,
    })
}

/// 获取单篇文章（含全文）。
#[tauri::command]
pub fn get_article(state: State<'_, AppState>, article_id: i64) -> Result<Article, String> {
    let db = &state.db;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let sql = format!("SELECT {} FROM articles WHERE id = ?1", ARTICLE_COLUMNS);
    let mut article: Article = conn
        .query_row(&sql, params![article_id], row_to_article)
        .map_err(|_| format!("文章不存在：{}", article_id))?;

    // 优先返回磁盘最新内容
    if let Ok((front, body)) = read_article_file(&article.file_path) {
        article.content = Some(body);
        if let Some(t) = front.get("title").and_then(|v| v.as_str()) {
            article.title = t.to_string();
        }
    }

    Ok(article)
}

/// 更新文章。
#[tauri::command]
pub async fn update_article(
    state: State<'_, AppState>,
    article_id: i64,
    updates: UpdateArticleInput,
) -> Result<Article, String> {
    let db = Db::from_arc(&state.db);
    update_article_impl(&db, article_id, updates)
        .await
        .map_err(|e| e.to_string())
}

async fn update_article_impl(
    db: &Db,
    article_id: i64,
    updates: UpdateArticleInput,
) -> AppResult<Article> {
    let (site_id, file_path, current_status) = {
        let conn = db.conn()?;
        conn.query_row(
            "SELECT site_id, file_path, status FROM articles WHERE id = ?1",
            params![article_id],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            },
        )
        .map_err(|_| AppError::NotFound(format!("文章不存在：{}", article_id)))?
    };

    let (mut front, _) = read_article_file(&file_path)?;
    if !front.is_object() {
        front = serde_json::json!({});
    }
    let body = updates.content.clone().unwrap_or_else(|| {
        read_article_file(&file_path)
            .map(|(_, b)| b)
            .unwrap_or_default()
    });

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
        obj.insert(
            "updated".into(),
            Value::String(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()),
        );
    }

    let new_content = build_front_matter(&front, &body)?;
    std::fs::write(&file_path, &new_content)?;

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
        published_at: if final_status == "published" {
            Some(now_utc())
        } else {
            None
        },
    };

    sync_articles(db, site_id, vec![scanned]).await?;

    let conn = db.conn()?;
    let sql = format!("SELECT {} FROM articles WHERE id = ?1", ARTICLE_COLUMNS);
    conn.query_row(&sql, params![article_id], row_to_article)
        .map_err(|_| AppError::NotFound("更新后未能读取文章".into()))
}

/// 删除文章（同时删除磁盘文件）。
#[tauri::command]
pub async fn delete_article(state: State<'_, AppState>, article_id: i64) -> Result<(), String> {
    let db = &state.db;
    let (site_id, file_path) = {
        let conn = db.conn().map_err(|e| e.to_string())?;
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
        let conn = db.conn().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM articles WHERE id = ?1", params![article_id])
            .map_err(|e| e.to_string())?;
    }

    // 同步站点计数
    if let Ok(site_path) = site_path_of(db, site_id) {
        let _ = crate::commands::site_commands::rescan_articles(db, site_id, &site_path).await;
    }

    Ok(())
}

/// 发布草稿（移动到 _posts 并写入 date）。
#[tauri::command]
pub async fn publish_article(
    state: State<'_, AppState>,
    article_id: i64,
) -> Result<Article, String> {
    publish_article_impl(&state.db, article_id, true)
        .await
        .map_err(|e| e.to_string())
}

/// 下架文章（移回 _drafts）。
#[tauri::command]
pub async fn unpublish_article(
    state: State<'_, AppState>,
    article_id: i64,
) -> Result<Article, String> {
    publish_article_impl(&state.db, article_id, false)
        .await
        .map_err(|e| e.to_string())
}

async fn publish_article_impl(db: &Db, article_id: i64, publish: bool) -> AppResult<Article> {
    let (site_id, file_path) = {
        let conn = db.conn()?;
        conn.query_row(
            "SELECT site_id, file_path FROM articles WHERE id = ?1",
            params![article_id],
            |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)),
        )
        .map_err(|_| AppError::NotFound(format!("文章不存在：{}", article_id)))?
    };

    let site_path = site_path_of(db, site_id)?;
    let src = std::path::Path::new(&file_path);
    if !src.exists() {
        return Err(AppError::PathNotFound(file_path.clone()));
    }

    let target_dir = if publish { "_posts" } else { "_drafts" };
    let dir = std::path::Path::new(&site_path)
        .join("source")
        .join(target_dir);
    std::fs::create_dir_all(&dir)?;

    let file_name = src
        .file_name()
        .ok_or_else(|| AppError::InvalidArgument("无法解析文件名".into()))?;
    let dst = dir.join(file_name);

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
    std::fs::write(&dst, content)?;
    if dst != src {
        std::fs::remove_file(src)?;
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
        .map_err(|_| AppError::NotFound("操作后未能读取文章".into()))
}

/// 新建草稿。
#[tauri::command]
pub async fn create_draft(
    state: State<'_, AppState>,
    site_id: i64,
    title: String,
) -> Result<Article, String> {
    let db = Db::from_arc(&state.db);
    create_article_impl(&db, site_id, &title, true, Vec::new(), Vec::new())
        .await
        .map_err(|e| e.to_string())
}

/// 批量导入 Markdown 文件。
#[tauri::command]
pub async fn import_articles(
    state: State<'_, AppState>,
    site_id: i64,
    files: Vec<String>,
) -> Result<Vec<Article>, String> {
    let db = Db::from_arc(&state.db);
    let db = &db;
    let site_path = site_path_of(db, site_id).map_err(|e| e.to_string())?;
    let posts_dir = std::path::Path::new(&site_path)
        .join("source")
        .join("_posts");
    std::fs::create_dir_all(&posts_dir).map_err(|e| e.to_string())?;

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
        .await
        .map_err(|e| e.to_string())?;

    // 返回新导入文章的记录
    let mut result = Vec::new();
    for path in imported {
        let (_, article_id) = {
            let conn = db.conn().map_err(|e| e.to_string())?;
            let id: Option<i64> = conn
                .query_row(
                    "SELECT id FROM articles WHERE site_id = ?1 AND file_path = ?2",
                    params![site_id, path],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            ((), id)
        };
        if let Some(id) = article_id {
            let conn = db.conn().map_err(|e| e.to_string())?;
            let sql = format!("SELECT {} FROM articles WHERE id = ?1", ARTICLE_COLUMNS);
            if let Ok(a) = conn.query_row(&sql, params![id], row_to_article) {
                result.push(a);
            }
        }
    }

    Ok(result)
}

/// 搜索文章（标题 + 正文）。
#[tauri::command]
pub async fn search_articles(
    state: State<'_, AppState>,
    site_id: i64,
    query: String,
) -> Result<Vec<Article>, String> {
    let db = Db::from_arc(&state.db);
    let q = ArticleQuery {
        site_id,
        query: Some(query),
        limit: Some(100),
        ..Default::default()
    };
    get_articles_impl(&db, q)
        .await
        .map(|p| p.items)
        .map_err(|e| e.to_string())
}

/// 获取分类列表（含文章数）。
#[tauri::command]
pub async fn get_categories(
    state: State<'_, AppState>,
    site_id: i64,
) -> Result<Vec<Category>, String> {
    let db = &state.db;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT categories FROM articles WHERE site_id = ?1 AND categories IS NOT NULL")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![site_id], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    let mut counter: std::collections::BTreeMap<String, i64> = std::collections::BTreeMap::new();
    for raw in rows.flatten() {
        if let Ok(list) = serde_json::from_str::<Vec<String>>(&raw) {
            for name in list {
                *counter.entry(name).or_insert(0) += 1;
            }
        }
    }

    Ok(counter
        .into_iter()
        .map(|(name, count)| Category { name, count })
        .collect())
}

/// 获取标签列表（含文章数）。
#[tauri::command]
pub async fn get_tags(state: State<'_, AppState>, site_id: i64) -> Result<Vec<Tag>, String> {
    let db = &state.db;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT tags FROM articles WHERE site_id = ?1 AND tags IS NOT NULL")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![site_id], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    let mut counter: std::collections::BTreeMap<String, i64> = std::collections::BTreeMap::new();
    for raw in rows.flatten() {
        if let Ok(list) = serde_json::from_str::<Vec<String>>(&raw) {
            for name in list {
                *counter.entry(name).or_insert(0) += 1;
            }
        }
    }

    Ok(counter
        .into_iter()
        .map(|(name, count)| Tag { name, count })
        .collect())
}

/// 重命名分类（批量更新所有文章的 Front Matter）。
#[tauri::command]
pub async fn rename_category(
    state: State<'_, AppState>,
    site_id: i64,
    old_name: String,
    new_name: String,
) -> Result<i64, String> {
    let db = Db::from_arc(&state.db);
    rename_taxonomy(&db, site_id, "categories", &old_name, &new_name)
        .await
        .map_err(|e| e.to_string())
}

/// 重命名标签。
#[tauri::command]
pub async fn rename_tag(
    state: State<'_, AppState>,
    site_id: i64,
    old_name: String,
    new_name: String,
) -> Result<i64, String> {
    let db = Db::from_arc(&state.db);
    rename_taxonomy(&db, site_id, "tags", &old_name, &new_name)
        .await
        .map_err(|e| e.to_string())
}

async fn rename_taxonomy(
    db: &Db,
    site_id: i64,
    field: &str,
    old_name: &str,
    new_name: &str,
) -> AppResult<i64> {
    let site_path = site_path_of(db, site_id)?;
    let files: Vec<String> = {
        let conn = db.conn()?;
        let mut stmt = conn.prepare("SELECT file_path FROM articles WHERE site_id = ?1")?;
        let rows = stmt.query_map(params![site_id], |r| r.get::<_, String>(0))?;
        rows.collect::<Result<Vec<_>, _>>()?
    };

    let mut changed = 0i64;
    for file in files {
        let (mut front, body) = match read_article_file(&file) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if !front.is_object() {
            continue;
        }

        let mut modified = false;
        if let Some(obj) = front.as_object_mut() {
            if let Some(val) = obj.get_mut(field) {
                let list = to_string_list(val);
                if list.iter().any(|s| s == old_name) {
                    let new_list: Vec<Value> = list
                        .into_iter()
                        .map(|s| {
                            Value::String(if s == old_name {
                                new_name.to_string()
                            } else {
                                s
                            })
                        })
                        .collect();
                    *val = Value::Array(new_list);
                    modified = true;
                }
            }
        }

        if modified {
            if let Ok(content) = build_front_matter(&front, &body) {
                if std::fs::write(&file, content).is_ok() {
                    changed += 1;
                }
            }
        }
    }

    if changed > 0 {
        crate::commands::site_commands::rescan_articles(db, site_id, &site_path).await?;
    }

    Ok(changed)
}

/// 删除分类（从所有文章的 Front Matter 中移除）。
#[tauri::command]
pub async fn delete_category(
    state: State<'_, AppState>,
    site_id: i64,
    name: String,
) -> Result<i64, String> {
    let db = Db::from_arc(&state.db);
    delete_taxonomy(&db, site_id, "categories", &name)
        .await
        .map_err(|e| e.to_string())
}

/// 删除标签。
#[tauri::command]
pub async fn delete_tag(
    state: State<'_, AppState>,
    site_id: i64,
    name: String,
) -> Result<i64, String> {
    let db = Db::from_arc(&state.db);
    delete_taxonomy(&db, site_id, "tags", &name)
        .await
        .map_err(|e| e.to_string())
}

async fn delete_taxonomy(db: &Db, site_id: i64, field: &str, name: &str) -> AppResult<i64> {
    let site_path = site_path_of(db, site_id)?;
    let files: Vec<String> = {
        let conn = db.conn()?;
        let mut stmt = conn.prepare("SELECT file_path FROM articles WHERE site_id = ?1")?;
        let rows = stmt.query_map(params![site_id], |r| r.get::<_, String>(0))?;
        rows.collect::<Result<Vec<_>, _>>()?
    };

    let mut changed = 0i64;
    for file in files {
        let (mut front, body) = match read_article_file(&file) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if !front.is_object() {
            continue;
        }

        let mut modified = false;
        if let Some(obj) = front.as_object_mut() {
            if let Some(val) = obj.get_mut(field) {
                let list = to_string_list(val);
                if list.iter().any(|s| s == name) {
                    let new_list: Vec<Value> = list
                        .into_iter()
                        .filter(|s| s != name)
                        .map(Value::String)
                        .collect();
                    *val = Value::Array(new_list);
                    modified = true;
                }
            }
        }

        if modified {
            if let Ok(content) = build_front_matter(&front, &body) {
                if std::fs::write(&file, content).is_ok() {
                    changed += 1;
                }
            }
        }
    }

    if changed > 0 {
        crate::commands::site_commands::rescan_articles(db, site_id, &site_path).await?;
    }

    Ok(changed)
}

/// 获取文章的历史版本（基于 Git 提交记录）。
#[tauri::command]
pub async fn get_article_history(
    state: State<'_, AppState>,
    article_id: i64,
    limit: Option<i64>,
) -> Result<Vec<crate::models::CommitLog>, String> {
    let db = Db::from_arc(&state.db);
    let db = &db;
    let (site_id, file_path) = {
        let conn = db.conn().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT site_id, file_path FROM articles WHERE id = ?1",
            params![article_id],
            |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)),
        )
        .map_err(|_| format!("文章不存在：{}", article_id))?
    };

    let site_path = site_path_of(db, site_id).map_err(|e| e.to_string())?;
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
    let format = "--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%ai%x1f%s";
    let out = crate::utils::process::run(
        "git",
        &["log", format, "-n", &n, "--", &rel],
        Some(root),
        Some(60),
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut logs = Vec::new();
    for line in out.stdout.lines() {
        let parts: Vec<&str> = line.split('\u{1f}').collect();
        if parts.len() < 6 {
            continue;
        }
        logs.push(crate::models::CommitLog {
            hash: parts[0].to_string(),
            short_hash: parts[1].to_string(),
            author: parts[2].to_string(),
            email: parts[3].to_string(),
            date: parts[4].to_string(),
            message: parts[5].to_string(),
        });
    }

    Ok(logs)
}

/// 读取指定提交版本的文章内容。
#[tauri::command]
pub async fn get_article_at_commit(
    state: State<'_, AppState>,
    article_id: i64,
    commit_hash: String,
) -> Result<String, String> {
    let db = Db::from_arc(&state.db);
    let db = &db;
    let (site_id, file_path) = {
        let conn = db.conn().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT site_id, file_path FROM articles WHERE id = ?1",
            params![article_id],
            |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)),
        )
        .map_err(|_| format!("文章不存在：{}", article_id))?
    };

    let site_path = site_path_of(db, site_id).map_err(|e| e.to_string())?;
    let root = std::path::Path::new(&site_path);
    let rel = std::path::Path::new(&file_path)
        .strip_prefix(root)
        .map(|p| p.display().to_string())
        .unwrap_or(file_path);

    let spec = format!("{}:{}", commit_hash, rel);
    let out = crate::utils::process::run("git", &["show", &spec], Some(root), Some(60))
        .await
        .map_err(|e| e.to_string())?;

    if !out.success {
        return Err(format!("读取历史版本失败：{}", out.combined()));
    }

    Ok(out.stdout)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    /// 建一张与迁移脚本一致的 articles 表，保证测试贴近真实 schema。
    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().expect("内存数据库");
        conn.execute_batch(
            "CREATE TABLE articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                site_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                slug TEXT,
                file_path TEXT NOT NULL,
                content TEXT,
                excerpt TEXT,
                status TEXT DEFAULT 'draft',
                categories TEXT,
                tags TEXT,
                cover_image TEXT,
                is_top INTEGER DEFAULT 0,
                allow_comment INTEGER DEFAULT 1,
                word_count INTEGER DEFAULT 0,
                created_at TEXT,
                updated_at TEXT,
                published_at TEXT
            );",
        )
        .expect("建表");
        conn
    }

    fn insert_sample(conn: &Connection) {
        conn.execute(
            "INSERT INTO articles (site_id, title, slug, file_path, content, excerpt, status,
                categories, tags, cover_image, is_top, allow_comment, word_count,
                created_at, updated_at, published_at)
             VALUES (1, '测试标题', 'hello', '/site/source/_posts/hello.md', '# 正文', '摘要',
                'published', '[\"分类A\"]', '[\"标签B\"]', '/img/cover.png', 1, 1, 42,
                '2026-10-01 10:00:00', '2026-10-01 11:00:00', '2026-10-01 10:00:00')",
            [],
        )
        .expect("插入样例");
    }

    /// 回归锁：`row_to_article` 的索引必须与 `ARTICLE_COLUMNS` 的列序严格对齐。
    ///
    /// 历史 bug：categories 起全部错位一格，published_at 读到索引 17（越界），
    /// 使所有文章读取失败并被 `.map_err(NotFound)` 伪装成「记录不存在」。
    #[test]
    fn test_row_to_article_index_alignment() {
        let conn = setup_db();
        insert_sample(&conn);

        let sql = format!(
            "SELECT {} FROM articles WHERE site_id = ?1 AND file_path = ?2",
            ARTICLE_COLUMNS
        );

        let article = conn
            .query_row(
                &sql,
                params![1i64, "/site/source/_posts/hello.md"],
                row_to_article,
            )
            .expect("映射文章行失败（列索引错位？）");

        // 逐字段校验，任一错位都会被断言捕获
        assert_eq!(article.id, 1);
        assert_eq!(article.site_id, 1);
        assert_eq!(article.title, "测试标题");
        assert_eq!(article.slug.as_deref(), Some("hello"));
        assert_eq!(article.file_path, "/site/source/_posts/hello.md");
        assert_eq!(article.content.as_deref(), Some("# 正文"));
        assert_eq!(article.excerpt.as_deref(), Some("摘要"));
        assert_eq!(article.status, "published");
        assert_eq!(article.categories, vec!["分类A".to_string()]);
        assert_eq!(article.tags, vec!["标签B".to_string()]);
        assert_eq!(article.cover_image.as_deref(), Some("/img/cover.png"));
        assert!(article.is_top);
        assert!(article.allow_comment);
        assert_eq!(article.word_count, 42);
        assert_eq!(article.created_at.as_deref(), Some("2026-10-01 10:00:00"));
        assert_eq!(article.updated_at.as_deref(), Some("2026-10-01 11:00:00"));
        assert_eq!(article.published_at.as_deref(), Some("2026-10-01 10:00:00"));
    }

    /// 列数与索引上限自检：17 列 → 最大合法索引 16。
    #[test]
    fn test_article_columns_count() {
        let count = ARTICLE_COLUMNS.split(',').count();
        assert_eq!(
            count, 17,
            "ARTICLE_COLUMNS 列数变化，需同步 row_to_article 索引"
        );
        // 若索引超出 count-1，rusqlite 会返回 InvalidColumnIndex
        let conn = setup_db();
        insert_sample(&conn);
        let sql = format!("SELECT {} FROM articles", ARTICLE_COLUMNS);
        let mut stmt = conn.prepare(&sql).expect("预编译");
        let mut rows = stmt.query([]).expect("查询");
        let row = rows.next().expect("取行").expect("行存在");
        // 逐一访问全部索引，越界会在此抛出
        for i in 0..count {
            let _ = row.get::<_, Option<String>>(i);
        }
    }
}
