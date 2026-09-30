//! 进程执行封装。
//!
//! HexoManager 通过调用用户本机已安装的 `node` / `npx hexo` / `git` 来完成
//! 构建、预览与版本控制，因此需要一个跨平台、可流式输出、支持超时的执行器。

use crate::utils::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

/// 进程执行结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessOutput {
    pub success: bool,
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u64,
}

impl ProcessOutput {
    pub fn combined(&self) -> String {
        let mut s = String::new();
        if !self.stdout.trim().is_empty() {
            s.push_str(self.stdout.trim_end());
        }
        if !self.stderr.trim().is_empty() {
            if !s.is_empty() {
                s.push('\n');
            }
            s.push_str(self.stderr.trim_end());
        }
        s
    }
}

/// 判断可执行文件在 PATH 中是否可用。
pub async fn which(program: &str) -> bool {
    let probe = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };
    match Command::new(probe)
        .arg(program)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
    {
        Ok(status) => status.success(),
        Err(_) => false,
    }
}

/// 执行命令并捕获输出。
///
/// - `program`：可执行文件（如 `git`、`npx`）
/// - `args`：参数列表
/// - `cwd`：工作目录（站点根目录）
/// - `timeout_secs`：超时秒数，`None` 表示不限制
pub async fn run(
    program: &str,
    args: &[&str],
    cwd: Option<&Path>,
    timeout_secs: Option<u64>,
) -> AppResult<ProcessOutput> {
    let started = std::time::Instant::now();

    let mut cmd = Command::new(program);
    cmd.args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    if let Some(dir) = cwd {
        if !dir.exists() {
            return Err(AppError::PathNotFound(dir.display().to_string()));
        }
        cmd.current_dir(dir);
    }

    // Windows 下隐藏控制台窗口
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let future = async {
        let output = cmd.output().await?;
        Ok::<_, std::io::Error>(output)
    };

    let output = match timeout_secs {
        Some(secs) => {
            match tokio::time::timeout(std::time::Duration::from_secs(secs), future).await {
                Ok(res) => res.map_err(AppError::Io)?,
                Err(_) => {
                    return Err(AppError::Process(format!(
                        "命令 `{} {}` 执行超时（{} 秒）",
                        program,
                        args.join(" "),
                        secs
                    )))
                }
            }
        }
        None => future.await.map_err(AppError::Io)?,
    };

    Ok(ProcessOutput {
        success: output.status.success(),
        code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        duration_ms: started.elapsed().as_millis() as u64,
    })
}

/// 执行命令，逐行回调输出（用于构建日志实时推送）。
pub async fn run_streaming<F>(
    program: &str,
    args: &[&str],
    cwd: Option<&Path>,
    mut on_line: F,
) -> AppResult<ProcessOutput>
where
    F: FnMut(String) + Send + 'static,
{
    let started = std::time::Instant::now();

    let mut cmd = Command::new(program);
    cmd.args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    if let Some(dir) = cwd {
        if !dir.exists() {
            return Err(AppError::PathNotFound(dir.display().to_string()));
        }
        cmd.current_dir(dir);
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn().map_err(AppError::Io)?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Process("无法捕获 stdout".into()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::Process("无法捕获 stderr".into()))?;

    let mut out_lines = BufReader::new(stdout).lines();
    let mut err_lines = BufReader::new(stderr).lines();

    let mut stdout_buf = String::new();
    let mut stderr_buf = String::new();

    loop {
        tokio::select! {
            line = out_lines.next_line() => {
                match line.map_err(AppError::Io)? {
                    Some(l) => {
                        on_line(l.clone());
                        stdout_buf.push_str(&l);
                        stdout_buf.push('\n');
                    }
                    None => break,
                }
            }
            line = err_lines.next_line() => {
                if let Some(l) = line.map_err(AppError::Io)? {
                    on_line(l.clone());
                    stderr_buf.push_str(&l);
                    stderr_buf.push('\n');
                }
            }
        }
    }

    // 等待 stderr 剩余内容
    while let Some(l) = err_lines.next_line().await.map_err(AppError::Io)? {
        on_line(l.clone());
        stderr_buf.push_str(&l);
        stderr_buf.push('\n');
    }

    let status = child.wait().await.map_err(AppError::Io)?;

    Ok(ProcessOutput {
        success: status.success(),
        code: status.code(),
        stdout: stdout_buf,
        stderr: stderr_buf,
        duration_ms: started.elapsed().as_millis() as u64,
    })
}
