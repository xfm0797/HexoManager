//! 统一错误类型。
//!
//! 有两种形态，前端都吃：
//!
//! - **结构化**（迁移完成的模块）：命令返回 `AppResult<T>`，Tauri 把错误序列化成
//!   `{ code, message, params }`。前端按 `code` 查 `src/i18n/errorCodes.ts` 取译文，
//!   因此**改中文措辞不会让译文静默失效** —— 这正是 i18n 过渡层最大的坑。
//! - **字符串**（尚未迁移的模块）：命令返回 `Result<T, String>`，即中文原文，
//!   前端继续走旧的「精确表 + 正则表」兜底。
//!
//! 迁移一个命令只需把签名从 `Result<T, String>` 换成 `AppResult<T>`，
//! 顺手删掉 `map_err(|e| e.to_string())`（`?` 会走 `From`）。

use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};
use std::collections::BTreeMap;

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

    /// 带稳定错误码的错误：`code` 不变、`message` 可随意改措辞。
    ///
    /// 用于高频路径（文章、站点），前端按 `code` 取译文，`params` 填模板占位符。
    #[error("{message}")]
    Coded {
        code: &'static str,
        message: String,
        params: BTreeMap<String, String>,
    },
}

impl AppError {
    /// 构造带稳定错误码的错误。
    ///
    /// ```
    /// # use hexo_manager_lib::utils::error::AppError;
    /// AppError::coded("site.not_found", "站点不存在：1", &[("id", "1".into())]);
    /// ```
    pub fn coded(
        code: &'static str,
        message: impl Into<String>,
        params: &[(&str, String)],
    ) -> Self {
        AppError::Coded {
            code,
            message: message.into(),
            params: params
                .iter()
                .map(|(k, v)| ((*k).to_string(), v.clone()))
                .collect(),
        }
    }

    /// 稳定的机器可读标识。粗粒度变体给通用码，`Coded` 给具体码。
    ///
    /// 前端没有对应译文时会退回 `message`（中文原文）走旧的字符串映射，
    /// 因此这里新增码是安全的。
    pub fn code(&self) -> &'static str {
        match self {
            AppError::Database(_) => "db",
            AppError::Io(_) => "io",
            AppError::Json(_) => "json",
            AppError::Yaml(_) => "yaml",
            AppError::Template(_) => "template",
            AppError::Network(_) => "network",
            AppError::Process(_) => "process",
            AppError::PathNotFound(_) => "path_not_found",
            AppError::InvalidArgument(_) => "invalid_argument",
            AppError::NotFound(_) => "not_found",
            AppError::Forbidden(_) => "forbidden",
            AppError::Other(_) => "other",
            AppError::Coded { code, .. } => code,
        }
    }

    /// 中文原文：日志、旧映射表兜底、以及未翻译语言都靠它。
    pub fn message(&self) -> String {
        match self {
            AppError::Coded { message, .. } => message.clone(),
            other => other.to_string(),
        }
    }

    /// 译文模板的占位值；无占位符时为空表。
    pub fn params(&self) -> &BTreeMap<String, String> {
        match self {
            AppError::Coded { params, .. } => params,
            _ => &EMPTY_PARAMS,
        }
    }
}

static EMPTY_PARAMS: BTreeMap<String, String> = BTreeMap::new();

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
        let mut st = serializer.serialize_struct("AppError", 3)?;
        st.serialize_field("code", self.code())?;
        st.serialize_field("message", &self.message())?;
        st.serialize_field("params", self.params())?;
        st.end()
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

#[cfg(test)]
mod tests {
    use super::*;

    /// `Coded` 必须原样带上 code / params：前端靠它们取译文，不靠中文措辞。
    #[test]
    fn test_coded_serializes_code_and_params() {
        let e = AppError::coded(
            "site.not_found",
            "站点不存在：12",
            &[("id", "12".to_string())],
        );
        let json = serde_json::to_value(&e).unwrap();
        assert_eq!(json["code"], "site.not_found");
        assert_eq!(json["message"], "站点不存在：12");
        assert_eq!(json["params"]["id"], "12");
    }

    /// 粗粒度变体也有码，且 params 是空对象（不是 null，前端可直接展开）。
    #[test]
    fn test_plain_variant_serializes_with_generic_code() {
        let e = AppError::Forbidden("路径不在站点目录内".into());
        let json = serde_json::to_value(&e).unwrap();
        assert_eq!(json["code"], "forbidden");
        assert_eq!(json["message"], "操作被拒绝: 路径不在站点目录内");
        assert!(json["params"].as_object().unwrap().is_empty());
    }

    /// `to_string()` 仍是中文原文 —— 旧模块用 `.map_err(|e| e.to_string())` 不受影响。
    #[test]
    fn test_display_stays_plain_chinese() {
        let e = AppError::coded("article.not_found", "文章不存在：7", &[]);
        assert_eq!(e.to_string(), "文章不存在：7");
    }
}
