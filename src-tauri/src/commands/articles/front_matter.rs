//! Front Matter 解析与组装。
//!
//! 纯文本 ↔ 结构化数据的转换，不碰数据库，也不依赖 Tauri 状态 —— 单独成模块
//! 是为了能和模板套用（`template_commands`）共用同一套语义。

use crate::utils::error::{AppError, AppResult};
use serde_json::Value;

/// 将 YAML 值统一转为字符串列表（兼容 `["a"]`、`"a"`、`[["a","b"]]`）。
pub fn to_string_list(value: &Value) -> Vec<String> {
    match value {
        Value::String(s) => {
            if s.trim().is_empty() {
                Vec::new()
            } else {
                vec![s.clone()]
            }
        }
        Value::Array(arr) => {
            let mut out = Vec::new();
            for item in arr {
                match item {
                    Value::String(s) => {
                        if !s.trim().is_empty() {
                            out.push(s.clone());
                        }
                    }
                    // Hexo 支持嵌套数组表示多级分类：categories: [[a, b]]
                    Value::Array(inner) => {
                        for sub in inner {
                            if let Some(s) = sub.as_str() {
                                if !s.trim().is_empty() {
                                    out.push(s.to_string());
                                }
                            }
                        }
                    }
                    Value::Number(n) => out.push(n.to_string()),
                    _ => {}
                }
            }
            out
        }
        _ => Vec::new(),
    }
}

/// 拆分 Markdown 文件的 Front Matter 与正文。
///
/// 返回 `(front_matter_json, body)`。
pub fn split_front_matter(content: &str) -> (Option<Value>, String) {
    let trimmed = content.trim_start_matches('\u{feff}');
    if !trimmed.starts_with("---") {
        return (None, content.to_string());
    }

    // 找结束分隔符
    let after_first = &trimmed[3..];
    let end_idx = after_first
        .find("\n---")
        .or_else(|| after_first.find("\r\n---"));

    let Some(idx) = end_idx else {
        return (None, content.to_string());
    };

    let front_str = &after_first[..idx];
    // 跳过结束标记所在行
    let rest = &after_first[idx..];
    let body_start = rest
        .find('\n')
        .map(|i| idx + i + 1)
        .unwrap_or(after_first.len());

    let body = after_first[body_start..].to_string();

    match crate::hexo::config_parser::parse_yaml_str(front_str) {
        Ok(v) => (Some(v), body),
        Err(_) => (None, content.to_string()),
    }
}

/// 组装 Front Matter 与正文。
pub fn build_front_matter(front: &Value, body: &str) -> AppResult<String> {
    let yaml = serde_yaml::to_string(front).map_err(|e| AppError::Yaml(e.to_string()))?;
    let yaml = yaml.trim_start_matches("---\n").trim_end_matches('\n');
    Ok(format!(
        "---\n{}\n---\n\n{}",
        yaml,
        body.trim_start_matches('\n')
    ))
}

/// 读取文章源文件并解析。
pub(crate) fn read_article_file(file_path: &str) -> AppResult<(Value, String)> {
    let content = std::fs::read_to_string(file_path)?;
    let (front, body) = split_front_matter(&content);
    Ok((front.unwrap_or_else(|| serde_json::json!({})), body))
}
