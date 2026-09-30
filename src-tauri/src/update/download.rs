//! 更新包下载。

use crate::utils::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
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

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| AppError::Network(format!("下载失败：{}", e)))?;

    if !resp.status().is_success() {
        return Err(AppError::Network(format!(
            "下载失败，服务返回状态码 {}",
            resp.status()
        )));
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
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| AppError::Network(format!("读取下载内容失败：{}", e)))?;

    std::fs::write(&target, &bytes)?;

    Ok(DownloadResult {
        path: target.display().to_string(),
        size: bytes.len() as u64,
        success: true,
    })
}
