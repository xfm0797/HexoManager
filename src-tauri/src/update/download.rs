//! 更新包下载。

use crate::utils::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::PathBuf;

/// 下载结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResult {
    pub path: String,
    pub size: u64,
    pub success: bool,
}

/// 从 URL 下载更新包到指定目录。
///
/// 若未指定 `target_dir`，则落到系统临时目录下的 `hexomanager-update`。
pub async fn download_update(url: &str, target_dir: Option<String>) -> AppResult<DownloadResult> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .user_agent("HexoManager-Updater/1.0")
        .build()
        .map_err(|e| AppError::Network(e.to_string()))?;

    let resp = client.get(url).send().await.map_err(|e| {
        AppError::coded(
            "update.download_failed",
            format!("下载失败：{}", e),
            &[("detail", e.to_string())],
        )
    })?;

    if !resp.status().is_success() {
        return Err(AppError::coded(
            "update.download_status",
            format!("下载失败，服务返回状态码 {}", resp.status()),
            &[("status", resp.status().to_string())],
        ));
    }

    // 推断文件名
    let filename = url
        .split('?')
        .next()
        .unwrap_or(url)
        .rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or("hexomanager-update.bin")
        .to_string();

    let dir: PathBuf = match target_dir {
        Some(d) => PathBuf::from(d),
        None => std::env::temp_dir().join("hexomanager-update"),
    };
    std::fs::create_dir_all(&dir)?;

    let target = dir.join(&filename);
    // 边下边写盘：更新包可达上百 MB，`resp.bytes()` 会把整包读进内存，
    // 在低配机器上直接 OOM。这里按块追加，内存占用只与块大小相关。
    let mut file = std::fs::File::create(&target)?;
    let mut size: u64 = 0;
    let mut resp = resp;
    while let Some(chunk) = resp.chunk().await.map_err(|e| {
        AppError::coded(
            "update.download_read_failed",
            format!("读取下载内容失败：{}", e),
            &[("detail", e.to_string())],
        )
    })? {
        file.write_all(&chunk)?;
        size += chunk.len() as u64;
    }
    file.flush()?;
    drop(file);

    Ok(DownloadResult {
        path: target.display().to_string(),
        size,
        success: true,
    })
}
