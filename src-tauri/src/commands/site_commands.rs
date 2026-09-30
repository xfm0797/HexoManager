//! 站点管理命令（对应大纲 7.1）。

use crate::db::Db;
use crate::models::{CreateSiteInput, Site, SiteStats, UpdateSiteInput};
use crate::utils::error::{AppError, AppResult};
use crate::utils::{count_words, now_utc, FileTreeNode};
use crate::AppState;
use rusqlite::{params, OptionalExtension};
use tauri::State;

/// 将查询行映射为 Site。
fn row_to_site(row: &rusqlite::Row<'_>) -> rusqlite::Result<Site> {
    Ok(Site {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        domain: row.get(3)?,
        path: row.get(4)?,
        node_version: row.get(5)?,
        theme: row.get(6)?,
        status: row.get(7)?,
        article_count: row.get::<_, Option<i64>>(8)?.unwrap_or(0),
        draft_count: row.get::<_, Option<i64>>(9)?.unwrap_or(0),
        last_deploy_at: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

const SITE_COLUMNS: &str = "id, name, description, domain, path, node_version, theme, status, \
                            article_count, draft_count, last_deploy_at, created_at, updated_at";

/// 校验目录是否为合法 Hexo 站点。
fn validate_hexo_site(path: &str) -> AppResult<()> {
    let p = std::path::Path::new(path);
    if !p.exists() {
        return Err(AppError::InvalidArgument(format!("目录不存在：{}", path)));
    }
    if !p.join("_config.yml").exists() {
        return Err(AppError::InvalidArgument(
            "该目录不是有效的 Hexo 站点：缺少 _config.yml".into(),
        ));
    }
    Ok(())
}

// ==================== 命令实现 ====================

/// 创建新站点：可选脚手架初始化，然后登记入库。
#[tauri::command]
pub async fn create_site(
    state: State<'_, AppState>,
    input: CreateSiteInput,
) -> Result<Site, String> {
    // 取出数据库句柄的独立所有权，避免在 await 期间持有 State 借用（否则 future 不满足 Send）
    let db = Db::from_arc(&state.db);
    create_site_impl(&db, input)
        .await
        .map_err(|e| e.to_string())
}

async fn create_site_impl(db: &Db, input: CreateSiteInput) -> AppResult<Site> {
    let path = input.path.trim().to_string();
    if path.is_empty() {
        return Err(AppError::InvalidArgument("站点路径不能为空".into()));
    }

    // 路径唯一性校验
    {
        let conn = db.conn()?;
        let exists: Option<i64> = conn
            .query_row("SELECT id FROM sites WHERE path = ?1", params![path], |r| {
                r.get(0)
            })
            .optional()?;
        if exists.is_some() {
            return Err(AppError::InvalidArgument(format!(
                "该路径已被其他站点占用：{}",
                path
            )));
        }
    }

    // 若目录为空或不存在，执行 Hexo 脚手架初始化
    let dir = std::path::Path::new(&path);
    let need_init = !dir.exists()
        || std::fs::read_dir(dir)
            .map(|mut d| d.next().is_none())
            .unwrap_or(true);

    if need_init {
        crate::hexo::installer::init_site(&path, Some(&input.name)).await?;
    } else {
        validate_hexo_site(&path)?;
    }

    let theme = input.theme.clone().unwrap_or_else(|| "landscape".into());
    let node_version = input
        .node_version
        .clone()
        .unwrap_or_else(|| "system".into());

    let id = {
        let conn = db.conn()?;
        conn.execute(
            "INSERT INTO sites (name, description, domain, path, node_version, theme, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active')",
            params![
                input.name,
                input.description,
                input.domain,
                path,
                node_version,
                theme
            ],
        )?;
        conn.last_insert_rowid()
    };

    // 若提供了仓库地址，一并写入 Git 配置并初始化/绑定远程
    if let Some(repo_url) = input.repo_url.filter(|s| !s.trim().is_empty()) {
        let branch = input.branch.unwrap_or_else(|| "main".into());

        if !crate::git::status::is_repo(&path).await {
            crate::git::operations::init(&path).await?;
        }
        crate::git::operations::set_remote(&path, &repo_url, Some(&branch)).await?;

        // 读取本地 Hexo 版本用于记录（在写库前完成，避免持有连接锁跨 await）
        let hexo_ver = crate::hexo::builder::hexo_version(&path)
            .await
            .ok()
            .flatten();

        {
            let conn = db.conn()?;
            conn.execute(
                "INSERT OR REPLACE INTO git_configs (site_id, remote_url, branch, auto_deploy)
                 VALUES (?1, ?2, ?3, 1)",
                params![id, repo_url, branch],
            )?;

            // 站点配置中若声明了 Hexo 版本，记录下来
            if let Some(v) = hexo_ver {
                let _ = conn.execute(
                    "UPDATE sites SET node_version = COALESCE(node_version, ?2) WHERE id = ?1",
                    params![id, v],
                );
            }
        }
    }

    get_site_by_id(db, id)
}

/// 导入已有站点。
#[tauri::command]
pub async fn import_site(state: State<'_, AppState>, path: String) -> Result<Site, String> {
    let db = &state.db;
    validate_hexo_site(&path).map_err(|e| e.to_string())?;

    {
        let conn = db.conn().map_err(|e| e.to_string())?;
        let exists: Option<i64> = conn
            .query_row("SELECT id FROM sites WHERE path = ?1", params![path], |r| {
                r.get(0)
            })
            .optional()
            .map_err(|e| e.to_string())?;
        if exists.is_some() {
            return Err(format!("该路径已被导入：{}", path));
        }
    }

    // 从 _config.yml 读取站点标题与域名，以及当前主题
    let cfg_path = format!("{}/_config.yml", path.trim_end_matches('/'));
    let mut name = std::path::Path::new(&path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "未命名站点".into());
    let mut domain: Option<String> = None;
    let mut theme = "landscape".to_string();

    if let Ok(value) = crate::hexo::config_parser::parse_yaml_file(&cfg_path) {
        if let Some(title) = value.get("title").and_then(|v| v.as_str()) {
            if !title.trim().is_empty() {
                name = title.to_string();
            }
        }
        if let Some(url) = value.get("url").and_then(|v| v.as_str()) {
            let cleaned = url
                .trim()
                .trim_start_matches("https://")
                .trim_start_matches("http://")
                .trim_end_matches('/');
            if !cleaned.is_empty() {
                domain = Some(cleaned.to_string());
            }
        }
        if let Some(t) = value.get("theme").and_then(|v| v.as_str()) {
            theme = t.to_string();
        }
    }

    let id = {
        let conn = db.conn().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO sites (name, description, domain, path, node_version, theme, status)
             VALUES (?1, NULL, ?2, ?3, 'system', ?4, 'active')",
            params![name, domain, path, theme],
        )
        .map_err(|e| e.to_string())?;
        conn.last_insert_rowid()
    };

    // 同步 Git 配置
    if crate::git::status::is_repo(&path).await {
        if let Ok(status) = crate::git::status::git_status(&path).await {
            if let Some(remote) = status.remote {
                let branch = status.branch.unwrap_or_else(|| "main".into());
                let conn = db.conn().map_err(|e| e.to_string())?;
                let _ = conn.execute(
                    "INSERT OR REPLACE INTO git_configs (site_id, remote_url, branch, auto_deploy)
                     VALUES (?1, ?2, ?3, 1)",
                    params![id, remote, branch],
                );
            }
        }
    }

    rescan_articles(db, id, &path)
        .await
        .map_err(|e| e.to_string())?;
    get_site_by_id(db, id).map_err(|e| e.to_string())
}

/// 删除站点（可选是否删除磁盘文件）。
#[tauri::command]
pub async fn delete_site(
    state: State<'_, AppState>,
    site_id: i64,
    delete_files: Option<bool>,
) -> Result<(), String> {
    let db = Db::from_arc(&state.db);
    let db = &db;
    let path: String = {
        let conn = db.conn().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT path FROM sites WHERE id = ?1",
            params![site_id],
            |r| r.get(0),
        )
        .map_err(|_| format!("站点不存在：{}", site_id))?
    };

    // 先停止该站点的预览服务
    if let Some(server) = state.servers.remove(site_id) {
        let _ = crate::hexo::server::kill_by_pid(server.pid);
    }

    if delete_files.unwrap_or(false) {
        let p = std::path::Path::new(&path);
        if p.exists() {
            std::fs::remove_dir_all(p).map_err(|e| format!("删除站点目录失败：{}", e))?;
        }
    }

    let conn = db.conn().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM sites WHERE id = ?1", params![site_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 获取全部站点。
#[tauri::command]
pub fn get_sites(state: State<'_, AppState>) -> Result<Vec<Site>, String> {
    let conn = state.db.conn().map_err(|e| e.to_string())?;
    let sql = format!(
        "SELECT {} FROM sites ORDER BY updated_at DESC, id DESC",
        SITE_COLUMNS
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], row_to_site)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

/// 获取单个站点。
#[tauri::command]
pub fn get_site(state: State<'_, AppState>, site_id: i64) -> Result<Site, String> {
    get_site_by_id(&state.db, site_id).map_err(|e| e.to_string())
}

fn get_site_by_id(db: &Db, site_id: i64) -> AppResult<Site> {
    let conn = db.conn()?;
    let sql = format!("SELECT {} FROM sites WHERE id = ?1", SITE_COLUMNS);
    conn.query_row(&sql, params![site_id], row_to_site)
        .map_err(|_| AppError::NotFound(format!("站点不存在：{}", site_id)))
}

/// 更新站点信息。
#[tauri::command]
pub fn update_site(
    state: State<'_, AppState>,
    site_id: i64,
    updates: UpdateSiteInput,
) -> Result<Site, String> {
    let db = &state.db;
    {
        let conn = db.conn().map_err(|e| e.to_string())?;
        let now = now_utc();

        // 逐字段构建更新（使用 COALESCE 保留原值）
        conn.execute(
            "UPDATE sites SET
                name = COALESCE(?2, name),
                description = COALESCE(?3, description),
                domain = COALESCE(?4, domain),
                theme = COALESCE(?5, theme),
                status = COALESCE(?6, status),
                node_version = COALESCE(?7, node_version),
                updated_at = ?8
             WHERE id = ?1",
            params![
                site_id,
                updates.name,
                updates.description,
                updates.domain,
                updates.theme,
                updates.status,
                updates.node_version,
                now
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    crate::commands::site_commands::get_site_by_id(db, site_id).map_err(|e| e.to_string())
}

/// 复制站点为模板。
#[tauri::command]
pub async fn duplicate_site(
    state: State<'_, AppState>,
    site_id: i64,
    new_name: String,
    new_path: String,
) -> Result<Site, String> {
    let db = Db::from_arc(&state.db);
    duplicate_site_impl(&db, site_id, &new_name, &new_path)
        .await
        .map_err(|e| e.to_string())
}

async fn duplicate_site_impl(
    db: &Db,
    site_id: i64,
    new_name: &str,
    new_path: &str,
) -> AppResult<Site> {
    let source = get_site_by_id(db, site_id)?;

    if std::path::Path::new(new_path).exists() {
        return Err(AppError::InvalidArgument(format!(
            "目标路径已存在：{}",
            new_path
        )));
    }

    copy_dir_recursive(
        std::path::Path::new(&source.path),
        std::path::Path::new(new_path),
    )?;

    // 修正复制的站点配置
    let cfg = format!("{}/_config.yml", new_path.trim_end_matches('/'));
    if let Ok(mut value) = crate::hexo::config_parser::parse_yaml_file(&cfg) {
        if let Some(obj) = value.as_object_mut() {
            obj.insert(
                "title".into(),
                serde_json::Value::String(new_name.to_string()),
            );
        }
        let _ = crate::hexo::config_parser::write_yaml_file(&cfg, &value);
    }

    let id = {
        let conn = db.conn()?;
        conn.execute(
            "INSERT INTO sites (name, description, domain, path, node_version, theme, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active')",
            params![
                new_name,
                source.description,
                source.domain,
                new_path,
                source.node_version,
                source.theme
            ],
        )?;
        conn.last_insert_rowid()
    };

    rescan_articles(db, id, new_path)
        .await
        .map_err(|e| e.to_string())?;
    get_site_by_id(db, id)
}

/// 递归复制目录（跳过 node_modules 与 .git 以加速）。
fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> AppResult<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        // 跳过依赖与版本库目录（体积大且可重建）
        if name_str == "node_modules" || name_str == ".git" || name_str == "public" {
            continue;
        }

        let from = entry.path();
        let to = dst.join(&name);

        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            std::fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

/// 获取站点统计。
#[tauri::command]
pub async fn get_site_stats(state: State<'_, AppState>, site_id: i64) -> Result<SiteStats, String> {
    let db = &state.db;
    let site = get_site_by_id(db, site_id).map_err(|e| e.to_string())?;

    // 重新扫描文章以保证统计准确
    let _ = rescan_articles(db, site_id, &site.path).await;

    let (article_count, draft_count, published_count, total_words, categories, tags) = {
        let conn = db.conn().map_err(|e| e.to_string())?;

        let article_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM articles WHERE site_id = ?1",
                params![site_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let draft_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM articles WHERE site_id = ?1 AND status = 'draft'",
                params![site_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let published_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM articles WHERE site_id = ?1 AND status = 'published'",
                params![site_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let total_words: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(word_count), 0) FROM articles WHERE site_id = ?1",
                params![site_id],
                |r| r.get(0),
            )
            .unwrap_or(0);

        // 汇总前端标签（JSON 数组存储）
        let mut cat_counter: std::collections::BTreeMap<String, i64> =
            std::collections::BTreeMap::new();
        let mut tag_counter: std::collections::BTreeMap<String, i64> =
            std::collections::BTreeMap::new();

        let mut stmt = conn
            .prepare("SELECT categories, tags FROM articles WHERE site_id = ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![site_id], |r| {
                Ok((
                    r.get::<_, Option<String>>(0)?,
                    r.get::<_, Option<String>>(1)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in rows.flatten() {
            for (raw, counter) in [(row.0, &mut cat_counter), (row.1, &mut tag_counter)] {
                if let Some(s) = raw {
                    if let Ok(list) = serde_json::from_str::<Vec<String>>(&s) {
                        for item in list {
                            *counter.entry(item).or_insert(0) += 1;
                        }
                    }
                }
            }
        }

        let cats: Vec<String> = cat_counter.keys().cloned().collect();
        let tgs: Vec<String> = tag_counter.keys().cloned().collect();

        (
            article_count,
            draft_count,
            published_count,
            total_words,
            cats,
            tgs,
        )
    };

    // 计算站点目录占用空间（排除 node_modules）
    let disk_usage = dir_size(std::path::Path::new(&site.path));

    Ok(SiteStats {
        article_count,
        draft_count,
        published_count,
        total_words,
        categories,
        tags,
        last_deploy_at: site.last_deploy_at,
        disk_usage,
    })
}

/// 统计目录占用空间（跳过 node_modules 与 .git）。
fn dir_size(path: &std::path::Path) -> u64 {
    let mut total: u64 = 0;
    let walker = walkdir::WalkDir::new(path)
        .max_depth(8)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            name != "node_modules" && name != ".git"
        });

    for entry in walker.flatten() {
        if entry.file_type().is_file() {
            if let Ok(meta) = entry.metadata() {
                total += meta.len();
            }
        }
    }
    total
}

/// 备份站点（导出为目录副本）。
#[tauri::command]
pub async fn backup_site(
    state: State<'_, AppState>,
    site_id: i64,
    backup_path: String,
) -> Result<String, String> {
    let db = Db::from_arc(&state.db);
    backup_site_impl(&db, site_id, &backup_path)
        .await
        .map_err(|e| e.to_string())
}

async fn backup_site_impl(db: &Db, site_id: i64, backup_path: &str) -> AppResult<String> {
    let site = get_site_by_id(db, site_id)?;

    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let safe_name = site
        .name
        .replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
    let target = std::path::Path::new(backup_path).join(format!("{}-{}", safe_name, stamp));

    copy_dir_recursive(std::path::Path::new(&site.path), &target)?;

    // 记录备份元信息
    let meta = serde_json::json!({
        "siteId": site.id,
        "siteName": site.name,
        "sitePath": site.path,
        "backupAt": now_utc(),
        "backupPath": target.display().to_string(),
    });
    std::fs::write(
        target.join(".hexomanager-backup.json"),
        serde_json::to_string_pretty(&meta)?,
    )?;

    Ok(target.display().to_string())
}

// ==================== 文章扫描（供导入与统计复用） ====================

/// 扫描站点 `source/_posts` 与 `source/_drafts`，同步文章到数据库。
pub async fn rescan_articles(db: &Db, site_id: i64, site_path: &str) -> AppResult<()> {
    let root = std::path::Path::new(site_path);
    let posts_dir = root.join("source").join("_posts");
    let drafts_dir = root.join("source").join("_drafts");

    let mut found: Vec<crate::commands::article_commands::ScannedArticle> = Vec::new();

    for (dir, status) in [(&posts_dir, "published"), (&drafts_dir, "draft")] {
        if !dir.exists() {
            continue;
        }
        for entry in walkdir::WalkDir::new(dir)
            .max_depth(4)
            .into_iter()
            .flatten()
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();
            let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
            if !matches!(ext, "md" | "markdown") {
                continue;
            }

            let content = std::fs::read_to_string(path).unwrap_or_default();
            let (front, body) = crate::commands::article_commands::split_front_matter(&content);

            let title = front
                .as_ref()
                .and_then(|f| f.get("title"))
                .and_then(|v| v.as_str())
                .map(str::to_string)
                .or_else(|| path.file_stem().map(|s| s.to_string_lossy().to_string()))
                .unwrap_or_else(|| "未命名".into());

            let categories = front
                .as_ref()
                .and_then(|f| f.get("categories"))
                .map(crate::commands::article_commands::to_string_list)
                .unwrap_or_default();

            let tags = front
                .as_ref()
                .and_then(|f| f.get("tags"))
                .map(crate::commands::article_commands::to_string_list)
                .unwrap_or_default();

            let slug = front
                .as_ref()
                .and_then(|f| f.get("slug").or_else(|| f.get("abbrlink")))
                .and_then(|v| v.as_str())
                .map(str::to_string);

            let is_top = front
                .as_ref()
                .and_then(|f| {
                    f.get("sticky")
                        .or_else(|| f.get("top"))
                        .or_else(|| f.get("is_top"))
                })
                .and_then(|v| match v {
                    serde_json::Value::Bool(b) => Some(*b),
                    serde_json::Value::Number(n) => Some(n.as_i64().unwrap_or(0) > 0),
                    serde_json::Value::String(s) => Some(!s.is_empty() && s != "false"),
                    _ => None,
                })
                .unwrap_or(false);

            let allow_comment = front
                .as_ref()
                .and_then(|f| f.get("comments").or_else(|| f.get("allow_comment")))
                .and_then(|v| v.as_bool())
                .unwrap_or(true);

            let cover_image = front
                .as_ref()
                .and_then(|f| {
                    f.get("cover")
                        .or_else(|| f.get("cover_image"))
                        .or_else(|| f.get("banner_img"))
                })
                .and_then(|v| v.as_str())
                .map(str::to_string);

            let created_at = front
                .as_ref()
                .and_then(|f| f.get("date"))
                .and_then(|v| v.as_str())
                .map(str::to_string);

            let updated_at = front
                .as_ref()
                .and_then(|f| f.get("updated"))
                .and_then(|v| v.as_str())
                .map(str::to_string);

            let excerpt = front
                .as_ref()
                .and_then(|f| f.get("excerpt").or_else(|| f.get("description")))
                .and_then(|v| v.as_str())
                .map(str::to_string);

            found.push(crate::commands::article_commands::ScannedArticle {
                title,
                slug,
                file_path: path.display().to_string(),
                content: body,
                excerpt,
                status: status.to_string(),
                categories,
                tags,
                cover_image,
                is_top,
                allow_comment,
                word_count: count_words(&content),
                created_at,
                updated_at,
                published_at: if status == "published" {
                    front
                        .as_ref()
                        .and_then(|f| f.get("date"))
                        .and_then(|v| v.as_str())
                        .map(str::to_string)
                } else {
                    None
                },
            });
        }
    }

    crate::commands::article_commands::sync_articles(db, site_id, found).await
}

/// 获取站点的文件树（供文件管理页使用）。
#[tauri::command]
pub fn get_site_file_tree(
    state: State<'_, AppState>,
    site_id: i64,
    max_depth: Option<usize>,
) -> Result<FileTreeNode, String> {
    let site = get_site_by_id(&state.db, site_id).map_err(|e| e.to_string())?;
    let root = std::path::Path::new(&site.path);
    if !root.exists() {
        return Err(format!("站点目录不存在：{}", site.path));
    }
    Ok(FileTreeNode::from_path(root, 0, max_depth.unwrap_or(4)))
}
