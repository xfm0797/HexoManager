//! 文件操作命令（对应大纲 7.6）。
//!
//! 安全边界：渲染进程能调用的文件操作必须有范围限制。此前的 `ensure_safe`
//! 只拒绝「根目录」，等于任意绝对路径都可读写删（一次 XSS 就能读走 `~/.ssh`、
//! 覆写任意文件）。
//!
//! 现在的策略：
//! - 默认只允许操作**已注册站点目录**及其子目录（外加应用数据目录）；
//! - 用户通过系统对话框选定的路径（导出配置、保存日志、导入配置）由前端显式
//!   传 `allowOutside: true`，这类路径本来就是用户主动选的；
//! - 一律拒绝根目录。
//!
//! 线程模型：这些命令全部是 `async fn`，真正的 IO 放在 `spawn_blocking` 里。
//! 同步命令在 Tauri 2 会跑在主线程上，读一张 30 MB 的图片或遍历 node_modules
//! 都会让窗口假死 —— 详见 `utils::blocking` 的模块注释。

use crate::AppState;
use crate::db::Db;
use crate::utils::blocking;
use crate::utils::error::{AppError, AppResult};
use crate::utils::{FileInfo, FileTreeNode};
use std::path::{Path, PathBuf};
use tauri::State;

/// 允许操作的根目录：全部已注册站点 + 应用数据目录。
fn allowed_roots(db: &Db) -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Ok(conn) = db.conn() {
        if let Ok(mut stmt) = conn.prepare("SELECT path FROM sites") {
            if let Ok(rows) = stmt.query_map([], |r| r.get::<_, String>(0)) {
                for path in rows.flatten() {
                    roots.push(canonical_ish(Path::new(&path)));
                }
            }
        }
    }
    roots
}

/// 尽量规范化路径：路径（或其父级）不存在时，逐级向上规范化再拼回来。
///
/// 直接用 `canonicalize` 对「即将创建的文件」会失败，而安全校验又必须发生在
/// 创建之前，所以退化为「已有祖先 + 剩余文件名」。
fn canonical_ish(path: &Path) -> PathBuf {
    if let Ok(p) = path.canonicalize() {
        return p;
    }
    match path.parent() {
        Some(parent) if parent != path && !parent.as_os_str().is_empty() => {
            let mut out = canonical_ish(parent);
            if let Some(name) = path.file_name() {
                out.push(name);
            }
            out
        }
        _ => path.to_path_buf(),
    }
}

/// 判断 `path` 是否位于某个允许的根目录内。
fn is_within_roots(path: &Path, roots: &[PathBuf]) -> bool {
    let candidate = canonical_ish(path);
    // Windows 路径大小写不敏感，统一小写后按前缀比较
    let candidate_str = candidate.to_string_lossy().to_lowercase();
    roots.iter().any(|root| {
        let root_str = root.to_string_lossy().to_lowercase();
        candidate_str == root_str
            || candidate_str.starts_with(&format!("{}{}", root_str, std::path::MAIN_SEPARATOR))
            || candidate_str.starts_with(&format!("{}/", root_str))
    })
}

/// 安全校验入口。
///
/// `allow_outside`：用户通过系统对话框主动选定的路径（导出/导入）可为 true。
fn ensure_safe(db: &Db, path: &str, allow_outside: bool) -> AppResult<()> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidArgument("路径不能为空".into()));
    }

    let p = Path::new(trimmed);
    // 禁止操作根目录，避免误删系统文件
    if p.parent().is_none() {
        return Err(AppError::Forbidden(format!(
            "出于安全考虑，不允许直接操作根目录：{}",
            path
        )));
    }

    if allow_outside {
        return Ok(());
    }

    let roots = allowed_roots(db);
    if is_within_roots(p, &roots) {
        return Ok(());
    }

    Err(AppError::Forbidden(format!(
        "路径不在任何站点目录内，已拒绝操作：{}",
        path
    )))
}

/// 读取文件内容。
#[tauri::command]
pub async fn read_file(
    state: State<'_, AppState>,
    path: String,
    allow_outside: Option<bool>,
) -> Result<String, String> {
    let db = Db::from_arc(&state.db);
    let outside = allow_outside.unwrap_or(false);
    blocking::cmd(move || {
        ensure_safe(&db, &path, outside).map_err(|e| e.to_string())?;

        let p = Path::new(&path);
        if !p.exists() {
            return Err(format!("文件不存在：{}", path));
        }
        if p.is_dir() {
            return Err(format!("目标是一个目录，无法作为文件读取：{}", path));
        }
        std::fs::read_to_string(p).map_err(|e| format!("读取文件失败：{}", e))
    })
    .await
}

/// 写入文件内容（自动创建父目录）。
#[tauri::command]
pub async fn write_file(
    state: State<'_, AppState>,
    path: String,
    content: String,
    allow_outside: Option<bool>,
) -> Result<(), String> {
    let db = Db::from_arc(&state.db);
    let outside = allow_outside.unwrap_or(false);
    blocking::cmd(move || {
        ensure_safe(&db, &path, outside).map_err(|e| e.to_string())?;
        let p = Path::new(&path);
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败：{}", e))?;
        }
        std::fs::write(p, content).map_err(|e| format!("写入文件失败：{}", e))
    })
    .await
}

/// 删除文件或空目录。
#[tauri::command]
pub async fn delete_file(
    state: State<'_, AppState>,
    path: String,
    allow_outside: Option<bool>,
) -> Result<(), String> {
    let db = Db::from_arc(&state.db);
    let outside = allow_outside.unwrap_or(false);
    blocking::cmd(move || {
        ensure_safe(&db, &path, outside).map_err(|e| e.to_string())?;
        let p = Path::new(&path);
        if !p.exists() {
            return Ok(());
        }
        if p.is_dir() {
            // 仅删除空目录，避免误删整个站点
            std::fs::remove_dir(p).map_err(|e| format!("删除目录失败（目录可能非空）：{}", e))
        } else {
            std::fs::remove_file(p).map_err(|e| format!("删除文件失败：{}", e))
        }
    })
    .await
}

/// 列出目录下的文件。
#[tauri::command]
pub async fn list_files(
    state: State<'_, AppState>,
    path: String,
    pattern: Option<String>,
    allow_outside: Option<bool>,
) -> Result<Vec<FileInfo>, String> {
    let db = Db::from_arc(&state.db);
    let outside = allow_outside.unwrap_or(false);
    blocking::cmd(move || {
        ensure_safe(&db, &path, outside).map_err(|e| e.to_string())?;

        let p = Path::new(&path);
        if !p.exists() {
            return Err(format!("目录不存在：{}", path));
        }
        if !p.is_dir() {
            return Err(format!("目标不是目录：{}", path));
        }

        let mut files = Vec::new();
        let entries = std::fs::read_dir(p).map_err(|e| format!("读取目录失败：{}", e))?;

        for entry in entries.flatten() {
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let name = entry.file_name().to_string_lossy().to_string();

            // 扩展名过滤
            if let Some(ref pat) = pattern {
                if !pat.trim().is_empty() {
                    let ext = name.rsplit('.').next().unwrap_or("");
                    let ok = pat
                        .split(',')
                        .map(|s| s.trim().trim_start_matches('.'))
                        .any(|s| s.eq_ignore_ascii_case(ext));
                    if !ok {
                        continue;
                    }
                }
            }

            files.push(FileInfo {
                name,
                path: entry.path().display().to_string(),
                is_dir: meta.is_dir(),
                size: meta.len(),
                modified_at: meta
                    .modified()
                    .ok()
                    .and_then(crate::utils::format_system_time),
                extension: entry
                    .path()
                    .extension()
                    .map(|s| s.to_string_lossy().to_string()),
            });
        }

        // 目录优先，同级按名称排序
        files.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.cmp(&b.name)));
        Ok(files)
    })
    .await
}

/// 创建目录。
#[tauri::command]
pub async fn create_directory(
    state: State<'_, AppState>,
    path: String,
    allow_outside: Option<bool>,
) -> Result<(), String> {
    let db = Db::from_arc(&state.db);
    let outside = allow_outside.unwrap_or(false);
    blocking::cmd(move || {
        ensure_safe(&db, &path, outside).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&path).map_err(|e| format!("创建目录失败：{}", e))
    })
    .await
}

/// 检查文件或目录是否存在。
///
/// 只做一次 `metadata`，开销可忽略；刻意保持同步命令，避免为一次 stat
/// 付线程池调度的代价。
#[tauri::command]
pub fn file_exists(path: String) -> bool {
    Path::new(&path).exists()
}

/// 获取文件树。
#[tauri::command]
pub async fn get_file_tree(
    state: State<'_, AppState>,
    path: String,
    max_depth: Option<usize>,
    allow_outside: Option<bool>,
) -> Result<FileTreeNode, String> {
    let db = Db::from_arc(&state.db);
    let outside = allow_outside.unwrap_or(false);
    let depth = max_depth.unwrap_or(4);
    blocking::cmd(move || {
        ensure_safe(&db, &path, outside).map_err(|e| e.to_string())?;

        let p = Path::new(&path);
        if !p.exists() {
            return Err(format!("路径不存在：{}", path));
        }
        Ok(FileTreeNode::from_path(p, 0, depth))
    })
    .await
}

/// 在系统文件管理器中打开路径。
#[tauri::command]
pub fn open_in_explorer(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    let target = Path::new(&path);
    if !target.exists() {
        return Err(format!("路径不存在：{}", path));
    }

    // 文件则打开其所在目录并选中
    let to_open = if target.is_dir() {
        path.clone()
    } else {
        target
            .parent()
            .map(|p| p.display().to_string())
            .unwrap_or(path.clone())
    };

    app.opener()
        .open_path(to_open, None::<&str>)
        .map_err(|e| format!("打开目录失败：{}", e))
}

/// 复制文件或目录。
#[tauri::command]
pub async fn copy_path(
    state: State<'_, AppState>,
    from: String,
    to: String,
    allow_outside: Option<bool>,
) -> Result<(), String> {
    let db = Db::from_arc(&state.db);
    let outside = allow_outside.unwrap_or(false);
    // 目录复制可能是几百 MB（node_modules / themes），必须在阻塞线程池里跑
    blocking::cmd(move || {
        ensure_safe(&db, &from, outside).map_err(|e| e.to_string())?;
        ensure_safe(&db, &to, outside).map_err(|e| e.to_string())?;

        let src = Path::new(&from);
        if !src.exists() {
            return Err(format!("源路径不存在：{}", from));
        }
        if src.is_dir() {
            crate::utils::fs::copy_dir(src, Path::new(&to)).map_err(|e| e.to_string())
        } else {
            if let Some(parent) = Path::new(&to).parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败：{}", e))?;
            }
            std::fs::copy(src, Path::new(&to)).map_err(|e| format!("复制文件失败：{}", e))?;
            Ok(())
        }
    })
    .await
}

/// 重命名/移动路径。
#[tauri::command]
pub async fn rename_path(
    state: State<'_, AppState>,
    from: String,
    to: String,
    allow_outside: Option<bool>,
) -> Result<(), String> {
    let db = Db::from_arc(&state.db);
    let outside = allow_outside.unwrap_or(false);
    blocking::cmd(move || {
        ensure_safe(&db, &from, outside).map_err(|e| e.to_string())?;
        ensure_safe(&db, &to, outside).map_err(|e| e.to_string())?;
        std::fs::rename(&from, &to).map_err(|e| format!("重命名失败：{}", e))
    })
    .await
}

/// 读取二进制文件的 Base64 内容（用于图片预览等场景）。
#[tauri::command]
pub async fn read_file_base64(
    state: State<'_, AppState>,
    path: String,
    allow_outside: Option<bool>,
) -> Result<String, String> {
    let db = Db::from_arc(&state.db);
    let outside = allow_outside.unwrap_or(false);
    blocking::cmd(move || {
        use base64_encode::encode;

        ensure_safe(&db, &path, outside).map_err(|e| e.to_string())?;

        let p = Path::new(&path);
        if !p.exists() {
            return Err(format!("文件不存在：{}", path));
        }
        let bytes = std::fs::read(p).map_err(|e| format!("读取文件失败：{}", e))?;
        Ok(encode(&bytes))
    })
    .await
}

/// 极简 Base64 编码实现，避免为单一用途引入额外依赖。
mod base64_encode {
    const CHARS: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    pub fn encode(input: &[u8]) -> String {
        let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
        for chunk in input.chunks(3) {
            let b0 = chunk[0] as u32;
            let b1 = *chunk.get(1).unwrap_or(&0) as u32;
            let b2 = *chunk.get(2).unwrap_or(&0) as u32;
            let n = (b0 << 16) | (b1 << 8) | b2;

            out.push(CHARS[((n >> 18) & 63) as usize] as char);
            out.push(CHARS[((n >> 12) & 63) as usize] as char);
            out.push(if chunk.len() > 1 {
                CHARS[((n >> 6) & 63) as usize] as char
            } else {
                '='
            });
            out.push(if chunk.len() > 2 {
                CHARS[(n & 63) as usize] as char
            } else {
                '='
            });
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::{Arc, Mutex};

    fn db_with_site(path: &str) -> Db {
        let conn = Connection::open_in_memory().expect("内存数据库");
        conn.execute_batch("CREATE TABLE sites (id INTEGER PRIMARY KEY, path TEXT NOT NULL);")
            .expect("建表");
        conn.execute("INSERT INTO sites (id, path) VALUES (1, ?1)", [path])
            .expect("插入站点");
        Db(Arc::new(Mutex::new(conn)))
    }

    /// 站点目录内的路径允许操作（包括尚不存在的子路径）。
    #[test]
    fn test_path_inside_site_is_allowed() {
        let dir = std::env::temp_dir().join(format!("hexo-mgr-fs-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("source")).unwrap();
        let db = db_with_site(dir.to_str().unwrap());

        let inside = dir.join("source").join("_posts").join("a.md");
        assert!(ensure_safe(&db, inside.to_str().unwrap(), false).is_ok());
        assert!(ensure_safe(&db, dir.to_str().unwrap(), false).is_ok());

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 站点外的路径默认拒绝 —— 这是本次要堵的任意路径读写漏洞。
    #[test]
    fn test_path_outside_site_is_rejected() {
        let dir = std::env::temp_dir().join(format!("hexo-mgr-fs-out-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = db_with_site(dir.to_str().unwrap());

        let outside = dir.parent().unwrap().join("secret.txt");
        assert!(
            ensure_safe(&db, outside.to_str().unwrap(), false).is_err(),
            "站点外的路径必须被拒绝"
        );

        // 用户通过对话框选定的路径可以显式放行
        assert!(ensure_safe(&db, outside.to_str().unwrap(), true).is_ok());

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 用 `..` 跳出站点目录也要被拦住（规范化后再比对前缀）。
    #[test]
    fn test_dotdot_escape_is_rejected() {
        let dir = std::env::temp_dir().join(format!("hexo-mgr-fs-esc-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = db_with_site(dir.to_str().unwrap());

        let escaped = format!("{}/../escaped.txt", dir.display());
        assert!(
            ensure_safe(&db, &escaped, false).is_err(),
            "`..` 跳出的路径必须被拒绝"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 空路径与根目录一律拒绝。
    #[test]
    fn test_empty_and_root_rejected() {
        let db = db_with_site("/nonexistent-site");
        assert!(ensure_safe(&db, "   ", false).is_err());
        let root = std::path::MAIN_SEPARATOR.to_string();
        assert!(ensure_safe(&db, &root, false).is_err());
        assert!(ensure_safe(&db, &root, true).is_err(), "根目录即便放行也不允许");
    }
}
