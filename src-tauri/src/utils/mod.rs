pub mod error;
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

/// 将系统时间格式化为本地可读字符串。
pub fn format_system_time(t: std::time::SystemTime) -> Option<String> {
    let dt: chrono::DateTime<chrono::Local> = t.into();
    Some(dt.format("%Y-%m-%d %H:%M:%S").to_string())
}

/// 当前时间字符串（与 SQLite `datetime('now')` 的 UTC 口径保持一致）。
pub fn now_utc() -> String {
    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
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
