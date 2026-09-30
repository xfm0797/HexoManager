//! 更新包安装（调用系统安装器 / 打开文件位置）。
//!
//! 说明：真正的自动替换由 `tauri-plugin-updater` 完成，本模块负责
//! 手动下载场景下的「启动安装包」动作。

use crate::utils::error::{AppError, AppResult};
use crate::utils::process;
use std::path::Path;

/// 安装更新包：按文件扩展名选择系统安装器。
pub async fn install_update(path: &str) -> AppResult<()> {
    let p = Path::new(path);
    if !p.exists() {
        return Err(AppError::PathNotFound(path.to_string()));
    }

    let ext = p
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    #[cfg(target_os = "windows")]
    {
        // .msi 用 msiexec，.exe 直接运行
        if ext == "msi" {
            process::run("msiexec", &["/i", path], None, None).await?;
        } else {
            process::run("cmd", &["/C", "start", "", path], None, None).await?;
        }
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        process::run("open", &[path], None, None).await?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        if ext == "deb" {
            process::run("xdg-open", &[path], None, None).await?;
        } else if ext == "appimage" {
            // 赋予可执行权限后运行
            let _ = std::process::Command::new("chmod")
                .args(["+x", path])
                .status();
            process::run("xdg-open", &[path], None, None).await?;
        } else {
            process::run("xdg-open", &[path], None, None).await?;
        }
        Ok(())
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        let _ = ext;
        Err(AppError::Other("当前平台不支持自动安装".into()))
    }
}
