//! HexoManager — 桌面端 Hexo 多站点管理工具（Rust 后端）。

pub mod commands;
pub mod db;
pub mod deploy;
pub mod git;
pub mod hexo;
pub mod models;
pub mod update;
pub mod utils;

use db::Db;
use hexo::server::ServerRegistry;
use tauri::Manager;

/// 应用全局状态：数据库连接 + 预览服务注册表。
pub struct AppState {
    pub db: Db,
    pub servers: ServerRegistry,
}

/// 数据库文件路径：`<app_data_dir>/hexomanager.db`
fn database_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    let base = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("hexomanager"));
    base.join("hexomanager.db")
}

/// 应用入口。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // ---------- 插件 ----------
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // ---------- 状态初始化 ----------
        .setup(|app| {
            let db_path = database_path(app.handle());

            let db = Db::open(&db_path)
                .map_err(|e| format!("数据库初始化失败（{}）：{}", db_path.display(), e))?;

            // 确保更新设置表有且仅有一条记录
            {
                use rusqlite::params;
                let conn = db.conn().map_err(|e| e.to_string())?;
                let count: i64 = conn
                    .query_row("SELECT COUNT(*) FROM update_settings", [], |r| r.get(0))
                    .unwrap_or(0);
                if count == 0 {
                    conn.execute(
                        "INSERT INTO update_settings (id, auto_check) VALUES (1, 1)",
                        params![],
                    )
                    .map_err(|e| e.to_string())?;
                }
            }

            let state = AppState {
                db,
                servers: ServerRegistry::new(),
            };

            // 直接注册 AppState 本体：命令签名统一为 State<'_, AppState>，
            // Tauri 按具体类型查找 state，注册成 Arc<AppState> 会导致
            // 运行时报 "state not managed for field `state`"
            app.manage(state);

            // 启动时清理已退出的预览服务记录
            Ok(())
        })
        // ---------- 命令注册 ----------
        .invoke_handler(tauri::generate_handler![
            // ===== 站点管理（7.1）=====
            commands::site_commands::create_site,
            commands::site_commands::import_site,
            commands::site_commands::delete_site,
            commands::site_commands::get_sites,
            commands::site_commands::get_site,
            commands::site_commands::update_site,
            commands::site_commands::duplicate_site,
            commands::site_commands::get_site_stats,
            commands::site_commands::backup_site,
            commands::site_commands::get_site_file_tree,
            // ===== 文章管理（7.2）=====
            commands::article_commands::create_article,
            commands::article_commands::get_articles,
            commands::article_commands::get_article,
            commands::article_commands::update_article,
            commands::article_commands::delete_article,
            commands::article_commands::publish_article,
            commands::article_commands::unpublish_article,
            commands::article_commands::create_draft,
            commands::article_commands::import_articles,
            commands::article_commands::search_articles,
            commands::article_commands::get_categories,
            commands::article_commands::get_tags,
            commands::article_commands::rename_category,
            commands::article_commands::rename_tag,
            commands::article_commands::delete_category,
            commands::article_commands::delete_tag,
            commands::article_commands::get_article_history,
            commands::article_commands::get_article_at_commit,
            // ===== Front Matter 模板（7.2 扩展）=====
            commands::template_commands::get_front_matter_templates,
            commands::template_commands::save_front_matter_template,
            commands::template_commands::delete_front_matter_template,
            commands::template_commands::apply_front_matter_template,
            // ===== Hexo 操作（7.3）=====
            commands::hexo_commands::hexo_build,
            commands::hexo_commands::hexo_clean,
            commands::hexo_commands::hexo_server_start,
            commands::hexo_commands::hexo_server_stop,
            commands::hexo_commands::hexo_server_list,
            commands::hexo_commands::hexo_new_post,
            commands::hexo_commands::hexo_new_draft,
            commands::hexo_commands::hexo_publish,
            commands::hexo_commands::hexo_generate,
            commands::hexo_commands::hexo_deploy,
            commands::hexo_commands::check_hexo_env,
            commands::hexo_commands::install_hexo,
            commands::hexo_commands::deploy_site,
            commands::hexo_commands::hexo_new_post_article,
            // ===== Git 操作（7.4）=====
            commands::git_commands::git_init,
            commands::git_commands::git_status,
            commands::git_commands::git_add,
            commands::git_commands::git_commit,
            commands::git_commands::git_push,
            commands::git_commands::git_pull,
            commands::git_commands::git_log,
            commands::git_commands::git_diff,
            commands::git_commands::git_set_remote,
            commands::git_commands::git_discard_changes,
            commands::git_commands::git_stash,
            commands::git_commands::git_stash_pop,
            commands::git_commands::get_git_config,
            // ===== 部署配置（7.5）=====
            commands::deploy_commands::generate_deploy_config,
            commands::deploy_commands::preview_deploy_config,
            commands::deploy_commands::generate_pages_config,
            commands::deploy_commands::get_deploy_templates,
            commands::deploy_commands::save_deploy_config,
            commands::deploy_commands::get_deploy_config,
            commands::deploy_commands::get_deploy_logs,
            commands::deploy_commands::rollback_deploy,
            commands::deploy_commands::trigger_webhook,
            commands::deploy_commands::validate_domain,
            commands::deploy_commands::check_deploy_files,
            // ===== 文件操作（7.6）=====
            commands::file_commands::read_file,
            commands::file_commands::write_file,
            commands::file_commands::delete_file,
            commands::file_commands::list_files,
            commands::file_commands::create_directory,
            commands::file_commands::file_exists,
            commands::file_commands::get_file_tree,
            commands::file_commands::open_in_explorer,
            commands::file_commands::copy_path,
            commands::file_commands::rename_path,
            commands::file_commands::read_file_base64,
            // ===== 主题管理（7.7）=====
            commands::theme_commands::get_themes,
            commands::theme_commands::install_theme,
            commands::theme_commands::switch_theme,
            commands::theme_commands::get_theme_config,
            commands::theme_commands::update_theme_config,
            commands::theme_commands::search_themes,
            commands::theme_commands::uninstall_theme,
            commands::theme_commands::update_theme,
            commands::theme_commands::get_theme_preview_url,
            // ===== 配置管理（7.7 扩展）=====
            commands::config_commands::get_site_config,
            commands::config_commands::get_site_config_raw,
            commands::config_commands::save_site_config,
            commands::config_commands::validate_config,
            commands::config_commands::diff_site_config,
            commands::config_commands::restore_site_config,
            commands::config_commands::export_config,
            commands::config_commands::import_config,
            commands::config_commands::get_config_templates,
            commands::config_commands::get_plugins,
            commands::config_commands::install_plugin,
            commands::config_commands::uninstall_plugin,
            commands::config_commands::toggle_plugin,
            // ===== 更新管理（7.8）=====
            commands::update_commands::check_update,
            commands::update_commands::download_update,
            commands::update_commands::install_update,
            commands::update_commands::get_update_settings,
            commands::update_commands::save_update_settings,
            commands::update_commands::get_changelog,
            commands::update_commands::get_app_info,
            commands::update_commands::open_external,
            commands::update_commands::get_local_version,
            commands::update_commands::get_update_config,
            commands::update_commands::get_app_settings,
            commands::update_commands::set_app_setting,
        ])
        .run(tauri::generate_context!())
        .expect("HexoManager 启动失败");
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::{Arc, Mutex};

    /// 验证 managed state 的注册类型与命令签名（`State<'_, AppState>`）一致。
    ///
    /// 此前 `app.manage(Arc::new(state))` 注册的是 `Arc<AppState>`，而命令
    /// 统一声明 `State<'_, AppState>`，Tauri 按具体类型查找，运行时全部命令
    /// 报 "state not managed for field `state`"。该测试确保此类回归被拦下。
    #[test]
    fn test_app_state_managed_as_appstate() {
        let app = tauri::test::mock_app();

        // 内存数据库即可：本测试只关心 state 的类型解析，不依赖表结构
        let conn = Connection::open_in_memory().expect("打开内存数据库失败");
        let state = AppState {
            db: Db(Arc::new(Mutex::new(conn))),
            servers: ServerRegistry::new(),
        };

        // 与 run() 中 setup 的注册方式保持一致
        assert!(app.manage(state), "AppState 注册失败（重复注册？）");

        // 关键断言：按 AppState 类型解析成功 —— 与命令运行时的查找完全一致
        let resolved = app.state::<AppState>();
        assert!(resolved.db.conn().is_ok());
        assert_eq!(resolved.servers.list().len(), 0);
    }

    /// 反例回归锁：若注册成 `Arc<AppState>`（旧实现的 bug），
    /// 命令按 `AppState` 查找必然失败 —— 正是线上报错的复现。
    #[test]
    fn test_arc_wrapped_registration_cannot_resolve() {
        let app = tauri::test::mock_app();

        let conn = Connection::open_in_memory().expect("打开内存数据库失败");
        let state = AppState {
            db: Db(Arc::new(Mutex::new(conn))),
            servers: ServerRegistry::new(),
        };

        // 旧实现：注册 Arc<AppState>
        assert!(app.manage(Arc::new(state)));

        // 命令要的是 State<'_, AppState> —— 查不到，与用户报错一致
        assert!(
            app.try_state::<AppState>().is_none(),
            "Arc 包装注册不应能按 AppState 类型解析"
        );
        // 按真实注册类型 Arc<AppState> 反而能查到，进一步印证类型不匹配
        assert!(app.try_state::<Arc<AppState>>().is_some());
    }
}
