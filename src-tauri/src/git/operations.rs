//! Git 写操作：init / add / commit / push / pull / log / diff / stash 等。

use crate::models::CommitLog;
use crate::utils::error::{AppError, AppResult};
use crate::utils::process;
use std::path::Path;

fn cwd_of(site_path: &str) -> &Path {
    Path::new(site_path)
}

/// `git init`（默认分支 main）。
pub async fn init(site_path: &str) -> AppResult<String> {
    let cwd = cwd_of(site_path);
    let out = process::run("git", &["init", "-b", "main"], Some(cwd), Some(60)).await?;

    // 老版本 git 不支持 -b，回退
    let out = if !out.success {
        let fallback = process::run("git", &["init"], Some(cwd), Some(60)).await?;
        if fallback.success {
            let _ = process::run("git", &["checkout", "-b", "main"], Some(cwd), Some(30)).await;
        }
        fallback
    } else {
        out
    };

    if !out.success {
        return Err(AppError::Process(out.combined()));
    }
    Ok(out.combined())
}

/// `git add`。files 为空时等价于 `git add -A`。
pub async fn add(site_path: &str, files: Option<Vec<String>>) -> AppResult<()> {
    let cwd = cwd_of(site_path);
    let out = match files {
        Some(list) if !list.is_empty() => {
            let mut args = vec!["add", "--"];
            let refs: Vec<&str> = list.iter().map(|s| s.as_str()).collect();
            args.extend_from_slice(&refs);
            process::run("git", &args, Some(cwd), Some(120)).await?
        }
        // 无参数时暂存全部变更
        _ => process::run("git", &["add", "-A"], Some(cwd), Some(300)).await?,
    };
    if !out.success {
        return Err(AppError::Process(out.combined()));
    }
    Ok(())
}

/// `git commit -m <message>`，返回提交哈希。
pub async fn commit(site_path: &str, message: &str) -> AppResult<String> {
    let cwd = cwd_of(site_path);
    if message.trim().is_empty() {
        return Err(AppError::InvalidArgument("提交信息不能为空".into()));
    }

    let out = process::run("git", &["commit", "-m", message], Some(cwd), Some(120)).await?;
    if !out.success {
        let combined = out.combined();
        // 无变更可提交不算致命错误
        if combined.contains("nothing to commit") {
            return Ok(String::new());
        }
        return Err(AppError::Process(combined));
    }

    // 读取最新提交哈希
    let head = process::run("git", &["rev-parse", "HEAD"], Some(cwd), Some(20)).await?;
    Ok(head.stdout.trim().to_string())
}

/// `git push`，自动处理上游未设置的情况。
pub async fn push(site_path: &str) -> AppResult<String> {
    let cwd = cwd_of(site_path);

    let out = process::run("git", &["push"], Some(cwd), Some(300)).await?;
    if out.success {
        return Ok(out.combined());
    }

    let combined = out.combined();

    // 未设置上游：git push --set-upstream origin <branch>
    if combined.contains("has no upstream branch") || combined.contains("no upstream") {
        let branch_out = process::run(
            "git",
            &["rev-parse", "--abbrev-ref", "HEAD"],
            Some(cwd),
            Some(20),
        )
        .await?;
        let branch = branch_out.stdout.trim().to_string();
        let branch = if branch.is_empty() {
            "main".to_string()
        } else {
            branch
        };
        let retry = process::run(
            "git",
            &["push", "--set-upstream", "origin", &branch],
            Some(cwd),
            Some(300),
        )
        .await?;
        if !retry.success {
            return Err(AppError::Process(retry.combined()));
        }
        return Ok(retry.combined());
    }

    Err(AppError::Process(combined))
}

/// `git pull`。
pub async fn pull(site_path: &str) -> AppResult<String> {
    let cwd = cwd_of(site_path);
    let out = process::run("git", &["pull"], Some(cwd), Some(300)).await?;
    if !out.success {
        return Err(AppError::Process(out.combined()));
    }
    Ok(out.combined())
}

/// `git log --oneline` 解析为结构化提交记录。
pub async fn log(site_path: &str, limit: Option<i64>) -> AppResult<Vec<CommitLog>> {
    let cwd = cwd_of(site_path);
    let n = limit.unwrap_or(50).to_string();

    // 使用非打印字符分隔字段，避免提交信息含逗号导致解析错误
    let format = "--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%ai%x1f%s";
    let out = process::run("git", &["log", format, "-n", &n], Some(cwd), Some(60)).await?;

    if !out.success {
        // 无提交记录的空仓库
        if out.combined().contains("does not have any commits") {
            return Ok(Vec::new());
        }
        return Err(AppError::Process(out.combined()));
    }

    let mut logs = Vec::new();
    for line in out.stdout.lines() {
        let parts: Vec<&str> = line.split('\u{1f}').collect();
        if parts.len() < 6 {
            continue;
        }
        logs.push(CommitLog {
            hash: parts[0].to_string(),
            short_hash: parts[1].to_string(),
            author: parts[2].to_string(),
            email: parts[3].to_string(),
            date: parts[4].to_string(),
            message: parts[5].to_string(),
        });
    }

    Ok(logs)
}

/// `git diff`（工作区差异）。
pub async fn diff(site_path: &str) -> AppResult<String> {
    let cwd = cwd_of(site_path);
    let out = process::run("git", &["diff", "--no-color"], Some(cwd), Some(60)).await?;
    Ok(out.combined())
}

/// 设置远程仓库地址，并可选设置分支。
pub async fn set_remote(site_path: &str, url: &str, branch: Option<&str>) -> AppResult<()> {
    let cwd = cwd_of(site_path);

    // 先尝试移除已有 origin，再添加
    let _ = process::run("git", &["remote", "remove", "origin"], Some(cwd), Some(30)).await;
    let out = process::run(
        "git",
        &["remote", "add", "origin", url],
        Some(cwd),
        Some(30),
    )
    .await?;
    if !out.success {
        return Err(AppError::Process(out.combined()));
    }

    // 设置上游追踪分支（失败不阻塞，远程可能尚无该分支）
    if let Some(b) = branch {
        let _ = process::run("git", &["fetch", "origin", b], Some(cwd), Some(180)).await;
        let _ = process::run(
            "git",
            &["branch", "--set-upstream-to", &format!("origin/{}", b), b],
            Some(cwd),
            Some(30),
        )
        .await;
    }

    Ok(())
}

/// 放弃工作区改动。files 为空时放弃所有改动。
pub async fn discard_changes(site_path: &str, files: Option<Vec<String>>) -> AppResult<()> {
    let cwd = cwd_of(site_path);

    match files {
        Some(list) if !list.is_empty() => {
            let mut args = vec!["checkout", "--"];
            let refs: Vec<&str> = list.iter().map(|s| s.as_str()).collect();
            args.extend_from_slice(&refs);
            let out = process::run("git", &args, Some(cwd), Some(60)).await?;
            if !out.success {
                return Err(AppError::Process(out.combined()));
            }
        }
        _ => {
            let out = process::run("git", &["checkout", "--", "."], Some(cwd), Some(120)).await?;
            if !out.success {
                return Err(AppError::Process(out.combined()));
            }
        }
    }
    Ok(())
}

/// `git stash` 暂存当前改动。
pub async fn stash(site_path: &str) -> AppResult<String> {
    let cwd = cwd_of(site_path);
    let out = process::run("git", &["stash", "push", "-u"], Some(cwd), Some(120)).await?;
    if !out.success {
        return Err(AppError::Process(out.combined()));
    }
    Ok(out.combined())
}

/// `git stash pop` 恢复最近一次暂存。
pub async fn stash_pop(site_path: &str) -> AppResult<String> {
    let cwd = cwd_of(site_path);
    let out = process::run("git", &["stash", "pop"], Some(cwd), Some(120)).await?;
    if !out.success {
        return Err(AppError::Process(out.combined()));
    }
    Ok(out.combined())
}

/// 回滚到指定提交（`git reset --hard <hash>`）。
pub async fn reset_hard(site_path: &str, commit_hash: &str) -> AppResult<String> {
    let cwd = cwd_of(site_path);
    let out = process::run(
        "git",
        &["reset", "--hard", commit_hash],
        Some(cwd),
        Some(120),
    )
    .await?;
    if !out.success {
        return Err(AppError::Process(out.combined()));
    }
    Ok(out.combined())
}
