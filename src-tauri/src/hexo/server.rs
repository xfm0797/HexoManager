//! Hexo 预览服务器（`hexo server`）进程管理。
//!
//! 设计要点：
//! - **持有 `Child` 句柄**而不是 `mem::forget`。句柄被遗忘时子进程永不回收，
//!   应用退出后 `npx hexo server` 变成孤儿进程，端口 4000–4100 被逐步占满。
//! - **必须读走 stdout/stderr**。`hexo server` 会持续输出日志，管道缓冲区
//!   （约 64 KB）写满后进程会阻塞在 write 上，表现为"预览服务莫名卡死"。
//!   这里用后台线程把输出收进定长环形缓冲，既不会阻塞，又能用于启动失败诊断。
//! - **杀进程树而不是单进程**：Windows 上 `npx.cmd` → `node`，只 kill 直接
//!   子进程会留下 node 孤儿。

use crate::models::PreviewServer;
use crate::utils::error::{AppError, AppResult};
use crate::utils::process;
use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, MutexGuard};

/// 每个预览服务保留的日志行数（用于启动失败时给出可诊断的信息）。
const LOG_TAIL_LINES: usize = 200;

/// 取锁：即便持锁线程 panic 过，也继续用内部数据（预览服务不该因此瘫痪）。
fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// 往环形缓冲追加一行，超出容量时丢弃最旧的。
fn push_tail(tail: &mut VecDeque<String>, line: String) {
    if tail.len() >= LOG_TAIL_LINES {
        tail.pop_front();
    }
    tail.push_back(line);
}

/// 一个正在运行的预览服务：对外信息 + 进程句柄 + 日志尾巴。
pub struct RunningServer {
    pub info: PreviewServer,
    child: Child,
    log_tail: Arc<Mutex<VecDeque<String>>>,
}

impl RunningServer {
    /// 进程是否仍存活；顺带回收已退出的子进程（避免僵尸）。
    fn is_alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    /// 最近若干行输出，用于拼装错误信息。
    pub fn log_tail(&self) -> Vec<String> {
        lock(&self.log_tail).iter().cloned().collect()
    }

    /// 结束进程树并回收句柄。
    fn kill(&mut self) {
        // 先按 PID 杀整棵树（含 npx 派生的 node），再回收直接子进程
        let _ = kill_by_pid(self.info.pid);
        let _ = self.child.kill();
        let _ = self.child.wait();
        crate::utils::log::info(
            "preview",
            format!(
                "站点 {} 预览服务已停止：pid={} port={}",
                self.info.site_id, self.info.pid, self.info.port
            ),
        );
    }
}

/// 预览服务器注册表：site_id -> RunningServer。
#[derive(Default)]
pub struct ServerRegistry(Mutex<HashMap<i64, RunningServer>>);

impl ServerRegistry {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }

    /// 列出仍在运行的服务；已退出的条目顺手清理，不再越积越多。
    pub fn list(&self) -> Vec<PreviewServer> {
        let mut map = lock(&self.0);
        let mut dead: Vec<i64> = Vec::new();
        for (id, s) in map.iter_mut() {
            if !s.is_alive() {
                dead.push(*id);
            }
        }
        for id in dead {
            map.remove(&id);
        }
        map.values().map(|s| s.info.clone()).collect()
    }

    /// 取指定站点的运行中服务（已退出则清理并返回 None）。
    pub fn get(&self, site_id: i64) -> Option<PreviewServer> {
        let mut map = lock(&self.0);
        if let Some(s) = map.get_mut(&site_id) {
            if s.is_alive() {
                return Some(s.info.clone());
            }
        }
        map.remove(&site_id);
        None
    }

    /// 登记服务；若同站点已有旧条目，先杀掉旧进程避免泄漏。
    pub fn insert(&self, server: RunningServer) {
        let mut map = lock(&self.0);
        if let Some(mut old) = map.remove(&server.info.site_id) {
            old.kill();
        }
        map.insert(server.info.site_id, server);
    }

    /// 按 PID 停止服务（UI 只知道 PID）。
    pub fn stop_by_pid(&self, pid: u32) -> bool {
        let mut map = lock(&self.0);
        let site_id = map
            .iter()
            .find(|(_, s)| s.info.pid == pid)
            .map(|(id, _)| *id);
        match site_id.and_then(|id| map.remove(&id)) {
            Some(mut s) => {
                s.kill();
                true
            }
            // 注册表里没有（例如应用重启前的残留），仍然按 PID 尝试结束
            None => {
                drop(map);
                let _ = kill_by_pid(pid);
                false
            }
        }
    }

    /// 停止某站点的预览服务（删除站点、重建站点前调用）。
    pub fn stop_site(&self, site_id: i64) -> bool {
        let mut removed = lock(&self.0).remove(&site_id);
        match removed.as_mut() {
            Some(s) => {
                s.kill();
                true
            }
            None => false,
        }
    }

    /// 退出应用前统一清理全部预览进程。
    pub fn stop_all(&self) {
        let map: Vec<(i64, RunningServer)> = lock(&self.0).drain().collect();
        for (_, mut s) in map {
            s.kill();
        }
    }

    /// 当前运行中的服务数（测试用）。
    pub fn len(&self) -> usize {
        lock(&self.0).len()
    }

    /// 注册表是否为空（clippy 要求与 `len` 成对，也是更直观的空判断）。
    pub fn is_empty(&self) -> bool {
        lock(&self.0).is_empty()
    }
}

/// 生成站点预览 URL。
fn preview_url(port: u16) -> String {
    format!("http://localhost:{}", port)
}

/// 启动 `hexo server`。
///
/// `npx hexo server -p <port>`；返回的对象持有子进程句柄，须登记进注册表。
pub async fn spawn_server(site_id: i64, site_path: &str, port: u16) -> AppResult<RunningServer> {
    let cwd = Path::new(site_path);
    if !cwd.exists() {
        return Err(AppError::PathNotFound(site_path.to_string()));
    }

    // 端口占用检测
    if is_port_in_use(port).await {
        return Err(AppError::coded(
            "preview.port_in_use",
            format!("端口 {} 已被占用，请更换端口", port),
            &[("port", port.to_string())],
        ));
    }

    let npx_bin = crate::utils::node::npx();

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
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn().map_err(|e| {
        AppError::coded(
            "preview.spawn_failed",
            format!("启动预览服务失败：{}", e),
            &[("detail", e.to_string())],
        )
    })?;
    let pid = child.id();

    // 后台线程读走输出：不读会把管道写满，进程阻塞在 write 上（"预览卡死"）
    let log_tail: Arc<Mutex<VecDeque<String>>> = Arc::new(Mutex::new(VecDeque::new()));
    for (stream, tag) in [
        (
            child
                .stdout
                .take()
                .map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
            "out",
        ),
        (
            child
                .stderr
                .take()
                .map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
            "err",
        ),
    ] {
        let Some(stream) = stream else { continue };
        let tail = Arc::clone(&log_tail);
        std::thread::spawn(move || {
            for line in BufReader::new(stream).lines().map_while(Result::ok) {
                let _ = tag;
                push_tail(&mut lock(&tail), line);
            }
        });
    }

    let mut server = RunningServer {
        info: PreviewServer {
            pid,
            site_id,
            port,
            url: preview_url(port),
            started_at: crate::utils::now_utc(),
            running: true,
        },
        child,
        log_tail,
    };

    // 等待服务真正监听端口（最多 30 秒）。放大到 30 秒是因为首次运行
    // 可能同时触发依赖安装/主题渲染，20 秒容易误判为失败。
    let mut listening = false;
    for _ in 0..60 {
        // 进程自己退出就没必要再等
        if !server.is_alive() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        if is_port_in_use(port).await {
            listening = true;
            break;
        }
    }

    if !listening {
        server.kill();
        let tail = server
            .log_tail()
            .into_iter()
            .rev()
            .take(12)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join("\n");
        let hint = if tail.is_empty() {
            "没有捕获到任何输出，请确认站点目录已安装依赖（npm install）".to_string()
        } else {
            format!("最近输出：\n{}", tail)
        };
        crate::utils::log::error(
            "preview",
            format!(
                "站点 {} 预览服务启动失败（port={}, pid={}）：{}",
                site_id, port, pid, hint
            ),
        );
        // 错误码分两支：无输出是「八成没装依赖」，有输出则把 tail 当诊断详情透传
        return Err(if tail.is_empty() {
            AppError::coded(
                "preview.listen_timeout_no_output",
                format!(
                    "预览服务未能监听端口 {}。没有捕获到任何输出，\
                     请确认站点目录已安装依赖（npm install）",
                    port
                ),
                &[("port", port.to_string())],
            )
        } else {
            AppError::coded(
                "preview.listen_timeout",
                format!("预览服务未能监听端口 {}。最近输出：\n{}", port, tail),
                &[("port", port.to_string()), ("detail", tail)],
            )
        });
    }

    crate::utils::log::info(
        "preview",
        format!("站点 {} 预览服务已启动：pid={} port={}", site_id, pid, port),
    );

    Ok(server)
}

/// 检查端口是否被占用。
pub async fn is_port_in_use(port: u16) -> bool {
    tokio::net::TcpStream::connect(("127.0.0.1", port))
        .await
        .is_ok()
}

/// 按 PID 结束进程树。
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
            return Err(AppError::coded(
                "preview.kill_failed",
                format!("结束进程 {} 失败", pid),
                &[("pid", pid.to_string())],
            ));
        }
        Ok(())
    }

    #[cfg(not(any(unix, windows)))]
    {
        let _ = pid;
        Err(AppError::coded(
            "preview.kill_unsupported",
            "当前平台不支持进程终止",
            &[],
        ))
    }
}

/// 判断 PID 是否仍在运行（不依赖注册表，用于探测外部残留进程）。
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

/// 通过 `npx hexo version` 确认 hexo 可用。
pub async fn probe_hexo(site_path: &str) -> bool {
    process::run(
        crate::utils::node::npx(),
        &["hexo", "version"],
        Some(Path::new(site_path)),
        Some(45),
    )
    .await
    .map(|o| o.success)
    .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 日志环形缓冲只保留最新的 N 行：早期行被丢弃，末尾始终是最新输出。
    #[test]
    fn test_log_tail_keeps_newest_lines() {
        let mut tail = VecDeque::new();
        for i in 0..(LOG_TAIL_LINES + 10) {
            push_tail(&mut tail, format!("line-{}", i));
        }
        assert_eq!(tail.len(), LOG_TAIL_LINES, "缓冲长度必须被限制");
        assert_eq!(tail.front().unwrap(), &"line-10".to_string());
        assert_eq!(
            tail.back().unwrap(),
            &format!("line-{}", LOG_TAIL_LINES + 9),
            "最后一行必须是最新输出"
        );
    }

    /// 空注册表：list/get 均为空，stop_* 返回 false 且不 panic。
    #[test]
    fn test_registry_empty_is_safe() {
        let reg = ServerRegistry::new();
        assert!(reg.list().is_empty());
        assert!(reg.get(1).is_none());
        assert!(!reg.stop_site(1));
        assert!(!reg.stop_by_pid(999_999));
        reg.stop_all();
        assert_eq!(reg.len(), 0);
    }
}
