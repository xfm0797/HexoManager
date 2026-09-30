//! 统一错误类型。
//!
//! Tauri 命令统一返回 `Result<T, String>`，因此 `AppError` 实现到 `String` 的转换。

use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("数据库错误: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON 解析错误: {0}")]
    Json(#[from] serde_json::Error),

    #[error("YAML 解析错误: {0}")]
    Yaml(String),

    #[error("模板渲染错误: {0}")]
    Template(#[from] handlebars::RenderError),

    #[error("网络请求错误: {0}")]
    Network(String),

    #[error("命令执行失败: {0}")]
    Process(String),

    #[error("路径不存在: {0}")]
    PathNotFound(String),

    #[error("参数非法: {0}")]
    InvalidArgument(String),

    #[error("资源未找到: {0}")]
    NotFound(String),

    #[error("操作被拒绝: {0}")]
    Forbidden(String),

    #[error("{0}")]
    Other(String),
}

impl From<tauri::Error> for AppError {
    fn from(e: tauri::Error) -> Self {
        AppError::Other(e.to_string())
    }
}

impl From<String> for AppError {
    fn from(e: String) -> Self {
        AppError::Other(e)
    }
}

impl From<&str> for AppError {
    fn from(e: &str) -> Self {
        AppError::Other(e.to_string())
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

/// 便捷宏：快速构造 `AppError::Other`
#[macro_export]
macro_rules! err {
    ($($arg:tt)*) => {
        $crate::utils::error::AppError::Other(format!($($arg)*))
    };
}
