//! 文章表访问层（扫描结果的落库与整站对账）。
//!
//! 这里集中了「磁盘 → 数据库」的写入语义，是整个应用最容易出数据问题的部分：
//! - [`upsert_article`] 只写单篇，**绝不删除**其他行；
//! - [`reconcile_site`] 才做全站对账（按磁盘实际状态删除）。
//!
//! 两者分开，是修掉「保存一篇文章后同站点其他文章的行被删、ID 漂移」的关键。

use crate::db::Db;
use crate::models::Article;
use crate::utils::error::AppResult;
use crate::utils::now_utc;
use rusqlite::{params, OptionalExtension};

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
    /// 文件指纹：mtime（纳秒）与字节数，供扫描时跳过未变化的文件
    pub file_mtime: Option<i64>,
    pub file_size: Option<i64>,
}

/// 读取文件的指纹（mtime 纳秒 + 字节数）。文件不可读时返回 `(None, None)`。
pub fn file_stamp(path: &str) -> (Option<i64>, Option<i64>) {
    let Ok(meta) = std::fs::metadata(path) else {
        return (None, None);
    };
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_nanos() as i64);
    (mtime, Some(meta.len() as i64))
}

/// 数据库行 → Article。
/// 将查询行映射为 `Article`。
///
/// 索引必须与 `ARTICLE_COLUMNS` 的列顺序严格一一对应（0 起）：
/// id=0, site_id=1, title=2, slug=3, file_path=4, content=5, excerpt=6, status=7,
/// categories=8, tags=9, cover_image=10, is_top=11, allow_comment=12, word_count=13,
/// created_at=14, updated_at=15, published_at=16
pub(crate) fn row_to_article(row: &rusqlite::Row<'_>) -> rusqlite::Result<Article> {
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

pub(crate) const ARTICLE_COLUMNS: &str =
    "id, site_id, title, slug, file_path, content, excerpt, status, \
                               categories, tags, cover_image, is_top, allow_comment, word_count, \
                               created_at, updated_at, published_at";

/// 列表场景的列：与 [`ARTICLE_COLUMNS`] 完全同构，但 `content` 用 `NULL` 占位。
///
/// 这样 `row_to_article` 的索引无需第二套映射（少一处错位风险），同时列表不再
/// 传全文 —— 500 篇文章的正文经 IPC JSON 序列化是数量级的浪费。
pub(crate) const ARTICLE_LIST_COLUMNS: &str =
    "id, site_id, title, slug, file_path, NULL, excerpt, status, \
                               categories, tags, cover_image, is_top, allow_comment, word_count, \
                               created_at, updated_at, published_at";

/// 写入单篇文章的行（存在则 UPDATE，不存在则 INSERT），返回文章 ID。
///
/// 只碰 `art.file_path` 这一行，**不会删除**同站点的其他记录。
pub(crate) fn write_article_row(
    tx: &rusqlite::Transaction<'_>,
    site_id: i64,
    art: &ScannedArticle,
    existing_id: Option<i64>,
) -> AppResult<i64> {
    let cats = serde_json::to_string(&art.categories).unwrap_or_else(|_| "[]".into());
    let tags = serde_json::to_string(&art.tags).unwrap_or_else(|_| "[]".into());

    if let Some(id) = existing_id {
        tx.execute(
            "UPDATE articles SET title=?2, slug=?3, content=?4, excerpt=?5, status=?6,
                categories=?7, tags=?8, cover_image=?9, is_top=?10, allow_comment=?11,
                word_count=?12, updated_at=?13, published_at=?14, file_mtime=?15, file_size=?16
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
                art.published_at,
                art.file_mtime,
                art.file_size
            ],
        )?;
        Ok(id)
    } else {
        tx.execute(
            "INSERT INTO articles (site_id, title, slug, file_path, content, excerpt, status,
                categories, tags, cover_image, is_top, allow_comment, word_count,
                created_at, updated_at, published_at, file_mtime, file_size)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)",
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
                art.published_at,
                art.file_mtime,
                art.file_size
            ],
        )?;
        Ok(tx.last_insert_rowid())
    }
}

/// 重算并回写站点的文章计数。
///
/// 只有计数真正变化时才更新 `sites.updated_at`：此前无条件刷新会让站点列表
/// 按 `updated_at DESC` 排序的结果随「刚打开过哪个站点」而变动。
pub(crate) fn refresh_site_counts(tx: &rusqlite::Transaction<'_>, site_id: i64) -> AppResult<()> {
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

    let prev: Option<(Option<i64>, Option<i64>)> = tx
        .query_row(
            "SELECT article_count, draft_count FROM sites WHERE id = ?1",
            params![site_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;

    match prev {
        // 站点行不存在（测试库或已被删除）：没有可同步的对象
        None => Ok(()),
        Some((Some(a), Some(d))) if a == article_count && d == draft_count => Ok(()),
        Some(_) => {
            tx.execute(
                "UPDATE sites SET article_count = ?2, draft_count = ?3, updated_at = ?4 WHERE id = ?1",
                params![site_id, article_count, draft_count, now_utc()],
            )?;
            Ok(())
        }
    }
}

/// 把「单篇」文章写回数据库，**绝不删除**同站点的其他记录。
///
/// 供新建 / 保存文章后的增量回写使用。需要让整库与磁盘对账（清理已被外部删除的
/// 文件）时必须显式调用 [`reconcile_site`]。
///
/// 历史 bug：新建/保存曾复用「全量对账」实现并只传一篇，导致同站点其他文章的行
/// 被当作「磁盘上已删除」而 DELETE —— 分类/标签列表随之塌缩，下次全量扫描又让这些
/// 文章以新的自增 ID 回来（ID 漂移，编辑器里持有的旧 ID 全部失效）。
pub async fn upsert_article(db: &Db, site_id: i64, art: ScannedArticle) -> AppResult<i64> {
    let mut conn = db.conn()?;
    let tx = conn.transaction()?;

    let existing: Option<i64> = tx
        .query_row(
            "SELECT id FROM articles WHERE site_id = ?1 AND file_path = ?2",
            params![site_id, art.file_path],
            |r| r.get(0),
        )
        .optional()?;

    let id = write_article_row(&tx, site_id, &art, existing)?;
    refresh_site_counts(&tx, site_id)?;
    tx.commit()?;
    Ok(id)
}

/// 整站对账：写入 `found` 中的文章，并删除**磁盘上已不存在**的记录。
///
/// `found` 可以只是「本次扫描发现内容有变化的文章」——是否需要删除按磁盘实际状态
/// 判断（`file_path` 已不存在才删），因此跳过未变化的文件不会误删它们的行。
///
/// 只应在「整站扫描」时调用（手动刷新、站点切换、导入后）。单篇文章的
/// 新建/保存必须用 [`upsert_article`]，否则会误删其他文章的行。
pub async fn reconcile_site(db: &Db, site_id: i64, found: Vec<ScannedArticle>) -> AppResult<()> {
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

    for art in &found {
        write_article_row(&tx, site_id, art, existing.get(&art.file_path).copied())?;
    }

    // 只清理「文件真的没了」的记录：读失败/解析失败的文件保留旧数据，
    // 不能因为一次扫描的问题把用户的文章行删掉
    for (path, id) in existing.iter() {
        if !std::path::Path::new(path).exists() {
            tx.execute("DELETE FROM articles WHERE id = ?1", params![id])?;
        }
    }

    refresh_site_counts(&tx, site_id)?;
    tx.commit()?;
    Ok(())
}
