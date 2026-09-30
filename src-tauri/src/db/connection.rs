//! SQLite 连接持有与打开逻辑。
//!
//! `Db` 内部使用 `Arc<Mutex<Connection>>`，因此可以低成本克隆。
//! 这使得 Tauri 的异步命令无需在 `.await` 期间持有 `State` 的借用
//! （否则 future 无法满足 `Send` 约束）。

use crate::db::migrations::run_migrations;
use crate::utils::error::{AppError, AppResult};
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// 全局数据库连接包装，作为 Tauri 管理状态注入。
#[derive(Clone)]
pub struct Db(pub Arc<Mutex<Connection>>);

impl Db {
    /// 打开（或创建）数据库并执行迁移。
    pub fn open(path: &PathBuf) -> AppResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        // WAL 模式提升并发读性能
        conn.pragma_update(None, "journal_mode", "WAL")?;
        // 启用外键约束（SQLite 默认关闭）
        conn.pragma_update(None, "foreign_keys", "ON")?;
        run_migrations(&conn)?;
        Ok(Db(Arc::new(Mutex::new(conn))))
    }

    /// 获取连接锁。
    pub fn conn(&self) -> AppResult<std::sync::MutexGuard<'_, Connection>> {
        self.0
            .lock()
            .map_err(|_| AppError::Other("数据库连接锁已损坏".into()))
    }

    /// 从已注入的 `Db` 派生一个独立所有权句柄，供异步命令跨 `.await` 使用。
    pub fn from_arc(other: &Db) -> Self {
        Db(Arc::clone(&other.0))
    }
}
