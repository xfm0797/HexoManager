//! 文章查询命令：分页列表、单篇详情、全文搜索。
//!
//! 三个命令都**只读数据库**：磁盘同步由 `refresh_articles` 显式触发，
//! 否则每次翻页都要遍历全站 markdown（500 篇 ≈ 500 次读盘 + YAML 解析）。

use crate::commands::articles::front_matter::read_article_file;
use crate::commands::articles::store::{row_to_article, ARTICLE_COLUMNS, ARTICLE_LIST_COLUMNS};
use crate::db::Db;
use crate::models::{Article, ArticleQuery, PaginatedArticles};
use crate::utils::error::{AppError, AppResult};
use crate::AppState;
use rusqlite::params;
use tauri::State;

/// 获取文章列表（分页 + 过滤）。
#[tauri::command]
pub async fn get_articles(
    state: State<'_, AppState>,
    query: ArticleQuery,
) -> AppResult<PaginatedArticles> {
    let db = Db::from_arc(&state.db);
    get_articles_impl(&db, query).await
}

pub(crate) async fn get_articles_impl(db: &Db, query: ArticleQuery) -> AppResult<PaginatedArticles> {
    // 只读库：扫描由「刷新」按钮 / 站点切换 / 导入后显式触发（refresh_articles）。
    // 此前每次翻页都做全站扫描（500 篇 ≈ 500 次文件读 + YAML 解析 + 全表 UPDATE）。

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
        ARTICLE_LIST_COLUMNS, where_sql, limit, offset
    );
    let mut stmt = conn.prepare(&sql)?;
    let refs: Vec<&dyn rusqlite::ToSql> = binds.iter().map(|s| s as &dyn rusqlite::ToSql).collect();

    // 列表不返回全文：正文只在打开编辑器时通过 get_article 取
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
pub fn get_article(state: State<'_, AppState>, article_id: i64) -> AppResult<Article> {
    let db = &state.db;
    let conn = db.conn()?;
    let sql = format!("SELECT {} FROM articles WHERE id = ?1", ARTICLE_COLUMNS);
    let mut article: Article = conn.query_row(&sql, params![article_id], row_to_article).map_err(
        |e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::coded(
                "article.not_found",
                format!("文章不存在：{}", article_id),
                &[("id", article_id.to_string())],
            ),
            other => AppError::Database(other),
        },
    )?;

    // 优先返回磁盘最新内容
    if let Ok((front, body)) = read_article_file(&article.file_path) {
        article.content = Some(body);
        if let Some(t) = front.get("title").and_then(|v| v.as_str()) {
            article.title = t.to_string();
        }
    }

    Ok(article)
}

/// 搜索文章（标题 + 正文）。
#[tauri::command]
pub async fn search_articles(
    state: State<'_, AppState>,
    site_id: i64,
    query: String,
) -> AppResult<Vec<Article>> {
    let db = Db::from_arc(&state.db);
    let q = ArticleQuery {
        site_id,
        query: Some(query),
        limit: Some(100),
        ..Default::default()
    };
    get_articles_impl(&db, q).await.map(|p| p.items)
}
