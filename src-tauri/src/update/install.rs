//! 更新包安装（校验签名 → 调用系统安装器）。
//!
//! 安全前提：安装包是**从网络下载的可执行文件**，直接 `msiexec` / `open` 等于
//! 无条件信任下载链路。因此这里先用 `latest.json` 里的 minisign 签名与
//! `tauri.conf.json` 中的公钥做校验，通过后才启动安装器。
//! 拿不到签名（例如走 GitHub Releases API 回退）时拒绝直接执行。

use crate::utils::error::{AppError, AppResult};
use crate::utils::process;
use std::path::Path;

/// 校验安装包签名。
///
/// - `signature`：`latest.json` 中对应平台条目的 `signature` 字段（整段
///   `.sig` 文件内容，含 untrusted/trusted comment 行）
/// - `pubkey_b64`：`plugins.updater.pubkey`（`.pub` 文件内容的 base64）
pub fn verify_signature(path: &Path, signature: &str, pubkey_b64: &str) -> AppResult<()> {
    let public_key = minisign_verify::PublicKey::from_base64(pubkey_b64.trim())
        .map_err(|e| AppError::Other(format!("更新公钥无效：{}", e)))?;
    let sig = minisign_verify::Signature::decode(signature)
        .map_err(|e| AppError::Other(format!("更新包签名格式无效：{}", e)))?;
    let data = std::fs::read(path)
        .map_err(|e| AppError::Other(format!("读取更新包失败（{}）：{}", path.display(), e)))?;

    // allow_legacy = false：只接受预哈希（BLAKE2b）签名，与 tauri 打包产物一致
    public_key
        .verify(&data, &sig, false)
        .map_err(|e| AppError::Other(format!("更新包签名校验失败，已中止安装：{}", e)))
}

/// 安装更新包：按文件扩展名选择系统安装器。
///
/// 签名校验失败或缺失签名时不会执行任何可执行文件。
pub async fn install_update(
    path: &str,
    signature: Option<&str>,
    pubkey_b64: Option<&str>,
) -> AppResult<()> {
    let p = Path::new(path);
    if !p.exists() {
        return Err(AppError::PathNotFound(path.to_string()));
    }

    match (signature, pubkey_b64) {
        (Some(sig), Some(key)) if !sig.trim().is_empty() && !key.trim().is_empty() => {
            verify_signature(p, sig, key).inspect_err(|e| {
                crate::utils::log::error(
                    "update",
                    format!("更新包验签失败，已拒绝安装（{}）：{}", path, e),
                );
            })?;
        }
        _ => {
            crate::utils::log::error(
                "update",
                format!("更新包缺失签名或本地缺少公钥，已拒绝安装：{}", path),
            );
            return Err(AppError::Forbidden(
                "无法校验更新包签名（更新清单未提供签名或本地缺少公钥），已中止安装。\
                 请前往 GitHub Releases 页面手动下载安装包。"
                    .into(),
            ));
        }
    }

    crate::utils::log::info("update", format!("更新包验签通过，准备启动安装器：{}", path));

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

#[cfg(test)]
mod tests {
    use super::*;

    /// 空签名/空公钥必须直接拒绝，不能因为「解析失败」就放行。
    #[test]
    fn test_verify_signature_rejects_empty() {
        let dir = std::env::temp_dir().join(format!("hexo-mgr-sig-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("app.msi");
        std::fs::write(&file, b"fake").unwrap();

        assert!(verify_signature(&file, "", "AAAA").is_err());
        assert!(verify_signature(&file, "untrusted comment: x\nAAAA\n", "").is_err());
        // 结构合法但内容不对的签名
        assert!(verify_signature(&file, "not-a-signature", "not-a-key").is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
