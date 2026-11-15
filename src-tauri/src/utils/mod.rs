pub mod blocking;
pub mod error;
pub mod fs;
pub mod log;
pub mod node;
pub mod process;

use serde::{Deserialize, Serialize};

/// 统一的文件信息结构。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified_at: Option<String>,
    pub extension: Option<String>,
}

/// 文件树节点。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTreeNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub children: Vec<FileTreeNode>,
}

impl FileTreeNode {
    pub fn from_path(path: &std::path::Path, depth: usize, max_depth: usize) -> Self {
        let meta = std::fs::metadata(path).ok();
        let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);

        let children = if is_dir && depth < max_depth {
            let mut entries: Vec<_> = std::fs::read_dir(path)
                .map(|rd| rd.filter_map(|e| e.ok()).map(|e| e.path()).collect())
                .unwrap_or_else(|_| Vec::new());
            entries.sort_by(|a, b| {
                let a_dir = a.is_dir();
                let b_dir = b.is_dir();
                b_dir
                    .cmp(&a_dir)
                    .then_with(|| a.file_name().cmp(&b.file_name()))
            });
            entries
                .iter()
                .filter(|p| !is_ignored(p))
                .map(|p| FileTreeNode::from_path(p, depth + 1, max_depth))
                .collect()
        } else {
            Vec::new()
        };

        FileTreeNode {
            name: path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| path.display().to_string()),
            path: path.display().to_string(),
            is_dir,
            size,
            children,
        }
    }
}

/// 文件树中需要忽略的目录/文件（构建产物与依赖）。
pub fn is_ignored(path: &std::path::Path) -> bool {
    const IGNORED: &[&str] = &[
        "node_modules",
        ".git",
        "public",
        "db.json",
        ".DS_Store",
        ".deploy_git",
        "target",
    ];
    path.file_name()
        .and_then(|s| s.to_str())
        .map(|name| IGNORED.contains(&name))
        .unwrap_or(false)
}

/// 将系统时间格式化为 UTC 字符串。
///
/// 统一成 UTC 而不是本地时间：前端 `formatDateTime` 会把不带时区的时间串
/// 一律按 UTC 解释再转本地显示，若这里给的是本地时间就会被再加一次时区偏移
/// （东八区少显示 8 小时）。
pub fn format_system_time(t: std::time::SystemTime) -> Option<String> {
    let dt: chrono::DateTime<chrono::Utc> = t.into();
    Some(dt.format("%Y-%m-%d %H:%M:%S").to_string())
}

/// 当前时间字符串（与 SQLite `datetime('now')` 的 UTC 口径保持一致）。
pub fn now_utc() -> String {
    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

/// 把 front matter 里的时间串统一成数据库使用的 UTC 字符串。
///
/// 背景：Hexo 的 `date` / `updated` 惯例是**本地时间且不带时区**（如
/// `2026-11-14 22:00:00`），而数据库里其他时间列是 UTC。两者混在同一列里
/// 排序会错位（东八区差 8 小时，"晚上发的文章"可能排在"早上的草稿"之前）。
/// 因此入库前统一换算：带时区的按原时区折算，不带时区的按本地时间解释。
pub fn local_time_to_utc(raw: &str) -> Option<String> {
    let s = raw.trim();
    if s.is_empty() {
        return None;
    }

    // 1) RFC 3339：`Z` 后缀与 `+08:00` 形态都接受。
    //    不能用 `%:z` 处理 `Z` —— 它只匹配 `+08:00`；而 `%Z` 匹配的是时区**名称**
    //    （`UTC` / `GMT`），`Z` 后缀会解析失败（曾因此让 `...Z` 直接返回 None）。
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return Some(format_utc(dt));
    }

    // 2) RFC 3339 之外的带偏移写法：`+0800`（无冒号）、空格分隔、只有时:分
    for fmt in [
        "%Y-%m-%dT%H:%M:%S%.f%:z",
        "%Y-%m-%d %H:%M:%S%.f%:z",
        "%Y-%m-%dT%H:%M:%S%.f%z",
        "%Y-%m-%d %H:%M:%S%.f%z",
        "%Y-%m-%dT%H:%M%.f%:z",
        "%Y-%m-%d %H:%M%.f%:z",
    ] {
        if let Ok(dt) = chrono::DateTime::parse_from_str(s, fmt) {
            return Some(format_utc(dt));
        }
    }

    // 3) 不带时区：Hexo 惯例是本地时间，按本地时区解释后折算
    for fmt in [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M",
    ] {
        if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(s, fmt) {
            return Some(format_utc(
                naive.and_local_timezone(chrono::Local).single()?,
            ));
        }
    }

    // 4) 只有日期
    let date = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()?;
    let naive = date.and_hms_opt(0, 0, 0)?;
    Some(format_utc(
        naive.and_local_timezone(chrono::Local).single()?,
    ))
}

/// 折算成数据库统一的 UTC 字符串形态（`YYYY-MM-DD HH:MM:SS`）。
fn format_utc<Tz: chrono::TimeZone>(dt: chrono::DateTime<Tz>) -> String {
    dt.with_timezone(&chrono::Utc)
        .format("%Y-%m-%d %H:%M:%S")
        .to_string()
}

/// 计算 Markdown 文本的中文字数/英文词数近似值。
pub fn count_words(content: &str) -> i64 {
    let mut count: i64 = 0;
    let mut in_word = false;
    for ch in content.chars() {
        if ch.is_ascii_alphanumeric() {
            if !in_word {
                count += 1;
                in_word = true;
            }
        } else {
            in_word = false;
            // CJK 统一表意文字按字计数
            if ('\u{4e00}'..='\u{9fff}').contains(&ch)
                || ('\u{3040}'..='\u{30ff}').contains(&ch)
                || ('\u{ac00}'..='\u{d7af}').contains(&ch)
            {
                count += 1;
            }
        }
    }
    count
}

/// 由标题生成 URL slug。
pub fn slugify(title: &str) -> String {
    let mut slug = String::new();
    let mut prev_dash = false;
    for ch in title.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if ch.is_whitespace() || ch == '-' || ch == '_' {
            if !prev_dash && !slug.is_empty() {
                slug.push('-');
                prev_dash = true;
            }
        }
        // 中日韩字符直接保留
        else if ('\u{4e00}'..='\u{9fff}').contains(&ch) {
            slug.push(ch);
            prev_dash = false;
        }
    }
    slug.trim_matches('-').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 带偏移的时间必须按其自身时区折算，与运行机器的本地时区无关。
    #[test]
    fn test_local_time_to_utc_with_offset() {
        assert_eq!(
            local_time_to_utc("2026-11-14T22:00:00+08:00").as_deref(),
            Some("2026-11-14 14:00:00")
        );
        assert_eq!(
            local_time_to_utc("2026-11-14T22:00:00Z").as_deref(),
            Some("2026-11-14 22:00:00")
        );
        assert_eq!(
            local_time_to_utc("2026-11-14 22:00:00-05:00").as_deref(),
            Some("2026-11-15 03:00:00")
        );
        // `Z` 带小数秒：RFC 3339 解析器接受，按秒截断
        assert_eq!(
            local_time_to_utc("2026-11-14T22:00:00.500Z").as_deref(),
            Some("2026-11-14 22:00:00")
        );
        // 无冒号偏移（`+0800`）：RFC 3339 不认，走 `%z` 兜底
        assert_eq!(
            local_time_to_utc("2026-11-14T22:00:00+0800").as_deref(),
            Some("2026-11-14 14:00:00")
        );
    }

    /// 只有日期时补 00:00:00，且结果仍是 `YYYY-MM-DD HH:MM:SS` 形态。
    #[test]
    fn test_local_time_to_utc_date_only() {
        let out = local_time_to_utc("2026-11-14").expect("应能解析纯日期");
        assert_eq!(out.len(), 19, "必须是统一的 19 字符形态：{}", out);
        assert!(out.contains(':'));
    }

    /// 无法解析的输入返回 None，交由调用方回退（不能塞进一个假时间）。
    #[test]
    fn test_local_time_to_utc_invalid() {
        assert!(local_time_to_utc("").is_none());
        assert!(local_time_to_utc("   ").is_none());
        assert!(local_time_to_utc("昨天下午").is_none());
        assert!(local_time_to_utc("2026-13-45 99:99:99").is_none());
    }

    /// 两种来源的时间折算后能正确排序：带 +08:00 的 22 点早于 UTC 的 15 点。
    #[test]
    fn test_utc_normalization_makes_sorting_correct() {
        let a = local_time_to_utc("2026-11-14T22:00:00+08:00").unwrap();
        let b = local_time_to_utc("2026-11-14T15:00:00Z").unwrap();
        assert!(a < b, "东八区 22:00 应排在 UTC 15:00 之前（14:00 < 15:00）");
    }
}
