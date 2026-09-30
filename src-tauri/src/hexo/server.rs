//! Hexo 预览服务器（`hexo server`）进程管理。

use crate::models::PreviewServer;
use crate::utils::error::{AppError, AppResult};
use crate::utils::process;
use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::sync::Mutex;
use tokio::process::Command;

/// 预览服务器注册表：site_id -> PreviewServer。
#[derive(Default)]
pub struct ServerRegistry(pub Mutex<HashMap<i64, PreviewServer>>);

impl ServerRegistry {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }

    pub fn list(&self) -> Vec<PreviewServer> {
        self.0
            .lock()
            .map(|m| m.values().cloned().collect())
            .unwrap_or_default()
    }

    pub fn insert(&self, server: PreviewServer) {
        if let Ok(mut m) = self.0.lock() {
            m.insert(server.site_id, server);
        }
    }

    pub fn remove(&self, site_id: i64) -> Option<PreviewServer> {
        self.0.lock().ok().and_then(|mut m| m.remove(&site_id))
    }

    pub fn get(&self, site_id: i64) -> Option<PreviewServer> {
        self.0.lock().ok().and_then(|m| m.get(&site_id).cloned())
    }
}

/// 生成站点预览 URL。
fn preview_url(port: u16) -> String {
    format!("http://localhost:{}", port)
}

/// 启动 `hexo server`。
///
/// `npx hexo server -p <port>`，进程 detach 后由注册表持有 PID。
pub async fn spawn_server(site_id: i64, site_path: &str, port: u16) -> AppResult<PreviewServer> {
    let cwd = Path::new(site_path);
    if !cwd.exists() {
        return Err(AppError::PathNotFound(site_path.to_string()));
    }

    // 端口占用检测
    if is_port_in_use(port).await {
        return Err(AppError::InvalidArgument(format!(
            "端口 {} 已被占用，请更换端口",
            port
        )));
    }

    let npx_bin = if cfg!(target_os = "windows") {
        "npx.cmd"
    } else {
        "npx"
    };

    let mut cmd = Command::new(npx_bin);
    cmd.args(["hexo", "server", "-p", &port.to_string()])
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        cmd.creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS);
    }

    let child = cmd.spawn().map_err(AppError::Io)?;
    let pid = child
        .id()
        .ok_or_else(|| AppError::Process("无法获取预览进程 PID".into()))?;

    // 交由系统托管，避免随命令返回被回收
    std::mem::forget(child);

    // 等待服务真正监听端口（最多 20 秒）
    let mut listening = false;
    for _ in 0..40 {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        if is_port_in_use(port).await {
            listening = true;
            break;
        }
    }

    if !listening {
        // 启动失败，清理进程
        let _ = kill_by_pid(pid);
        return Err(AppError::Process(format!(
            "预览服务在 20 秒内未能监听端口 {}，请检查站点依赖是否安装完整",
            port
        )));
    }

    let server = PreviewServer {
        pid,
        site_id,
        port,
        url: preview_url(port),
        started_at: crate::utils::now_utc(),
        running: true,
    };

    Ok(server)
}

/// 检查端口是否被占用。
pub async fn is_port_in_use(port: u16) -> bool {
    tokio::net::TcpStream::connect(("127.0.0.1", port))
        .await
        .is_ok()
}

/// 按 PID 结束进程。
pub fn kill_by_pid(pid: u32) -> AppResult<()> {
    #[cfg(unix)]
    {
        let status = std::process::Command::new("kill")
            .arg("-TERM")
            .arg(pid.to_string())
            .status()
            .map_err(AppError::Io)?;
        if !status.success() {
            // 优雅结束失败则强制结束
            let _ = std::process::Command::new("kill")
                .arg("-9")
                .arg(pid.to_string())
                .status();
        }
        Ok(())
    }

    #[cfg(windows)]
    {
        let status = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status()
            .map_err(AppError::Io)?;
        if !status.success() {
            return Err(AppError::Process(format!("结束进程 {} 失败", pid)));
        }
        Ok(())
    }

    #[cfg(not(any(unix, windows)))]
    {
        let _ = pid;
        Err(AppError::Other("当前平台不支持进程终止".into()))
    }
}

/// 判断 PID 是否仍在运行。
pub fn is_running(pid: u32) -> bool {
    #[cfg(unix)]
    {
        // kill -0 仅探测存活，不发送信号
        std::process::Command::new("kill")
            .arg("-0")
            .arg(pid.to_string())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }

    #[cfg(windows)]
    {
        std::process::Command::new("tasklist")
            .args(["/FI", &format!("PID eq {}", pid)])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).contains(&pid.to_string()))
            .unwrap_or(false)
    }

    #[cfg(not(any(unix, windows)))]
    {
        let _ = pid;
        false
    }
}

/// 查找可用端口（从 `start` 开始递增探测）。
pub async fn find_free_port(start: u16) -> u16 {
    let mut port = start;
    while port < start.saturating_add(100) {
        if !is_port_in_use(port).await {
            return port;
        }
        port += 1;
    }
    port
}

/// 通过 `npx hexo server` 的环境检查确认 hexo 可用。
pub async fn probe_hexo(site_path: &str) -> bool {
    let npx_bin = if cfg!(target_os = "windows") {
        "npx.cmd"
    } else {
        "npx"
    };
    process::run(
        npx_bin,
        &["hexo", "version"],
        Some(Path::new(site_path)),
        Some(45),
    )
    .await
    .map(|o| o.success)
    .unwrap_or(false)
}
