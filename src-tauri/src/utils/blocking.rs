//! 把会阻塞的同步 IO 移出主线程。
//!
//! Tauri 2 对 `#[tauri::command]` 的分派规则：
//!
//! - `async fn` → 在 tokio 运行时上执行；
//! - 普通 `fn`   → 在**主线程**（事件循环线程）上执行。
//!
//! 也就是说，同步命令里做文件读写、递归遍历目录、解析 YAML，都会直接卡住
//! 窗口渲染与消息循环 —— 一个 200 MB 的 `read_file_base64` 足以让界面假死十几秒。
//! 这里的辅助函数把这类工作丢进 `spawn_blocking` 的专用线程池，命令本身只需
//! 声明为 `async fn`（前端调用方式不变）。

use crate::utils::error::{AppError, AppResult};

/// 在阻塞线程池里执行 `f`，并把任务 join 失败也归一成 `AppResult`。
///
/// join 失败意味着闭包 panic 了（工作线程被丢弃），属于程序缺陷；
/// 归一成错误而不是再次 panic，至少能让界面给出可读提示、日志留下现场。
pub async fn run<T, F>(f: F) -> AppResult<T>
where
    F: FnOnce() -> AppResult<T> + Send + 'static,
    T: Send + 'static,
{
    match tauri::async_runtime::spawn_blocking(f).await {
        Ok(result) => result,
        Err(e) => Err(AppError::coded(
            "proc.join_failed",
            format!("后台任务异常终止：{}", e),
            &[("detail", e.to_string())],
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_run_maps_error() {
        let err = run(|| Err::<(), _>(AppError::Forbidden("no".into())))
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::Forbidden(_)));
    }
}
