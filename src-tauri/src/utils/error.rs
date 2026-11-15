//! 统一错误类型。
//!
//! **所有命令都返回 `AppResult<T>`**，Tauri 把错误序列化成
//! `{ code, message, params }`：
//!
//! - `code` 是给前端的稳定标识，前端按它查 `src/i18n/errorCodes.ts` 取译文；
//! - `message` 是中文原文，只用于日志、`Display` 与诊断导出；
//! - `params` 填译文的占位符。
//!
//! 于是**改中文措辞不会让译文静默失效** —— 这正是旧的「按中文文本匹配」方案
//! 最大的坑（改一个字译文就没了，而且没人会发现）。
//!
//! ## 两种构造方式
//!
//! - 有具体语义的失败：`AppError::coded("site.not_found", "站点不存在：1", &[…])`，
//!   译文由 `errorCodes.ts` 里对应的条目决定；
//! - 包装外部错误（IO / JSON / 子进程输出…）：直接用 `?` 或粗粒度变体，
//!   它们各自有一个**通用码**（`io` / `json` / `process` …），译文模板里用
//!   `{detail}` 透传外部文本（那部分是操作系统或第三方库给的，本来就翻不了）。
//!
//! 判断标准很简单：**消息里有自己写的中文措辞 → 必须用 `coded`**。
//! 只包了一层外部错误、措辞来自 `AppError` 变体本身的 → 直接用变体。
//! `scripts/error-codes-check.mjs` 会拦下「中文字面量直接塞进原始变体」的写法。
//!
//! 刻意**不实现** `From<String>` / `From<&str>`：字符串进不来，构造错误就必须显式
//! 说清「用哪个码」还是「用哪个变体」，避免再退回 `Err("中文".into())` 的旧写法。

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
    /// `message` 只给人看（日志、`Display`），前端认的是 `code`；
    /// `params` 填 `errorCodes.ts` 译文里的 `{name}` 占位符。
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

    /// 稳定的机器可读标识。
    ///
    /// 粗粒度变体给通用码（`io` / `db` / …），译文模板靠 `{detail}` 透传外部文本；
    /// `Coded` 给具体码。前端没有对应译文时会退回 `message`（中文原文），
    /// 因此漏写不会崩，只是英文界面会露出中文 —— 由 `npm run i18n:check` 拦截。
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

    /// 中文原文：日志、`Display`、以及未翻译语言都靠它。
    pub fn message(&self) -> String {
        match self {
            AppError::Coded { message, .. } => message.clone(),
            other => other.to_string(),
        }
    }

    /// 译文模板的占位值。
    ///
    /// 粗粒度变体统一给一个 `detail`（外部错误文本，通常来自 OS 或第三方库），
    /// 这样译文模板可以写成 `I/O error: {detail}`，不必解析中文前缀。
    pub fn params(&self) -> BTreeMap<String, String> {
        let detail = |s: String| BTreeMap::from([("detail".to_string(), s)]);

        match self {
            AppError::Coded { params, .. } => params.clone(),
            AppError::Database(e) => detail(e.to_string()),
            AppError::Io(e) => detail(e.to_string()),
            AppError::Json(e) => detail(e.to_string()),
            AppError::Template(e) => detail(e.to_string()),
            AppError::Yaml(s)
            | AppError::Network(s)
            | AppError::Process(s)
            | AppError::PathNotFound(s)
            | AppError::InvalidArgument(s)
            | AppError::NotFound(s)
            | AppError::Forbidden(s)
            | AppError::Other(s) => detail(s.clone()),
        }
    }
}

impl From<tauri::Error> for AppError {
    fn from(e: tauri::Error) -> Self {
        AppError::Other(e.to_string())
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut st = serializer.serialize_struct("AppError", 3)?;
        st.serialize_field("code", self.code())?;
        st.serialize_field("message", &self.message())?;
        st.serialize_field("params", &self.params())?;
        st.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;

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

    /// 粗粒度变体也有码，且把内部文本放进 `params.detail`：
    /// 译文模板靠它拼出 `I/O error: …`，不必去解析中文前缀。
    #[test]
    fn test_plain_variant_puts_detail_in_params() {
        let e = AppError::Forbidden("路径不在站点目录内".into());
        let json = serde_json::to_value(&e).unwrap();
        assert_eq!(json["code"], "forbidden");
        assert_eq!(json["message"], "操作被拒绝: 路径不在站点目录内");
        assert_eq!(json["params"]["detail"], "路径不在站点目录内");
    }

    /// 外部错误同样透传 detail，前端拿到的英文前缀由字典决定。
    #[test]
    fn test_wrapped_variant_exposes_detail() {
        let e: AppError = serde_json::from_str::<serde_json::Value>("{")
            .unwrap_err()
            .into();
        assert_eq!(e.code(), "json");
        assert!(!e.params()["detail"].is_empty());
    }

    /// `to_string()` 仍是中文原文 —— 日志与诊断导出读它。
    #[test]
    fn test_display_stays_plain_chinese() {
        let e = AppError::coded("article.not_found", "文章不存在：7", &[]);
        assert_eq!(e.to_string(), "文章不存在：7");
    }
}
