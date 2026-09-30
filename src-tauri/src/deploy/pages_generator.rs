//! Pages 服务配置生成（面向 Pages 类平台的项目级配置）。
//!
//! 与 `config_generator` 的区别：本模块专注于各 Pages 平台所需的最小
//! 项目配置文件内容与说明，供前端「Pages 服务配置」页面直接展示。

use crate::models::{GenerateConfigInput, GeneratedFile};
use crate::utils::error::AppResult;

/// Pages 平台标识。
pub const PAGES_PLATFORMS: &[&str] = &[
    "github",
    "gitee",
    "gitlab",
    "vercel",
    "netlify",
    "cloudflare",
    "edgeone",
];

/// 生成指定 Pages 平台的配置文件。
///
/// 内部复用 `config_generator::preview_all`，并按平台过滤。
pub fn generate_for_platform(
    input: &GenerateConfigInput,
    platform: &str,
) -> AppResult<Vec<GeneratedFile>> {
    let mut scoped = input.clone();
    // 只生成目标平台（边缘层配置随同附带）
    scoped.ci_platforms = Some(vec![platform.to_string()]);
    let all = crate::deploy::config_generator::preview_all(&scoped)?;

    // 过滤：目标平台的文件 + 边缘层通用文件
    let filtered = all
        .into_iter()
        .filter(|f| f.platform == platform || f.platform == "edge")
        .collect();

    Ok(filtered)
}

/// 生成全部 Pages 平台的配置文件。
pub fn generate_all_platforms(input: &GenerateConfigInput) -> AppResult<Vec<GeneratedFile>> {
    let mut scoped = input.clone();
    scoped.ci_platforms = Some(PAGES_PLATFORMS.iter().map(|s| s.to_string()).collect());
    crate::deploy::config_generator::preview_all(&scoped)
}

/// 自定义域名校验：仅允许合法域名格式。
pub fn validate_domain(domain: &str) -> Result<(), String> {
    if domain.trim().is_empty() {
        return Err("域名不能为空".into());
    }
    let d = domain.trim();
    if d.contains("://") || d.contains('/') {
        return Err("请填写纯域名，不要包含协议或路径（例如 blog.example.com）".into());
    }
    let labels: Vec<&str> = d.split('.').collect();
    if labels.len() < 2 {
        return Err("域名格式不正确，至少应包含一个点号".into());
    }
    for label in &labels {
        if label.is_empty() {
            return Err("域名中存在空的标签段".into());
        }
        if label.len() > 63 {
            return Err("域名标签段过长（超过 63 字符）".into());
        }
        if !label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            return Err(format!("域名标签段 `{}` 含非法字符", label));
        }
        if label.starts_with('-') || label.ends_with('-') {
            return Err(format!("域名标签段 `{}` 不能以连字符开头或结尾", label));
        }
    }
    Ok(())
}
