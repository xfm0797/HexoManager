//! 分类与标签命令：列表统计、重命名、删除。
//!
//! 分类/标签没有独立表，全部从文章的 Front Matter 派生。重命名与删除因此
//! 需要改写受影响文章的文件与数据库行，逐篇走 `write_article_row`。

use crate::commands::articles::front_matter::{
    build_front_matter, read_article_file, to_string_list,
};
use crate::db::{site_path_of, Db};
use crate::models::{Category, Tag};
use crate::utils::error::AppResult;
use crate::AppState;
use rusqlite::params;
use serde_json::Value;
use tauri::State;

/// 获取分类列表（含文章数）。
#[tauri::command]
pub async fn get_categories(state: State<'_, AppState>, site_id: i64) -> AppResult<Vec<Category>> {
    let db = &state.db;
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare("SELECT categories FROM articles WHERE site_id = ?1 AND categories IS NOT NULL")?;
    let rows = stmt.query_map(params![site_id], |r| r.get::<_, String>(0))?;

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
pub async fn get_tags(state: State<'_, AppState>, site_id: i64) -> AppResult<Vec<Tag>> {
    let db = &state.db;
    let conn = db.conn()?;
    let mut stmt =
        conn.prepare("SELECT tags FROM articles WHERE site_id = ?1 AND tags IS NOT NULL")?;
    let rows = stmt.query_map(params![site_id], |r| r.get::<_, String>(0))?;

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
) -> AppResult<i64> {
    let db = Db::from_arc(&state.db);
    rename_taxonomy(&db, site_id, "categories", &old_name, &new_name).await
}

/// 重命名标签。
#[tauri::command]
pub async fn rename_tag(
    state: State<'_, AppState>,
    site_id: i64,
    old_name: String,
    new_name: String,
) -> AppResult<i64> {
    let db = Db::from_arc(&state.db);
    rename_taxonomy(&db, site_id, "tags", &old_name, &new_name).await
}

pub(crate) async fn rename_taxonomy(
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
) -> AppResult<i64> {
    let db = Db::from_arc(&state.db);
    delete_taxonomy(&db, site_id, "categories", &name).await
}

/// 删除标签。
#[tauri::command]
pub async fn delete_tag(state: State<'_, AppState>, site_id: i64, name: String) -> AppResult<i64> {
    let db = Db::from_arc(&state.db);
    delete_taxonomy(&db, site_id, "tags", &name).await
}

pub(crate) async fn delete_taxonomy(
    db: &Db,
    site_id: i64,
    field: &str,
    name: &str,
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
