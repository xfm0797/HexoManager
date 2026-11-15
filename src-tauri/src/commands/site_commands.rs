//! 站点管理命令（对应大纲 7.1）。

use crate::db::Db;
use crate::models::{CreateSiteInput, Site, SiteStats, UpdateSiteInput};
use crate::utils::blocking;
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
        return Err(AppError::coded(
            "site.dir_missing",
            format!("目录不存在：{}", path),
            &[("path", path.to_string())],
        ));
    }
    if !p.join("_config.yml").exists() {
        return Err(AppError::coded(
            "site.not_hexo",
            "该目录不是有效的 Hexo 站点：缺少 _config.yml",
            &[],
        ));
    }
    Ok(())
}

// ==================== 命令实现 ====================

/// 创建新站点：可选脚手架初始化，然后登记入库。
#[tauri::command]
pub async fn create_site(state: State<'_, AppState>, input: CreateSiteInput) -> AppResult<Site> {
    // 取出数据库句柄的独立所有权，避免在 await 期间持有 State 借用（否则 future 不满足 Send）
    let db = Db::from_arc(&state.db);
    create_site_impl(&db, input).await
}

async fn create_site_impl(db: &Db, input: CreateSiteInput) -> AppResult<Site> {
    let path = input.path.trim().to_string();
    if path.is_empty() {
        return Err(AppError::coded("site.path_empty", "站点路径不能为空", &[]));
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
            return Err(AppError::coded(
                "site.path_taken",
                format!("该路径已被其他站点占用：{}", path),
                &[("path", path.clone())],
            ));
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
pub async fn import_site(state: State<'_, AppState>, path: String) -> AppResult<Site> {
    let db = &state.db;
    validate_hexo_site(&path)?;

    {
        let conn = db.conn()?;
        let exists: Option<i64> = conn
            .query_row("SELECT id FROM sites WHERE path = ?1", params![path], |r| {
                r.get(0)
            })
            .optional()?;
        if exists.is_some() {
            return Err(AppError::coded(
                "site.already_imported",
                format!("该路径已被导入：{}", path),
                &[("path", path.clone())],
            ));
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
        let conn = db.conn()?;
        conn.execute(
            "INSERT INTO sites (name, description, domain, path, node_version, theme, status)
             VALUES (?1, NULL, ?2, ?3, 'system', ?4, 'active')",
            params![name, domain, path, theme],
        )?;
        conn.last_insert_rowid()
    };

    // 同步 Git 配置
    if crate::git::status::is_repo(&path).await {
        if let Ok(status) = crate::git::status::git_status(&path).await {
            if let Some(remote) = status.remote {
                let branch = status.branch.unwrap_or_else(|| "main".into());
                let conn = db.conn()?;
                let _ = conn.execute(
                    "INSERT OR REPLACE INTO git_configs (site_id, remote_url, branch, auto_deploy)
                     VALUES (?1, ?2, ?3, 1)",
                    params![id, remote, branch],
                );
            }
        }
    }

    rescan_articles(db, id, &path).await?;
    get_site_by_id(db, id)
}

/// 删除站点（可选是否删除磁盘文件）。
#[tauri::command]
pub async fn delete_site(
    state: State<'_, AppState>,
    site_id: i64,
    delete_files: Option<bool>,
) -> AppResult<Option<String>> {
    let db = Db::from_arc(&state.db);
    let db = &db;
    let path: String = {
        let conn = db.conn()?;
        conn.query_row(
            "SELECT path FROM sites WHERE id = ?1",
            params![site_id],
            |r| r.get(0),
        )
        .map_err(|_| {
            AppError::coded(
                "site.not_found",
                format!("站点不存在：{}", site_id),
                &[("id", site_id.to_string())],
            )
        })?
    };

    // 先停止该站点的预览服务（同时回收子进程句柄）
    state.servers.stop_site(site_id);

    // 删目录改为「移动到同级的隐藏目录」：与 `remove_dir_all` 一样把站点从
    // 原位置移走，但保留了反悔余地——`remove_dir_all` 一旦误删就再也拿不回来，
    // 而本操作的代价只是用户要手动清理一次（路径会回显在提示里）。
    let quarantined = if delete_files.unwrap_or(false) {
        let p = std::path::Path::new(&path);
        if p.exists() {
            Some(quarantine_dir(p).map_err(|e| {
                AppError::coded(
                    "site.dir_remove_failed",
                    format!("删除站点目录失败：{}", e),
                    &[("detail", e.to_string())],
                )
            })?)
        } else {
            None
        }
    } else {
        None
    };

    let conn = db.conn()?;
    conn.execute("DELETE FROM sites WHERE id = ?1", params![site_id])?;
    Ok(quarantined)
}

/// 把目录重命名到同级的 `.<name>.deleted-<时间戳>`，返回新位置。
///
/// 选同目录改名而不是复制后删除：`node_modules` 动辄几百 MB，复制既慢又占双倍
/// 空间；同一文件系统内的 rename 是原子的，失败也不会留下半截数据。
fn quarantine_dir(dir: &std::path::Path) -> std::io::Result<String> {
    let name = dir
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "site".into());
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let target = dir
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .join(format!(".{}.deleted-{}", name, stamp));
    std::fs::rename(dir, &target)?;
    Ok(target.display().to_string())
}

/// 获取全部站点。
#[tauri::command]
pub fn get_sites(state: State<'_, AppState>) -> AppResult<Vec<Site>> {
    let conn = state.db.conn()?;
    let sql = format!(
        "SELECT {} FROM sites ORDER BY updated_at DESC, id DESC",
        SITE_COLUMNS
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map([], row_to_site)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// 获取单个站点。
#[tauri::command]
pub fn get_site(state: State<'_, AppState>, site_id: i64) -> AppResult<Site> {
    get_site_by_id(&state.db, site_id)
}

fn get_site_by_id(db: &Db, site_id: i64) -> AppResult<Site> {
    let conn = db.conn()?;
    let sql = format!("SELECT {} FROM sites WHERE id = ?1", SITE_COLUMNS);
    conn.query_row(&sql, params![site_id], row_to_site)
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::coded(
                "site.not_found",
                format!("站点不存在：{}", site_id),
                &[("id", site_id.to_string())],
            ),
            other => AppError::Database(other),
        })
}

/// 更新站点信息。
#[tauri::command]
pub fn update_site(
    state: State<'_, AppState>,
    site_id: i64,
    updates: UpdateSiteInput,
) -> AppResult<Site> {
    let db = &state.db;
    {
        let conn = db.conn()?;
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
        )?;
    }

    crate::commands::site_commands::get_site_by_id(db, site_id)
}

/// 复制站点为模板。
#[tauri::command]
pub async fn duplicate_site(
    state: State<'_, AppState>,
    site_id: i64,
    new_name: String,
    new_path: String,
) -> AppResult<Site> {
    let db = Db::from_arc(&state.db);
    duplicate_site_impl(&db, site_id, &new_name, &new_path).await
}

async fn duplicate_site_impl(
    db: &Db,
    site_id: i64,
    new_name: &str,
    new_path: &str,
) -> AppResult<Site> {
    let source = get_site_by_id(db, site_id)?;

    if std::path::Path::new(new_path).exists() {
        return Err(AppError::coded(
            "site.target_exists",
            format!("目标路径已存在：{}", new_path),
            &[("path", new_path.to_string())],
        ));
    }

    // 整站复制是几十秒级的重 IO，绝不能占着 tokio worker 线程
    let source_path = source.path.clone();
    let target = new_path.to_string();
    let title = new_name.to_string();
    let skip = crate::utils::fs::SKIP_BUILD_OUTPUT;
    blocking::run(move || {
        crate::utils::fs::copy_dir_skipping(
            std::path::Path::new(&source_path),
            std::path::Path::new(&target),
            skip,
        )?;

        // 修正复制的站点配置
        let cfg = format!("{}/_config.yml", target.trim_end_matches('/'));
        if let Ok(mut value) = crate::hexo::config_parser::parse_yaml_file(&cfg) {
            if let Some(obj) = value.as_object_mut() {
                obj.insert("title".into(), serde_json::Value::String(title));
            }
            let _ = crate::hexo::config_parser::write_yaml_file(&cfg, &value);
        }
        Ok(())
    })
    .await?;

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

    rescan_articles(db, id, new_path).await?;
    get_site_by_id(db, id)
}

/// 获取站点统计。
#[tauri::command]
pub async fn get_site_stats(state: State<'_, AppState>, site_id: i64) -> AppResult<SiteStats> {
    let db = &state.db;
    let site = get_site_by_id(db, site_id)?;

    // 统计全部取自库中的派生数据；磁盘同步由 refresh_articles / 构建等显式动作触发

    let (article_count, draft_count, published_count, total_words, categories, tags) = {
        let conn = db.conn()?;

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

        let mut stmt = conn.prepare("SELECT categories, tags FROM articles WHERE site_id = ?1")?;
        let rows = stmt.query_map(params![site_id], |r| {
            Ok((
                r.get::<_, Option<String>>(0)?,
                r.get::<_, Option<String>>(1)?,
            ))
        })?;

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
) -> AppResult<String> {
    let db = Db::from_arc(&state.db);
    backup_site_impl(&db, site_id, &backup_path).await
}

async fn backup_site_impl(db: &Db, site_id: i64, backup_path: &str) -> AppResult<String> {
    let site = get_site_by_id(db, site_id)?;

    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let safe_name = site
        .name
        .replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
    let target = std::path::Path::new(backup_path).join(format!("{}-{}", safe_name, stamp));

    // 整站复制：同 duplicate，必须离开 async 上下文
    let source_path = site.path.clone();
    let target_for_copy = target.clone();
    let meta = serde_json::json!({
        "siteId": site.id,
        "siteName": site.name,
        "sitePath": site.path,
        "backupAt": now_utc(),
        "backupPath": target.display().to_string(),
    });
    blocking::run(move || {
        crate::utils::fs::copy_dir_skipping(
            std::path::Path::new(&source_path),
            &target_for_copy,
            crate::utils::fs::SKIP_BUILD_OUTPUT,
        )?;

        // 记录备份元信息
        std::fs::write(
            target_for_copy.join(".hexomanager-backup.json"),
            serde_json::to_string_pretty(&meta)?,
        )?;
        Ok(())
    })
    .await?;

    Ok(target.display().to_string())
}

// ==================== 文章扫描（供导入与统计复用） ====================

/// 文章文件指纹：`file_path -> (mtime_ns, size)`。
type FileFingerprints = std::collections::HashMap<String, (Option<i64>, Option<i64>)>;

/// 读出现有文章的指纹，供增量扫描比对。
fn load_fingerprints(db: &Db, site_id: i64) -> AppResult<FileFingerprints> {
    let conn = db.conn()?;
    let mut stmt =
        conn.prepare("SELECT file_path, file_mtime, file_size FROM articles WHERE site_id = ?1")?;
    let rows = stmt.query_map(params![site_id], |r| {
        Ok((
            r.get::<_, String>(0)?,
            (r.get::<_, Option<i64>>(1)?, r.get::<_, Option<i64>>(2)?),
        ))
    })?;
    Ok(rows.flatten().collect())
}

/// 同步扫描站点文章目录（**阻塞 IO**，只应在 `spawn_blocking` 里调用）。
///
/// 只返回「内容可能变化」的文章：文件指纹（mtime + 大小）与库中记录一致的直接跳过，
/// 一次 stat 比重读文件 + 解析 YAML 便宜一个数量级。
fn scan_articles(
    site_path: &str,
    fingerprints: &std::collections::HashMap<String, (Option<i64>, Option<i64>)>,
) -> Vec<crate::commands::article_commands::ScannedArticle> {
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

            // 指纹一致 → 内容不可能变化，跳过读取与解析
            let path_str = path.display().to_string();
            let (mtime, size) = match entry.metadata() {
                Ok(meta) => (
                    meta.modified()
                        .ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_nanos() as i64),
                    Some(meta.len() as i64),
                ),
                Err(_) => (None, None),
            };
            if let Some((Some(known_mtime), Some(known_size))) = fingerprints.get(&path_str) {
                if mtime == Some(*known_mtime) && size == Some(*known_size) {
                    continue;
                }
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

            // front matter 的时间是「本地时间无时区」，入库前统一折算成 UTC，
            // 否则会与 now_utc() 写入的值混在同一列排序（东八区差 8 小时）
            let created_at = front
                .as_ref()
                .and_then(|f| f.get("date"))
                .and_then(|v| v.as_str())
                .and_then(crate::utils::local_time_to_utc);

            let updated_at = front
                .as_ref()
                .and_then(|f| f.get("updated"))
                .and_then(|v| v.as_str())
                .and_then(crate::utils::local_time_to_utc);

            let excerpt = front
                .as_ref()
                .and_then(|f| f.get("excerpt").or_else(|| f.get("description")))
                .and_then(|v| v.as_str())
                .map(str::to_string);

            found.push(crate::commands::article_commands::ScannedArticle {
                title,
                slug,
                file_path: path_str,
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
                        .and_then(crate::utils::local_time_to_utc)
                } else {
                    None
                },
                file_mtime: mtime,
                file_size: size,
            });
        }
    }

    found
}

/// 重新扫描站点文章目录并同步数据库（显式刷新）。
///
/// 读接口不再隐式触发扫描：此前每次翻页都是一次全站扫描（500 篇 ≈ 500 次
/// 文件读 + YAML 解析 + 全表 UPDATE），这才是列表卡顿的主因。
pub async fn rescan_articles(db: &Db, site_id: i64, site_path: &str) -> AppResult<()> {
    let fingerprints = load_fingerprints(db, site_id)?;
    let root = site_path.to_string();

    // 读盘是阻塞 IO：放进 blocking 线程池，避免占住 tokio worker 让其他 IPC 排队
    let found = tokio::task::spawn_blocking(move || scan_articles(&root, &fingerprints))
        .await
        .map_err(|e| {
            AppError::coded(
                "article.scan_failed",
                format!("扫描文章失败：{}", e),
                &[("detail", e.to_string())],
            )
        })?;

    // 这里是整站扫描：允许清理磁盘上已不存在的记录
    crate::commands::article_commands::reconcile_site(db, site_id, found).await
}

/// 显式刷新文章列表：重新扫描磁盘并同步数据库。
///
/// 前端在「刷新」按钮与切换站点时调用；普通分页/搜索只读库。
#[tauri::command]
pub async fn refresh_articles(state: State<'_, AppState>, site_id: i64) -> AppResult<()> {
    let db = Db::from_arc(&state.db);
    let site = get_site_by_id(&db, site_id)?;
    rescan_articles(&db, site_id, &site.path).await
}

/// 获取站点的文件树（供文件管理页使用）。
///
/// 递归遍历整棵目录（含 node_modules 时可达数万条目），放到阻塞线程池。
#[tauri::command]
pub async fn get_site_file_tree(
    state: State<'_, AppState>,
    site_id: i64,
    max_depth: Option<usize>,
) -> AppResult<FileTreeNode> {
    let db = Db::from_arc(&state.db);
    blocking::run(move || {
        let site = get_site_by_id(&db, site_id)?;
        let root = std::path::Path::new(&site.path);
        if !root.exists() {
            return Err(AppError::coded(
                "site.path_missing",
                format!("站点目录不存在：{}", site.path),
                &[("path", site.path.clone())],
            ));
        }
        Ok(FileTreeNode::from_path(root, 0, max_depth.unwrap_or(4)))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_site_dir(tag: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("hexo-mgr-site-test-{}-{}", tag, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("source").join("_posts")).unwrap();
        dir
    }

    /// 增量扫描：指纹（mtime + 大小）未变化的文件不重复读取/解析。
    #[test]
    fn test_scan_skips_unchanged_files() {
        let dir = temp_site_dir("scan");
        let post = dir.join("source").join("_posts").join("a.md");
        std::fs::write(&post, "---\ntitle: A\n---\n\n# A\n").unwrap();

        let first = scan_articles(dir.to_str().unwrap(), &Default::default());
        assert_eq!(first.len(), 1, "首次扫描应发现 1 篇");
        assert!(first[0].file_mtime.is_some(), "扫描必须记录文件指纹");
        assert!(first[0].file_size.is_some());

        let mut fingerprints = std::collections::HashMap::new();
        fingerprints.insert(
            first[0].file_path.clone(),
            (first[0].file_mtime, first[0].file_size),
        );
        let second = scan_articles(dir.to_str().unwrap(), &fingerprints);
        assert!(second.is_empty(), "指纹未变化时不应重新解析");

        // 内容变化后必须重新扫描到
        std::fs::write(&post, "---\ntitle: A2\n---\n\n# A2 正文更长一些\n").unwrap();
        let third = scan_articles(dir.to_str().unwrap(), &fingerprints);
        assert_eq!(third.len(), 1, "内容变化后应重新扫描");
        assert_eq!(third[0].title, "A2");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
