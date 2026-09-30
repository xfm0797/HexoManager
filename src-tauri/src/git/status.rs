//! Git 状态查询与解析。
//!
//! 通过 `git status --porcelain=v1 -b` 获取工作区状态，解析为标准结构。

use crate::models::{GitFileStatus, GitStatus};
use crate::utils::error::AppResult;
use crate::utils::process;
use std::path::Path;

/// 判断目录是否为 Git 仓库。
pub async fn is_repo(site_path: &str) -> bool {
    process::run(
        "git",
        &["rev-parse", "--is-inside-work-tree"],
        Some(Path::new(site_path)),
        Some(20),
    )
    .await
    .map(|o| o.success && o.stdout.trim() == "true")
    .unwrap_or(false)
}

/// 解析 porcelain 状态码为可读字符。
fn classify(code: char) -> String {
    match code {
        'M' => "M".into(),
        'A' => "A".into(),
        'D' => "D".into(),
        'R' => "R".into(),
        'C' => "C".into(),
        'U' => "U".into(),
        '?' => "?".into(),
        '!' => "!".into(),
        other => other.to_string(),
    }
}

/// 获取 Git 状态。
pub async fn git_status(site_path: &str) -> AppResult<GitStatus> {
    let mut status = GitStatus {
        is_repo: false,
        branch: None,
        remote: None,
        ahead: 0,
        behind: 0,
        staged: Vec::new(),
        unstaged: Vec::new(),
        untracked: Vec::new(),
        clean: true,
    };

    if !is_repo(site_path).await {
        return Ok(status);
    }
    status.is_repo = true;

    let cwd = Path::new(site_path);

    // 分支与领先/落后情况
    let branch_out = process::run(
        "git",
        &["status", "--porcelain=v1", "-b", "--untracked-files=all"],
        Some(cwd),
        Some(60),
    )
    .await?;

    for line in branch_out.stdout.lines() {
        if let Some(rest) = line.strip_prefix("## ") {
            // 形如：main...origin/main [ahead 1, behind 2]
            let (branch_part, tracking_part) = match rest.find(" [") {
                Some(i) => (&rest[..i], Some(&rest[i + 2..])),
                None => (rest, None),
            };
            let branch_name = branch_part
                .split("...")
                .next()
                .unwrap_or(branch_part)
                .trim()
                .to_string();
            if !branch_name.is_empty() && branch_name != "HEAD (no branch)" {
                status.branch = Some(branch_name);
            }
            if let Some(t) = tracking_part {
                let t = t.trim_end_matches(']');
                for seg in t.split(',') {
                    let seg = seg.trim();
                    if let Some(v) = seg.strip_prefix("ahead ") {
                        status.ahead = v.parse().unwrap_or(0);
                    } else if let Some(v) = seg.strip_prefix("behind ") {
                        status.behind = v.parse().unwrap_or(0);
                    }
                }
            }
            continue;
        }

        if line.len() < 3 {
            continue;
        }

        let chars: Vec<char> = line.chars().collect();
        let x = chars[0]; // 暂存区状态
        let y = chars[1]; // 工作区状态
        let path = line[3..].trim().to_string();

        // 未跟踪
        if x == '?' && y == '?' {
            status.untracked.push(GitFileStatus {
                path,
                worktree: "?".into(),
                index: "?".into(),
                staged: false,
            });
            continue;
        }

        // 已暂存
        if x != ' ' && x != '?' {
            status.staged.push(GitFileStatus {
                path: path.clone(),
                worktree: classify(y),
                index: classify(x),
                staged: true,
            });
        }

        // 未暂存（工作区有改动）
        if y != ' ' && y != '?' {
            status.unstaged.push(GitFileStatus {
                path,
                worktree: classify(y),
                index: classify(x),
                staged: false,
            });
        }
    }

    // 远程地址
    if let Ok(remote_out) =
        process::run("git", &["remote", "get-url", "origin"], Some(cwd), Some(20)).await
    {
        if remote_out.success {
            let url = remote_out.stdout.trim().to_string();
            if !url.is_empty() {
                status.remote = Some(url);
            }
        }
    }

    status.clean =
        status.staged.is_empty() && status.unstaged.is_empty() && status.untracked.is_empty();

    Ok(status)
}
