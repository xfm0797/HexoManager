//! 数据访问小工具：跨命令模块共用的查询。
//!
//! 这些查询此前在 5 个模块里各写了一份（`article` / `config` / `git` / `hexo` /
//! `theme`），实现完全相同。复制出来的版本一旦分叉，就会出现「某个命令对不存在的
//! 站点返回 Not Found、另一个返回空字符串」这类不一致。

use crate::db::Db;
use crate::utils::error::{AppError, AppResult};
use rusqlite::params;

/// 取站点根目录（失败即「站点不存在」）。
pub fn site_path_of(db: &Db, site_id: i64) -> AppResult<String> {
    let conn = db.conn()?;
    conn.query_row(
        "SELECT path FROM sites WHERE id = ?1",
        params![site_id],
        |r| r.get(0),
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::coded(
            "site.not_found",
            format!("站点不存在：{}", site_id),
            &[("id", site_id.to_string())],
        ),
        other => AppError::coded(
            "db.site_path_read_failed",
            format!("读取站点路径失败：{}", other),
            &[("detail", other.to_string())],
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::{Arc, Mutex};

    fn db() -> Db {
        let conn = Connection::open_in_memory().expect("内存数据库");
        conn.execute_batch("CREATE TABLE sites (id INTEGER PRIMARY KEY, path TEXT NOT NULL);")
            .expect("建表");
        conn.execute("INSERT INTO sites (id, path) VALUES (1, '/srv/blog')", [])
            .expect("插入");
        Db(Arc::new(Mutex::new(conn)))
    }

    #[test]
    fn test_site_path_of_ok() {
        assert_eq!(site_path_of(&db(), 1).unwrap(), "/srv/blog");
    }

    #[test]
    fn test_site_path_of_missing_site() {
        let err = site_path_of(&db(), 99).unwrap_err();
        // 断言**稳定错误码**而不是枚举变体：前端按 code 取译文，这个值就是对外的契约
        assert_eq!(
            err.code(),
            "site.not_found",
            "站点不存在必须带稳定码，前端才能区分「没选站点」与「读表失败」"
        );
        assert!(
            err.message().contains("站点不存在：99"),
            "中文原文要保留 id，日志与诊断导出靠它定位"
        );
    }
}
