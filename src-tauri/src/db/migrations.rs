//! 建表迁移脚本。
//!
//! 字段与开发大纲第五章「数据库设计」逐字段对齐。

use crate::utils::error::AppResult;
use rusqlite::Connection;

/// 执行全部建表迁移（幂等，可重复调用）。
pub fn run_migrations(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(SCHEMA_SQL)?;
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
