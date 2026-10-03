//! Front Matter 模板命令。
//!
//! 模板用于沉淀「写新文章时的常用字段」：一次配置，写任何文章时一键套用。
//! 模板是**全局**的（不区分站点），存放在 `front_matter_templates` 表。
//!
//! 与文章模块的分工：
//! - 本模块负责模板自身的增删改查，以及把模板**合并进**某个 front matter 对象；
//! - `article_commands` 负责把合并结果写回文章文件（新建 / 套用到已有文章）。

use crate::db::Db;
use crate::models::{
    ApplyTemplateInput, ApplyTemplateResult, FrontMatterTemplate, SaveFrontMatterTemplateInput,
};
use crate::utils::error::{AppError, AppResult};
use crate::utils::{now_utc, slugify};
use crate::AppState;
use rusqlite::{params, Connection};
use serde_json::{Map, Value};
use tauri::State;

/// 模板中不允许被套用的保留字段：由应用或用户输入决定，模板不得覆盖。
const RESERVED_FIELDS: &[&str] = &["title", "updated"];

const TEMPLATE_COLUMNS: &str =
    "id, name, description, icon, fields, body, is_builtin, sort_order, created_at, updated_at";

// ==================== 字段合并 ====================

/// 判断一个字段值是否「空」（空字符串 / 空数组 / 空对象 / null）。
///
/// 模板里留空的字段视为「不设置」，套用时跳过；
/// 但若目标字段已存在且要求覆盖，则允许模板用空值清空它。
fn is_empty_value(value: &Value) -> bool {
    match value {
        Value::Null => true,
        Value::String(s) => s.trim().is_empty(),
        Value::Array(a) => a.is_empty(),
        Value::Object(o) => o.is_empty(),
        _ => false,
    }
}

/// 目标字段是否处于「尚无有效值」的状态。
fn is_vacant(existing: Option<&Value>) -> bool {
    match existing {
        None => true,
        Some(v) => is_empty_value(v),
    }
}

/// 把模板字段合并进一个 front matter 对象。
///
/// - `overwrite = false`（默认）：只补**缺失或为空**的字段，已有值一律保留；
/// - `overwrite = true`：模板中非空的同名字段覆盖目标值。
///
/// 返回实际写入的字段名列表（用于向用户回报改了什么）。
pub fn merge_template_fields(
    front: &mut Map<String, Value>,
    fields: &Value,
    overwrite: bool,
) -> Vec<String> {
    let Some(obj) = fields.as_object() else {
        return Vec::new();
    };

    let mut changed = Vec::new();
    for (key, value) in obj {
        if RESERVED_FIELDS.contains(&key.as_str()) {
            continue;
        }

        let existing = front.get(key);
        let vacant = is_vacant(existing);

        // 目标字段为空、模板值也为空 —— 写了等于没写，跳过
        if vacant && is_empty_value(value) {
            continue;
        }
        // 目标字段已有值，且不允许覆盖
        if !vacant && !overwrite {
            continue;
        }

        front.insert(key.clone(), value.clone());
        changed.push(key.clone());
    }
    changed
}

/// 正文骨架渲染上下文。
pub struct RenderContext<'a> {
    pub title: &'a str,
    pub slug: &'a str,
}

/// 渲染正文骨架中的占位符。
///
/// 支持 `{{title}}` `{{slug}}` `{{date}}` `{{datetime}}`；
/// 未知占位符原样保留，避免误吞模板作者写的内容。
pub fn render_body(body: &str, ctx: &RenderContext<'_>) -> String {
    let now = chrono::Local::now();
    let pairs = [
        ("{{title}}", ctx.title.to_string()),
        ("{{slug}}", ctx.slug.to_string()),
        ("{{date}}", now.format("%Y-%m-%d").to_string()),
        ("{{datetime}}", now.format("%Y-%m-%d %H:%M:%S").to_string()),
    ];
    let mut out = body.to_string();
    for (token, value) in pairs {
        if out.contains(token) {
            out = out.replace(token, &value);
        }
    }
    out
}

// ==================== 行映射 ====================

fn row_to_template(row: &rusqlite::Row<'_>) -> rusqlite::Result<FrontMatterTemplate> {
    let fields_raw: Option<String> = row.get(4)?;
    let fields = fields_raw
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .filter(|v| v.is_object())
        .unwrap_or_else(|| serde_json::json!({}));

    Ok(FrontMatterTemplate {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        icon: row.get(3)?,
        fields,
        body: row.get(5)?,
        is_builtin: row.get::<_, Option<i64>>(6)?.unwrap_or(0) != 0,
        sort_order: row.get::<_, Option<i64>>(7)?.unwrap_or(0),
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

// ==================== 内置模板 ====================

/// 内置模板定义：(排序, 名称, 图标, 说明, 字段, 正文骨架)。
fn builtin_templates() -> Vec<(i64, &'static str, &'static str, &'static str, Value, &'static str)>
{
    vec![
        (
            10,
            "技术长文",
            "📘",
            "带目录与小结的深度技术文章",
            serde_json::json!({
                "categories": ["技术"],
                "toc": true,
                "comments": true,
                "mathjax": false,
                "sticky": false,
            }),
            "这里写导语，`<!-- more -->` 之前的内容会被 Hexo 当作摘要。\n\n<!-- more -->\n\n## 背景\n\n\n## 方案与实现\n\n\n## 踩坑记录\n\n\n## 小结\n\n",
        ),
        (
            20,
            "教程 / 操作指南",
            "🧭",
            "分步骤讲解，含前置条件与验证方式",
            serde_json::json!({
                "categories": ["教程"],
                "toc": true,
                "comments": true,
            }),
            "一句话说明这篇教程解决什么问题。\n\n<!-- more -->\n\n## 前置条件\n\n- \n\n## 操作步骤\n\n1. \n\n## 验证结果\n\n\n## 常见问题\n\n\n## 参考\n\n",
        ),
        (
            30,
            "生活随笔",
            "🍃",
            "轻量记录，不生成目录",
            serde_json::json!({
                "categories": ["随笔"],
                "toc": false,
                "comments": true,
            }),
            "",
        ),
    ]
}

/// 首次使用时播种内置模板（表非空则跳过，用户的增删不会被覆盖回去）。
fn ensure_seeded(conn: &Connection) -> AppResult<()> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM front_matter_templates", [], |r| {
        r.get(0)
    })?;
    if count > 0 {
        return Ok(());
    }

    let now = now_utc();
    for (order, name, icon, description, fields, body) in builtin_templates() {
        conn.execute(
            "INSERT INTO front_matter_templates
                (name, description, icon, fields, body, is_builtin, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, ?7)",
            params![
                name,
                description,
                icon,
                serde_json::to_string(&fields)?,
                if body.trim().is_empty() { None } else { Some(body) },
                order,
                now,
            ],
        )?;
    }
    Ok(())
}

/// 按 ID 读取模板（供文章新建流程复用）。
pub fn load_template(conn: &Connection, template_id: i64) -> AppResult<FrontMatterTemplate> {
    let sql = format!(
        "SELECT {} FROM front_matter_templates WHERE id = ?1",
        TEMPLATE_COLUMNS
    );
    conn.query_row(&sql, params![template_id], row_to_template)
        .map_err(|_| AppError::NotFound(format!("模板不存在：{}", template_id)))
}

// ==================== Tauri 命令 ====================

/// 获取全部模板（内置在前，其余按 sort_order、id 排序）。
#[tauri::command]
pub fn get_front_matter_templates(
    state: State<'_, AppState>,
) -> Result<Vec<FrontMatterTemplate>, String> {
    let conn = state.db.conn().map_err(|e| e.to_string())?;
    ensure_seeded(&conn).map_err(|e| e.to_string())?;

    let sql = format!(
        "SELECT {} FROM front_matter_templates ORDER BY sort_order ASC, id ASC",
        TEMPLATE_COLUMNS
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], row_to_template)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

/// 新建或更新模板（`id` 为空即新建）。返回保存后的模板。
#[tauri::command]
pub fn save_front_matter_template(
    state: State<'_, AppState>,
    input: SaveFrontMatterTemplateInput,
) -> Result<FrontMatterTemplate, String> {
    let conn = state.db.conn().map_err(|e| e.to_string())?;
    save_front_matter_template_impl(&conn, input).map_err(|e| e.to_string())
}

fn save_front_matter_template_impl(
    conn: &Connection,
    input: SaveFrontMatterTemplateInput,
) -> AppResult<FrontMatterTemplate> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::InvalidArgument("模板名称不能为空".into()));
    }

    // 字段必须是对象：模板最终会被写进 front matter，数组/标量无处安放
    let fields = match input.fields {
        Some(v) if v.is_object() => v,
        Some(Value::Null) | None => serde_json::json!({}),
        Some(_) => {
            return Err(AppError::InvalidArgument(
                "模板字段必须是一个 YAML 对象（键值对）".into(),
            ))
        }
    };
    let fields_json = serde_json::to_string(&fields)?;
    let description = input.description.filter(|s| !s.trim().is_empty());
    let icon = input.icon.filter(|s| !s.trim().is_empty());
    let body = input.body.filter(|s| !s.trim().is_empty());

    // 同名模板不允许重复，否则选择器里无法分辨
    let dup_sql = match input.id {
        Some(_) => "SELECT id FROM front_matter_templates WHERE name = ?1 AND id <> ?2",
        None => "SELECT id FROM front_matter_templates WHERE name = ?1",
    };
    let dup: Option<i64> = match input.id {
        Some(id) => conn
            .query_row(dup_sql, params![name, id], |r| r.get(0))
            .ok(),
        None => conn.query_row(dup_sql, params![name], |r| r.get(0)).ok(),
    };
    if dup.is_some() {
        return Err(AppError::InvalidArgument(format!(
            "已存在同名模板「{}」，请换一个名称",
            name
        )));
    }

    let now = now_utc();
    let id = match input.id {
        Some(id) => {
            let affected = conn.execute(
                "UPDATE front_matter_templates
                    SET name = ?2, description = ?3, icon = ?4, fields = ?5, body = ?6,
                        sort_order = COALESCE(?7, sort_order), updated_at = ?8
                  WHERE id = ?1",
                params![id, name, description, icon, fields_json, body, input.sort_order, now],
            )?;
            if affected == 0 {
                return Err(AppError::NotFound(format!("模板不存在：{}", id)));
            }
            id
        }
        None => {
            let next_order: i64 = conn
                .query_row(
                    "SELECT COALESCE(MAX(sort_order), 0) + 10 FROM front_matter_templates",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(10);
            conn.execute(
                "INSERT INTO front_matter_templates
                    (name, description, icon, fields, body, is_builtin, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, ?7)",
                params![
                    name,
                    description,
                    icon,
                    fields_json,
                    body,
                    input.sort_order.unwrap_or(next_order),
                    now
                ],
            )?;
            conn.last_insert_rowid()
        }
    };

    load_template(conn, id)
}

/// 删除模板。内置模板不可删除（可编辑或另存为新模板）。
#[tauri::command]
pub fn delete_front_matter_template(
    state: State<'_, AppState>,
    template_id: i64,
) -> Result<(), String> {
    let conn = state.db.conn().map_err(|e| e.to_string())?;
    let builtin: Option<i64> = conn
        .query_row(
            "SELECT is_builtin FROM front_matter_templates WHERE id = ?1",
            params![template_id],
            |r| r.get(0),
        )
        .map_err(|_| format!("模板不存在：{}", template_id))?;

    if builtin.unwrap_or(0) != 0 {
        return Err("内置模板不可删除，可编辑它或另存为新模板".into());
    }

    conn.execute(
        "DELETE FROM front_matter_templates WHERE id = ?1",
        params![template_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 把模板套用到一篇已有文章。
///
/// 只改动 front matter（以及可选的正文骨架），不动磁盘上的文件名与目录。
#[tauri::command]
pub async fn apply_front_matter_template(
    state: State<'_, AppState>,
    input: ApplyTemplateInput,
) -> Result<ApplyTemplateResult, String> {
    let db = Db::from_arc(&state.db);
    apply_front_matter_template_impl(&db, input)
        .await
        .map_err(|e| e.to_string())
}

async fn apply_front_matter_template_impl(
    db: &Db,
    input: ApplyTemplateInput,
) -> AppResult<ApplyTemplateResult> {
    let (site_id, file_path) = {
        let conn = db.conn()?;
        conn.query_row(
            "SELECT site_id, file_path FROM articles WHERE id = ?1",
            params![input.article_id],
            |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)),
        )
        .map_err(|_| AppError::NotFound(format!("文章不存在：{}", input.article_id)))?
    };

    let template = {
        let conn = db.conn()?;
        load_template(&conn, input.template_id)?
    };

    let (mut front, mut body) = crate::commands::article_commands::read_article_file(&file_path)?;
    if !front.is_object() {
        front = serde_json::json!({});
    }

    let title = front
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let slug = front
        .get("slug")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .unwrap_or_else(|| {
            std::path::Path::new(&file_path)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| slugify(&title))
        });

    let overwrite = input.overwrite.unwrap_or(false);
    let changed = match front.as_object_mut() {
        Some(obj) => merge_template_fields(obj, &template.fields, overwrite),
        None => Vec::new(),
    };

    // 正文处理：默认不动，避免把用户已写的内容冲掉
    let body_mode = input
        .body_mode
        .as_deref()
        .unwrap_or("none")
        .to_ascii_lowercase();
    let skeleton = template
        .body
        .as_deref()
        .map(|b| render_body(b, &RenderContext { title: &title, slug: &slug }))
        .unwrap_or_default();

    let original_body = body.clone();
    let effective_mode = match body_mode.as_str() {
        "replace" if !skeleton.trim().is_empty() => {
            body = skeleton;
            "replace"
        }
        "append" if !skeleton.trim().is_empty() => {
            body = if body.trim().is_empty() {
                skeleton
            } else {
                format!("{}\n\n{}", body.trim_end(), skeleton)
            };
            "append"
        }
        other => {
            let _ = other;
            "none"
        }
    };
    let body_changed = body != original_body;

    let new_content = crate::commands::article_commands::build_front_matter(&front, &body)?;
    std::fs::write(&file_path, &new_content)?;

    // 分类/标签等派生字段需要重新同步回数据库
    let site_path = {
        let conn = db.conn()?;
        conn.query_row("SELECT path FROM sites WHERE id = ?1", params![site_id], |r| {
            r.get::<_, String>(0)
        })
        .map_err(|_| AppError::NotFound(format!("站点不存在：{}", site_id)))?
    };
    crate::commands::site_commands::rescan_articles(db, site_id, &site_path).await?;

    let conn = db.conn()?;
    let sql = format!(
        "SELECT {} FROM articles WHERE id = ?1",
        crate::commands::article_commands::ARTICLE_COLUMNS
    );
    let article = conn
        .query_row(&sql, params![input.article_id], crate::commands::article_commands::row_to_article)
        .map_err(|_| AppError::NotFound("套用模板后未能读取文章".into()))?;

    Ok(ApplyTemplateResult {
        article,
        applied_fields: changed,
        body_mode: effective_mode.to_string(),
        body_changed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn map(v: Value) -> Map<String, Value> {
        v.as_object().cloned().unwrap_or_default()
    }

    #[test]
    fn merge_only_fills_missing_fields_by_default() {
        let mut front = map(serde_json::json!({
            "title": "已有标题",
            "categories": ["原有分类"],
            "sticky": false,
        }));
        let fields = serde_json::json!({
            "categories": ["模板分类"],
            "toc": true,
            "sticky": true,
        });

        let changed = merge_template_fields(&mut front, &fields, false);

        // 已有值的字段不动
        assert_eq!(front["categories"], serde_json::json!(["原有分类"]));
        assert_eq!(front["sticky"], serde_json::json!(false));
        // 缺失字段补上
        assert_eq!(front["toc"], serde_json::json!(true));
        assert_eq!(changed, vec!["toc".to_string()]);
    }

    #[test]
    fn merge_overwrites_when_requested_and_fills_empty_arrays() {
        let mut front = map(serde_json::json!({
            "categories": [],
            "comments": false,
        }));
        let fields = serde_json::json!({
            "categories": ["模板分类"],
            "comments": true,
        });

        let changed = merge_template_fields(&mut front, &fields, true);

        assert_eq!(front["categories"], serde_json::json!(["模板分类"]));
        assert_eq!(front["comments"], serde_json::json!(true));
        assert_eq!(changed.len(), 2);
    }

    #[test]
    fn empty_template_values_are_treated_as_unset() {
        let mut front = map(serde_json::json!({ "title": "T" }));
        let fields = serde_json::json!({
            "cover": "",
            "tags": [],
            "meta": {},
            "extra": null,
            "toc": true,
        });

        let changed = merge_template_fields(&mut front, &fields, false);

        assert!(!front.contains_key("cover"));
        assert!(!front.contains_key("tags"));
        assert!(!front.contains_key("meta"));
        assert!(!front.contains_key("extra"));
        assert_eq!(changed, vec!["toc".to_string()]);
    }

    #[test]
    fn reserved_fields_are_never_taken_from_template() {
        let mut front = map(serde_json::json!({ "title": "原标题" }));
        let fields = serde_json::json!({
            "title": "模板标题",
            "updated": "2000-01-01 00:00:00",
            "toc": true,
        });

        let changed = merge_template_fields(&mut front, &fields, true);

        assert_eq!(front["title"], serde_json::json!("原标题"));
        assert!(!front.contains_key("updated"));
        assert_eq!(changed, vec!["toc".to_string()]);
    }

    #[test]
    fn render_body_substitutes_known_placeholders_only() {
        let ctx = RenderContext {
            title: "Hello 世界",
            slug: "hello-world",
        };
        let out = render_body(
            "{{title}} | {{slug}} | {{unknown}} | {{datetime}}",
            &ctx,
        );
        assert!(out.starts_with("Hello 世界 | hello-world | {{unknown}} | 20"));
    }

    #[test]
    fn seeding_is_idempotent_and_skipped_when_table_not_empty() {
        let conn = Connection::open_in_memory().expect("内存库");
        crate::db::migrations::run_migrations(&conn).expect("迁移失败");

        ensure_seeded(&conn).expect("播种失败");
        let first: i64 = conn
            .query_row("SELECT COUNT(*) FROM front_matter_templates", [], |r| r.get(0))
            .unwrap();
        assert_eq!(first, builtin_templates().len() as i64);

        // 用户删掉一个内置模板后再次播种，不应把它加回来
        conn.execute("DELETE FROM front_matter_templates WHERE sort_order = 10", [])
            .unwrap();
        ensure_seeded(&conn).expect("二次播种失败");
        let second: i64 = conn
            .query_row("SELECT COUNT(*) FROM front_matter_templates", [], |r| r.get(0))
            .unwrap();
        assert_eq!(second, first - 1);
    }

    #[test]
    fn save_rejects_duplicate_name_and_non_object_fields() {
        let conn = Connection::open_in_memory().expect("内存库");
        crate::db::migrations::run_migrations(&conn).expect("迁移失败");

        let make = |name: &str, fields: Value| SaveFrontMatterTemplateInput {
            id: None,
            name: name.to_string(),
            description: None,
            icon: None,
            fields: Some(fields),
            body: None,
            sort_order: None,
        };

        let saved = save_front_matter_template_impl(
            &conn,
            make("我的模板", serde_json::json!({ "toc": true })),
        )
        .expect("首次保存应成功");
        assert_eq!(saved.name, "我的模板");
        assert!(!saved.is_builtin);

        // 同名 → 拒绝
        let dup = save_front_matter_template_impl(
            &conn,
            make("我的模板", serde_json::json!({ "toc": false })),
        );
        assert!(dup.is_err(), "同名模板应被拒绝");

        // 字段不是对象 → 拒绝
        let bad = save_front_matter_template_impl(
            &conn,
            make("数组字段", serde_json::json!(["a", "b"])),
        );
        assert!(bad.is_err(), "字段必须为对象");

        // 空名字 → 拒绝
        let empty = save_front_matter_template_impl(&conn, make("   ", serde_json::json!({})));
        assert!(empty.is_err(), "空名称应被拒绝");
    }
}
