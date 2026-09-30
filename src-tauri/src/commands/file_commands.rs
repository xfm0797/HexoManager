//! 文件操作命令（对应大纲 7.6）。

use crate::utils::error::{AppError, AppResult};
use crate::utils::{FileInfo, FileTreeNode};
use std::path::Path;

/// 安全校验：拒绝明显越界的路径操作（保留用户主目录内的自由操作）。
fn ensure_safe(path: &str) -> AppResult<()> {
    if path.trim().is_empty() {
        return Err(AppError::InvalidArgument("路径不能为空".into()));
    }
    // 禁止操作根目录，避免误删系统文件
    let p = Path::new(path);
    if p.parent().is_none() {
        return Err(AppError::Forbidden(format!(
            "出于安全考虑，不允许直接操作根目录：{}",
            path
        )));
    }
    Ok(())
}

/// 读取文件内容。
#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("文件不存在：{}", path));
    }
    if p.is_dir() {
        return Err(format!("目标是一个目录，无法作为文件读取：{}", path));
    }
    std::fs::read_to_string(p).map_err(|e| format!("读取文件失败：{}", e))
}

/// 写入文件内容（自动创建父目录）。
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    ensure_safe(&path).map_err(|e| e.to_string())?;
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败：{}", e))?;
    }
    std::fs::write(p, content).map_err(|e| format!("写入文件失败：{}", e))
}

/// 删除文件或空目录。
#[tauri::command]
pub fn delete_file(path: String) -> Result<(), String> {
    ensure_safe(&path).map_err(|e| e.to_string())?;
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
}

/// 列出目录下的文件。
#[tauri::command]
pub fn list_files(path: String, pattern: Option<String>) -> Result<Vec<FileInfo>, String> {
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
}

/// 创建目录。
#[tauri::command]
pub fn create_directory(path: String) -> Result<(), String> {
    ensure_safe(&path).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&path).map_err(|e| format!("创建目录失败：{}", e))
}

/// 检查文件或目录是否存在。
#[tauri::command]
pub fn file_exists(path: String) -> bool {
    Path::new(&path).exists()
}

/// 获取文件树。
#[tauri::command]
pub fn get_file_tree(path: String, max_depth: Option<usize>) -> Result<FileTreeNode, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("路径不存在：{}", path));
    }
    Ok(FileTreeNode::from_path(p, 0, max_depth.unwrap_or(4)))
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
pub fn copy_path(from: String, to: String) -> Result<(), String> {
    let src = Path::new(&from);
    if !src.exists() {
        return Err(format!("源路径不存在：{}", from));
    }
    if src.is_dir() {
        copy_dir(src, Path::new(&to)).map_err(|e| e.to_string())
    } else {
        if let Some(parent) = Path::new(&to).parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败：{}", e))?;
        }
        std::fs::copy(src, Path::new(&to)).map_err(|e| format!("复制文件失败：{}", e))?;
        Ok(())
    }
}

fn copy_dir(src: &Path, dst: &Path) -> AppResult<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &to)?;
        } else {
            std::fs::copy(entry.path(), &to)?;
        }
    }
    Ok(())
}

/// 重命名/移动路径。
#[tauri::command]
pub fn rename_path(from: String, to: String) -> Result<(), String> {
    ensure_safe(&from).map_err(|e| e.to_string())?;
    ensure_safe(&to).map_err(|e| e.to_string())?;
    std::fs::rename(&from, &to).map_err(|e| format!("重命名失败：{}", e))
}

/// 读取二进制文件的 Base64 内容（用于图片预览等场景）。
#[tauri::command]
pub fn read_file_base64(path: String) -> Result<String, String> {
    use base64_encode::encode;

    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("文件不存在：{}", path));
    }
    let bytes = std::fs::read(p).map_err(|e| format!("读取文件失败：{}", e))?;
    Ok(encode(&bytes))
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
