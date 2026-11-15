//! 更新管理命令（对应大纲 7.8）。

use crate::db::Db;
use crate::models::{AppInfo, Changelog, UpdateInfo, UpdateSettings};
use crate::utils::blocking;
use crate::err;
use crate::utils::error::{AppError, AppResult};
use crate::AppState;
use rusqlite::params;
use tauri::State;

/// 检查更新。
///
/// `manifest_url` 为空时返回「已是最新」；可指向自建更新清单或 GitHub Release。
#[tauri::command]
pub async fn check_update(
    state: State<'_, AppState>,
    manifest_url: Option<String>,
) -> AppResult<UpdateInfo> {
    let db = Db::from_arc(&state.db);
    let result = crate::update::check::check_update(manifest_url)
        .await?;

    // 记录检查时间与版本，并同步「跳过版本」设置
    if let Ok(conn) = db.conn() {
        let settings = read_settings_inner(&conn);
        let skip = settings.skip_version.clone();
        let latest = result.latest_version.clone();
        let is_skipped = matches!((&skip, &latest), (Some(s), Some(l)) if s == l);

        let _ = conn.execute(
            "UPDATE update_settings SET last_check_at = ?1, last_version = ?2, updated_at = ?1
             WHERE id = 1",
            params![crate::utils::now_utc(), latest],
        );

        // 被跳过的版本不提示更新
        if is_skipped {
            return Ok(UpdateInfo {
                available: false,
                ..result
            });
        }
    }

    Ok(result)
}

/// 读取更新设置。
fn read_settings_inner(conn: &rusqlite::Connection) -> UpdateSettings {
    conn.query_row(
        "SELECT auto_check, last_check_at, last_version, skip_version
         FROM update_settings WHERE id = 1",
        [],
        |r| {
            Ok(UpdateSettings {
                auto_check: r.get::<_, Option<i64>>(0)?.unwrap_or(1) != 0,
                last_check_at: r.get(1)?,
                last_version: r.get(2)?,
                skip_version: r.get(3)?,
            })
        },
    )
    .unwrap_or(UpdateSettings {
        auto_check: true,
        last_check_at: None,
        last_version: None,
        skip_version: None,
    })
}

/// 获取更新设置。
#[tauri::command]
pub fn get_update_settings(state: State<'_, AppState>) -> AppResult<UpdateSettings> {
    let conn = state.db.conn()?;
    Ok(read_settings_inner(&conn))
}

/// 保存更新设置。
#[tauri::command]
pub fn save_update_settings(
    state: State<'_, AppState>,
    settings: UpdateSettings,
) -> AppResult<()> {
    let conn = state.db.conn()?;
    conn.execute(
        "UPDATE update_settings SET auto_check = ?1, skip_version = ?2, updated_at = ?3 WHERE id = 1",
        params![
            settings.auto_check as i64,
            settings.skip_version,
            crate::utils::now_utc()
        ],
    )?;
    Ok(())
}

/// 下载更新包。
#[tauri::command]
pub async fn download_update(
    url: String,
    target_dir: Option<String>,
) -> AppResult<crate::update::download::DownloadResult> {
    crate::update::download::download_update(&url, target_dir)
        .await
}

/// 安装更新包（校验签名后启动系统安装器）。
///
/// `signature` 来自更新清单的 `platforms.<target>.signature`；公钥取自
/// `tauri.conf.json` 的 `plugins.updater.pubkey`。两者缺一即拒绝执行 ——
/// 宁可不自动安装，也不能运行一个没校验过的可执行文件。
#[tauri::command]
pub async fn install_update(
    app: tauri::AppHandle,
    path: String,
    signature: Option<String>,
) -> AppResult<()> {
    let pubkey = app
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|v| v.get("pubkey"))
        .and_then(|v| v.as_str())
        .map(str::to_string);

    crate::update::install::install_update(&path, signature.as_deref(), pubkey.as_deref())
        .await
}

/// 获取更新日志。
#[tauri::command]
pub async fn get_changelog(project_root: Option<String>) -> Vec<Changelog> {
    blocking::run(move || {
        // 优先读取项目根目录的 CHANGELOG.md
        let root = project_root.or_else(|| {
            // 尝试从当前工作目录向上查找
            std::env::current_dir()
                .ok()
                .map(|p| p.display().to_string())
        });
        Ok(crate::update::check::get_changelog(root.as_deref()))
    })
    .await
    .unwrap_or_default()
}

/// 获取应用信息。
#[tauri::command]
pub fn get_app_info() -> AppInfo {
    crate::update::check::get_app_info()
}

/// 打开外部链接（反馈入口、开源许可等）。
#[tauri::command]
pub fn open_external(app: tauri::AppHandle, url: String) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;

    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("仅支持打开 http/https 链接".into());
    }

    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| err!("打开链接失败：{}", e))
}

/// 读取本地版本号文件 `version.json`（仅开发期使用）。
#[tauri::command]
pub async fn get_local_version(
    project_root: Option<String>,
) -> AppResult<serde_json::Value> {
    blocking::run(move || {
        crate::update::check::read_local_version(project_root.as_deref())
            
    })
    .await
}

/// 更新源配置（供「关于与更新」页展示检查链路）。
#[tauri::command]
pub fn get_update_config() -> AppResult<serde_json::Value> {
    Ok(serde_json::json!({
        "currentVersion": crate::update::check::APP_VERSION,
        "endpoints": crate::update::check::update_source_info(),
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
    }))
}

// ==================== 通用应用设置 ====================

/// 读取全部应用设置（键值对）。
#[tauri::command]
pub fn get_app_settings(
    state: State<'_, AppState>,
) -> AppResult<Vec<crate::models::AppSetting>> {
    let conn = state.db.conn()?;
    let mut stmt = conn
        .prepare("SELECT key, value FROM app_settings")?;
    let rows = stmt
        .query_map([], |r| {
            Ok(crate::models::AppSetting {
                key: r.get(0)?,
                value: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
            })
        })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

/// 写入单个应用设置。
#[tauri::command]
pub fn set_app_setting(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> AppResult<()> {
    let conn = state.db.conn()?;
    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, value, crate::utils::now_utc()],
    )?;
    Ok(())
}
