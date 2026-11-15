//! 复现 `AppError` 的序列化契约：与 src-tauri/src/utils/error.rs 的关键部分保持一致，
//! 用于在没有 tauri 链接问题的独立 crate 里跑这几条断言。

use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};
use std::collections::BTreeMap;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("操作被拒绝: {0}")]
    Forbidden(String),

    #[error("{0}")]
    Other(String),

    #[error("{message}")]
    Coded {
        code: &'static str,
        message: String,
        params: BTreeMap<String, String>,
    },
}

impl AppError {
    pub fn coded(code: &'static str, message: impl Into<String>, params: &[(&str, String)]) -> Self {
        AppError::Coded {
            code,
            message: message.into(),
            params: params.iter().map(|(k, v)| ((*k).to_string(), v.clone())).collect(),
        }
    }

    pub fn code(&self) -> &'static str {
        match self {
            AppError::Forbidden(_) => "forbidden",
            AppError::Other(_) => "other",
            AppError::Coded { code, .. } => code,
        }
    }

    pub fn message(&self) -> String {
        match self {
            AppError::Coded { message, .. } => message.clone(),
            other => other.to_string(),
        }
    }

    pub fn params(&self) -> &BTreeMap<String, String> {
        match self {
            AppError::Coded { params, .. } => params,
            _ => &EMPTY_PARAMS,
        }
    }
}

static EMPTY_PARAMS: BTreeMap<String, String> = BTreeMap::new();

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut st = serializer.serialize_struct("AppError", 3)?;
        st.serialize_field("code", self.code())?;
        st.serialize_field("message", &self.message())?;
        st.serialize_field("params", self.params())?;
        st.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_coded_serializes_code_and_params() {
        let e = AppError::coded("site.not_found", "站点不存在：12", &[("id", "12".to_string())]);
        let json = serde_json::to_value(&e).unwrap();
        assert_eq!(json["code"], "site.not_found");
        assert_eq!(json["message"], "站点不存在：12");
        assert_eq!(json["params"]["id"], "12");
    }

    #[test]
    fn test_plain_variant_serializes_with_generic_code() {
        let e = AppError::Forbidden("路径不在站点目录内".into());
        let json = serde_json::to_value(&e).unwrap();
        assert_eq!(json["code"], "forbidden");
        assert_eq!(json["message"], "操作被拒绝: 路径不在站点目录内");
        assert!(json["params"].as_object().unwrap().is_empty());
    }

    #[test]
    fn test_display_stays_plain_chinese() {
        let e = AppError::coded("article.not_found", "文章不存在：7", &[]);
        assert_eq!(e.to_string(), "文章不存在：7");
    }

    /// 静态空表必须可用（`&EMPTY_PARAMS` 的生命周期要能提升到 'static）
    #[test]
    fn test_empty_params_is_static() {
        let e = AppError::Other("x".into());
        assert!(e.params().is_empty());
    }
}
