//! 建表迁移脚本。
//!
//! 字段与开发大纲第五章「数据库设计」逐字段对齐。
//!
//! 采用 `PRAGMA user_version` 记录已应用的结构版本：`SCHEMA_SQL` 只是**基线**
//! （全部 `CREATE TABLE IF NOT EXISTS`），之后任何结构变更（新增列、补索引）
//! 都必须以「追加一步」的方式写进 [`MIGRATIONS`]，而不是改基线 —— 老库不会重建表，
//! 改基线对它完全无效。

use crate::utils::error::AppResult;
use rusqlite::Connection;

/// 结构变更步骤：`(目标版本号, SQL)`，版本号从 1 起严格递增。
///
/// 每一步都要求「可整体成功或整体失败」：在事务里执行 SQL 并同时写入
/// `user_version`，因此中途失败不会留下半应用的 schema。
const MIGRATIONS: &[(i64, &str)] = &[
    // v1：记录文章文件指纹（mtime 纳秒 + 字节数）。
    // 扫描时 stat 一致就跳过读文件与 YAML 解析，让全站扫描从 O(内容) 降到 O(stat)。
    (
        1,
        r#"
ALTER TABLE articles ADD COLUMN file_mtime INTEGER;
ALTER TABLE articles ADD COLUMN file_size INTEGER;
"#,
    ),
    // v2：部署配置记住「分支」与「输出目录」——此前生成 workflow 时硬编码 main/public，
    // 主分支叫 master 的站点会生成一个永不触发的 Actions 配置。
    (
        2,
        r#"
ALTER TABLE deploy_configs ADD COLUMN branch TEXT DEFAULT 'main';
ALTER TABLE deploy_configs ADD COLUMN output_dir TEXT DEFAULT 'public';
"#,
    ),
];

/// 当前代码期望的结构版本（最后一步的版本号）。
pub fn latest_version() -> i64 {
    MIGRATIONS.last().map(|(v, _)| *v).unwrap_or(0)
}

/// 执行全部迁移（幂等，可重复调用）。
pub fn run_migrations(conn: &Connection) -> AppResult<()> {
    // 基线：全部 CREATE TABLE IF NOT EXISTS，对新库与老库都安全
    conn.execute_batch(SCHEMA_SQL)?;

    let mut version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    for (target, sql) in MIGRATIONS {
        if *target <= version {
            continue;
        }
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(sql)?;
        // PRAGMA 不支持参数绑定，版本号来自代码内常量
        tx.pragma_update(None, "user_version", *target)?;
        tx.commit()?;
        version = *target;
    }
    Ok(())
}

const SCHEMA_SQL: &str = r#"
-- 站点表
CREATE TABLE IF NOT EXISTS sites (
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

-- 文章表
CREATE TABLE IF NOT EXISTS articles (
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
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

-- Git 配置表
CREATE TABLE IF NOT EXISTS git_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL UNIQUE,
    remote_url TEXT NOT NULL,
    branch TEXT DEFAULT 'main',
    auto_deploy INTEGER DEFAULT 1,
    last_commit TEXT,
    last_commit_msg TEXT,
    last_push_at TEXT,
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

-- 部署配置表
CREATE TABLE IF NOT EXISTS deploy_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL UNIQUE,
    repo_platform TEXT DEFAULT 'github',
    ci_platforms TEXT,
    node_version TEXT DEFAULT '20',
    build_command TEXT DEFAULT 'npm install && npx hexo generate',
    deploy_targets TEXT,
    env_vars TEXT,
    edge_provider TEXT,
    edge_domain TEXT,
    origin_strategy TEXT DEFAULT 'smart_routing',
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

-- 部署记录表
CREATE TABLE IF NOT EXISTS deploy_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    commit_message TEXT,
    commit_hash TEXT,
    branch TEXT,
    duration_ms INTEGER,
    error_message TEXT,
    output TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

-- 主题配置表
CREATE TABLE IF NOT EXISTS theme_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL,
    theme_name TEXT NOT NULL,
    config TEXT NOT NULL,
    is_active INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

-- 插件表
CREATE TABLE IF NOT EXISTS plugins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    version TEXT,
    is_active INTEGER DEFAULT 1,
    config TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

-- 更新设置表
CREATE TABLE IF NOT EXISTS update_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auto_check INTEGER DEFAULT 1,
    last_check_at TEXT,
    last_version TEXT,
    skip_version TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 应用设置表（键值对，存放通用偏好）
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Front Matter 模板表
-- 模板为全局（跨站点）共享：用户维护一套「常用字段」，写新文章时一键套用。
-- fields 为 JSON 对象字符串；body 为正文骨架（支持 {{title}} 等占位符）。
CREATE TABLE IF NOT EXISTS front_matter_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    fields TEXT NOT NULL DEFAULT '{}',
    body TEXT,
    is_builtin INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_articles_site ON articles(site_id);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_deploy_logs_site ON deploy_logs(site_id);
CREATE INDEX IF NOT EXISTS idx_plugins_site ON plugins(site_id);
CREATE INDEX IF NOT EXISTS idx_theme_configs_site ON theme_configs(site_id);
CREATE INDEX IF NOT EXISTS idx_templates_order ON front_matter_templates(sort_order, id);
"#;

#[cfg(test)]
mod tests {
    use super::*;

    fn version(conn: &Connection) -> i64 {
        conn.query_row("PRAGMA user_version", [], |r| r.get(0))
            .expect("读取 user_version")
    }

    /// 新库要跑到最新版本，且每步结构变更都生效。
    #[test]
    fn test_migrations_reach_latest_version() {
        let conn = Connection::open_in_memory().expect("内存数据库");
        run_migrations(&conn).expect("迁移失败");

        assert_eq!(version(&conn), latest_version());
        assert!(latest_version() >= 1);

        // v1 的新列必须存在（用一条真正执行的 SELECT 探测，失败即列缺失）
        let mut stmt = conn
            .prepare("SELECT file_mtime, file_size FROM articles LIMIT 1")
            .expect("v1 的列不存在");
        let mut rows = stmt.query([]).expect("查询新列失败");
        let _ = rows.next().expect("读取结果失败");
    }

    /// 迁移必须幂等：重复调用不能因为 `ALTER TABLE` 重复执行而失败。
    ///
    /// 这正是引入 `user_version` 的原因 —— 之前只有一个 `execute_batch` 基线，
    /// 任何 ALTER 放在里面都会在第二次启动时炸掉。
    #[test]
    fn test_migrations_are_idempotent() {
        let conn = Connection::open_in_memory().expect("内存数据库");
        run_migrations(&conn).expect("首次迁移失败");
        run_migrations(&conn).expect("重复迁移失败（user_version 未生效？）");
        assert_eq!(version(&conn), latest_version());
    }
}
