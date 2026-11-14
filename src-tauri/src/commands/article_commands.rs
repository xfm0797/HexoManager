//! 文章管理命令（对外门面）。
//!
//! 这个文件曾承载全部文章相关命令（1703 行），职责混杂：CRUD、发布流程、
//! 分类标签统计、Front Matter 编解码、整站对账挤在一起。现在按职责拆到
//! `commands/articles/` 下的子模块：
//!
//! | 模块 | 职责 |
//! |---|---|
//! | `query` | 分页列表、单篇详情、全文搜索（全部只读库） |
//! | `crud` | 新建、更新、删除、批量导入 |
//! | `publish` | 草稿发布 / 下架 / 新建草稿（含同名文件避让） |
//! | `taxonomy` | 分类与标签的统计、重命名、删除 |
//! | `store` | 文章数据层：扫描结果结构、列常量、单篇回写、整站对账 |
//! | `front_matter` | Front Matter 的拆分与拼装 |
//! | `history` | 基于 git 的历史版本读取 |
//!
//! 本文件只做 re-export，让 `commands::article_commands::xxx` 这类既有引用
//! 路径继续可用。**注意**：`#[tauri::command]` 生成的宏不会被 `pub use` 带出去，
//! 所以 `lib.rs` 的命令注册必须写真实路径（`commands::articles::crud::create_article`），
//! 否则会报 `__cmd__xxx` 找不到。

pub use crate::commands::articles::crud::{
    create_article, delete_article, import_articles, update_article,
};
pub use crate::commands::articles::publish::{create_draft, publish_article, unpublish_article};
pub use crate::commands::articles::query::{get_article, get_articles, search_articles};
pub use crate::commands::articles::taxonomy::{
    delete_category, delete_tag, get_categories, get_tags, rename_category, rename_tag,
};

// 数据层与 Front Matter 辅助：站点扫描、模板套用等模块直接复用
pub use crate::commands::articles::store::{reconcile_site, upsert_article, ScannedArticle};
pub(crate) use crate::commands::articles::front_matter::{
    build_front_matter, read_article_file, split_front_matter, to_string_list,
};
pub(crate) use crate::commands::articles::store::{row_to_article, ARTICLE_COLUMNS};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::articles::query::get_articles_impl;
    use crate::db::Db;
    use crate::models::ArticleQuery;
    use rusqlite::{params, Connection};

    /// 建一张与迁移脚本一致的 articles 表，保证测试贴近真实 schema。
    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().expect("内存数据库");
        conn.execute_batch(
            "CREATE TABLE sites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                domain TEXT,
                path TEXT NOT NULL UNIQUE,
                node_version TEXT DEFAULT 'system',
                theme TEXT DEFAULT 'landscape',
                status TEXT DEFAULT 'active',
                article_count INTEGER DEFAULT 0,
                draft_count INTEGER DEFAULT 0,
                last_deploy_at TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE articles (
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
                published_at TEXT,
                file_mtime INTEGER,
                file_size INTEGER
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

    // ==================== 同步语义回归锁 ====================

    use std::sync::{Arc, Mutex};

    fn db_from(conn: Connection) -> Db {
        Db(Arc::new(Mutex::new(conn)))
    }

    fn seed_article(conn: &Connection, path: &str, title: &str) -> i64 {
        conn.execute(
            "INSERT INTO articles (site_id, title, slug, file_path, content, status,
                categories, tags, is_top, allow_comment, word_count, created_at, updated_at, published_at)
             VALUES (1, ?1, NULL, ?2, '# 正文', 'published', '[\"分类A\"]', '[\"标签B\"]', 0, 1, 10,
                '2026-01-01 00:00:00', '2026-01-01 00:00:00', '2026-01-01 00:00:00')",
            params![title, path],
        )
        .expect("插入文章");
        conn.last_insert_rowid()
    }

    fn scanned_at(path: &str, title: &str) -> ScannedArticle {
        ScannedArticle {
            title: title.to_string(),
            slug: None,
            file_path: path.to_string(),
            content: "# 正文".into(),
            excerpt: None,
            status: "published".into(),
            categories: vec!["分类A".into()],
            tags: vec!["标签B".into()],
            cover_image: None,
            is_top: false,
            allow_comment: true,
            word_count: 10,
            created_at: Some("2026-01-01 00:00:00".into()),
            updated_at: Some("2026-01-02 00:00:00".into()),
            published_at: Some("2026-01-01 00:00:00".into()),
            file_mtime: None,
            file_size: None,
        }
    }

    /// 回归锁：单篇 upsert 只能改这一篇，同站点其他文章的行与 ID 必须原样保留。
    ///
    /// 历史 bug：新建/保存走的是「全量对账」，只传一篇 → 其余文章被 DELETE，
    /// 分类/标签列表瞬间塌缩，下次扫描又以新 ID 重新插入（ID 漂移）。
    #[tokio::test]
    async fn test_upsert_article_keeps_sibling_rows() {
        let conn = setup_db();
        let a = seed_article(&conn, "/site/source/_posts/a.md", "A");
        let b = seed_article(&conn, "/site/source/_posts/b.md", "B");
        let c = seed_article(&conn, "/site/source/_posts/c.md", "C");
        let db = db_from(conn);

        let updated_id = upsert_article(&db, 1, scanned_at("/site/source/_posts/a.md", "A-改"))
            .await
            .expect("upsert 失败");

        assert_eq!(updated_id, a, "同一 file_path 必须复用原有 ID");

        let conn = db.conn().unwrap();
        let rows: Vec<(i64, String, String)> = {
            let mut stmt = conn
                .prepare("SELECT id, file_path, title FROM articles ORDER BY id")
                .unwrap();
            let it = stmt
                .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
                .unwrap();
            it.flatten().collect()
        };

        assert_eq!(rows.len(), 3, "其他文章的行不能被删除：{:?}", rows);
        assert_eq!(
            rows.iter().map(|r| r.0).collect::<Vec<_>>(),
            vec![a, b, c],
            "文章 ID 不能漂移"
        );
        assert_eq!(rows[0].2, "A-改", "被 upsert 的那篇应更新");
    }

    /// `reconcile_site` 保留「整站对账」语义：文件真的不在磁盘上了才清理对应记录。
    #[tokio::test]
    async fn test_reconcile_site_removes_missing_rows() {
        let dir = std::env::temp_dir().join(format!(
            "hexo-mgr-reconcile-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("建临时目录");
        let keep_path = dir.join("keep.md");
        let gone_path = dir.join("gone.md");
        std::fs::write(&keep_path, "---\ntitle: 保留\n---\n\n# 保留\n").expect("写文件");
        std::fs::write(&gone_path, "---\ntitle: 已删除\n---\n\n# 已删除\n").expect("写文件");

        let conn = setup_db();
        let keep = seed_article(&conn, keep_path.to_str().unwrap(), "保留");
        seed_article(&conn, gone_path.to_str().unwrap(), "已删除");
        let db = db_from(conn);

        // 模拟外部删除后重新扫描：found 只含仍在磁盘上的那篇
        std::fs::remove_file(&gone_path).expect("删除临时文件");
        reconcile_site(
            &db,
            1,
            vec![scanned_at(keep_path.to_str().unwrap(), "保留")],
        )
        .await
        .expect("对账失败");

        let conn = db.conn().unwrap();
        let ids: Vec<i64> = {
            let mut stmt = conn.prepare("SELECT id FROM articles").unwrap();
            let it = stmt.query_map([], |r| r.get::<_, i64>(0)).unwrap();
            it.flatten().collect()
        };
        assert_eq!(ids, vec![keep], "磁盘上已不存在的记录应被删除");
        drop(conn);

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 读接口不再隐式扫描：`get_articles_impl` 必须只读库。
    ///
    /// 用「库里没人、磁盘上有文件」的场景锁定行为：若哪次把 rescan 加回来，
    /// 这里的 total 会变成 1 而不是 0。
    #[tokio::test]
    async fn test_get_articles_does_not_touch_disk() {
        let dir = std::env::temp_dir().join(format!(
            "hexo-mgr-list-only-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("source").join("_posts")).expect("建目录");
        std::fs::write(dir.join("source").join("_posts").join("x.md"), "# x\n").expect("写文件");

        let conn = setup_db();
        conn.execute(
            "INSERT INTO sites (id, name, path) VALUES (1, '测试站', ?1)",
            params![dir.to_str().unwrap()],
        )
        .expect("插入站点");
        let db = db_from(conn);

        let page = get_articles_impl(
            &db,
            ArticleQuery {
                site_id: 1,
                ..Default::default()
            },
        )
        .await
        .expect("读取文章列表失败");

        assert_eq!(page.total, 0, "列表接口不应触发磁盘扫描");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
