//! YAML 配置解析与写入。
//!
//! 站点的 `_config.yml`、主题的 `_config.yml` 均通过本模块读写，解析为
//! `serde_json::Value` 以便前端直接消费。

use crate::utils::error::{AppError, AppResult};
use serde_json::Value;
use std::path::Path;

/// 与前端约定的 YAML 值类型别名。
pub type YamlValue = Value;

/// 读取并解析 YAML 文件为 JSON 值。
pub fn parse_yaml_file(path: &str) -> AppResult<Value> {
    let p = Path::new(path);
    if !p.exists() {
        return Err(AppError::PathNotFound(path.to_string()));
    }
    let raw = std::fs::read_to_string(p)?;
    parse_yaml_str(&raw)
}

/// 解析 YAML 字符串为 JSON 值。
pub fn parse_yaml_str(raw: &str) -> AppResult<Value> {
    // Hexo 站点配置中存在 `!!js/function` 等自定义标签，直接解析可能失败；
    // 失败时做一次容错处理：剥离未知标签后重试。
    match serde_yaml::from_str::<Value>(raw) {
        Ok(v) => Ok(v),
        Err(first_err) => {
            let sanitized = sanitize_custom_tags(raw);
            serde_yaml::from_str::<Value>(&sanitized)
                .map_err(|e| AppError::Yaml(format!("{}（原始错误：{}）", e, first_err)))
        }
    }
}

/// 将 `!!js/xxx` 之类的自定义标签剥离为普通值，避免解析失败。
fn sanitize_custom_tags(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for line in raw.lines() {
        if line.contains("!!js/") {
            // 把 `key: !!js/function '...'` 转为 `key: null`
            if let Some(idx) = line.find(':') {
                let (k, _) = line.split_at(idx + 1);
                out.push_str(k);
                out.push_str(" null");
                out.push('\n');
                continue;
            }
        }
        out.push_str(line);
        out.push('\n');
    }
    out
}

/// 将 JSON 值序列化为 YAML 并写入文件。
pub fn write_yaml_file(path: &str, value: &Value) -> AppResult<()> {
    let p = Path::new(path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let yaml = serde_yaml::to_string(value).map_err(|e| AppError::Yaml(e.to_string()))?;
    std::fs::write(p, yaml)?;
    Ok(())
}

/// 读取原始 YAML 文本（保留注释与格式，供原始编辑器使用）。
pub fn read_raw(path: &str) -> AppResult<String> {
    let p = Path::new(path);
    if !p.exists() {
        return Err(AppError::PathNotFound(path.to_string()));
    }
    Ok(std::fs::read_to_string(p)?)
}

/// 写入原始 YAML 文本。
pub fn write_raw(path: &str, content: &str) -> AppResult<()> {
    let p = Path::new(path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(p, content)?;
    Ok(())
}

/// 校验 YAML 文本合法性。
pub fn validate_yaml(content: &str) -> AppResult<()> {
    parse_yaml_str(content).map(|_| ())
}
