//! 诊断与日志命令。
//!
//! 桌面应用最常见的报障方式是「我点保存没反应」，没有日志就只能靠猜。
//! 这里把两端的失败收进同一个日志文件：
//!
//! - 前端 `services/invoke.ts` 的 catch 调用 `log_client_error` 上报；
//! - 后端命令的关键路径（预览服务、更新检查、数据库初始化）自己写。
//!
//! 用户在「偏好设置 → 关于」里点「导出诊断日志」即可拿到一个可直接发送的文本。

use crate::utils::blocking;
use crate::utils::error::AppResult;
use crate::utils::log;
use std::path::Path;

/// 记录前端捕获的失败。
///
/// 只写 command 名与错误消息 —— 参数里可能含文章正文，不入库不入日志。
#[tauri::command]
pub fn log_client_error(command: String, message: String) {
    log::error(
        "frontend",
        format!("命令 `{}` 失败：{}", command, message.trim()),
    );
}

/// 当前日志文件路径（供界面展示「日志位置」）。
#[tauri::command]
pub fn get_log_path() -> Option<String> {
    log::log_path().map(|p| p.display().to_string())
}

/// 日志目录路径。
#[tauri::command]
pub fn get_log_dir() -> Option<String> {
    log::log_dir().map(|p| p.display().to_string())
}

/// 把最近日志合并导出到 `target`，返回实际写入的文件路径。
#[tauri::command]
pub async fn export_logs(target: String) -> AppResult<String> {
    blocking::run(move || log::export_to(Path::new(&target))).await
}
