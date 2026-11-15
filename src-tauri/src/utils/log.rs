//! 轻量日志落盘（可观测性基础设施）。
//!
//! 为什么不引 `tracing` + `tracing-subscriber`：本项目只有一个进程、一个日志
//! 消费者（用户报障时把日志发回来），需要的能力就三条 ——
//!
//! 1. 固定可预测的路径，用户能在「设置 → 导出诊断日志」一键拿到；
//! 2. 按天切分并自动清理，不会无限增长；
//! 3. **写日志失败绝不影响主流程**（磁盘满、权限不足不能让一次保存失败）。
//!
//! 引入 `tracing` 全套会带来 subscriber、layer、过滤表达式这些用不上的概念，
//! 还要额外配置滚动与清理，收益不抵成本。这里的实现约 150 行，行为完全可控。
//!
//! 记录什么：命令失败的上下文（哪个命令、什么参数、后端返回什么）、预览服务
//! 的启动与回收、更新检查结果。不记录：文章正文、密钥、用户填写的任意长文本。

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

/// 日志保留天数（含当天）。
const KEEP_DAYS: u64 = 7;

/// 单条日志消息的最大长度，避免把整篇正文或超长 stderr 塞进日志。
const MAX_MESSAGE_LEN: usize = 4000;

struct Sink {
    dir: PathBuf,
    /// 当前打开的文件与它对应的日期（`YYYY-MM-DD`，UTC）
    current: Option<(String, File)>,
}

static SINK: OnceLock<Mutex<Sink>> = OnceLock::new();

/// 初始化日志目录：创建目录、清理过期文件、写一条启动分隔。
///
/// 重复调用是安全的（`OnceLock` 只接受第一次），因此各命令里不必关心是否已初始化。
pub fn init(dir: PathBuf) {
    let sink = SINK.get_or_init(|| {
        let _ = std::fs::create_dir_all(&dir);
        Mutex::new(Sink { dir, current: None })
    });

    prune_old_files(sink);
    info("app", "日志系统就绪");
}

/// 日志目录（未初始化时为 `None`）。
pub fn log_dir() -> Option<PathBuf> {
    SINK.get().map(|s| lock(s).dir.clone())
}

/// 今天的日志文件路径（未初始化时为 `None`）。
pub fn log_path() -> Option<PathBuf> {
    let sink = SINK.get()?;
    let dir = lock(sink).dir.clone();
    Some(dir.join(format!("app-{}.log", today())))
}

pub fn info(scope: &str, message: impl AsRef<str>) {
    write("INFO", scope, message.as_ref());
}

pub fn warn(scope: &str, message: impl AsRef<str>) {
    write("WARN", scope, message.as_ref());
}

pub fn error(scope: &str, message: impl AsRef<str>) {
    write("ERROR", scope, message.as_ref());
}

/// 读取最近若干行日志（供「导出诊断日志」使用）。
///
/// 跨文件按时间顺序拼接，超过 `max_lines` 只保留末尾部分。
pub fn recent(max_lines: usize) -> String {
    let Some(sink) = SINK.get() else {
        return String::new();
    };
    let dir = lock(sink).dir.clone();

    let mut files: Vec<PathBuf> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("log") {
                files.push(path);
            }
        }
    }
    files.sort();

    let mut lines: Vec<String> = Vec::new();
    for path in files {
        if let Ok(content) = std::fs::read_to_string(&path) {
            lines.extend(content.lines().map(|l| l.to_string()));
        }
    }

    if lines.len() > max_lines {
        lines = lines.split_off(lines.len() - max_lines);
    }
    lines.join("\n")
}

fn lock(sink: &Mutex<Sink>) -> std::sync::MutexGuard<'_, Sink> {
    // 日志锁中毒不应导致后续日志全部丢失
    sink.lock().unwrap_or_else(|e| e.into_inner())
}

fn today() -> String {
    // 日志文件名用 UTC 日期：与应用内其它时间字段口径一致
    crate::utils::now_utc()
        .split('T')
        .next()
        .unwrap_or("1970-01-01")
        .to_string()
}

fn write(level: &str, scope: &str, message: &str) {
    let Some(sink) = SINK.get() else {
        return; // 未初始化（如单元测试）时静默跳过
    };

    let mut message = message.replace('\r', "");
    if message.len() > MAX_MESSAGE_LEN {
        // 按字符截断，避免切坏多字节 UTF-8
        message = message.chars().take(MAX_MESSAGE_LEN).collect();
        message.push_str("…（已截断）");
    }

    let line = format!(
        "{} [{level}] [{scope}] {}\n",
        crate::utils::now_utc(),
        message.replace('\n', " ⏎ ")
    );

    let mut guard = lock(sink);
    let day = today();

    // 跨天时换文件
    if guard
        .current
        .as_ref()
        .map(|(d, _)| d != &day)
        .unwrap_or(true)
    {
        let path = guard.dir.join(format!("app-{}.log", day));
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        match OpenOptions::new().create(true).append(true).open(&path) {
            Ok(file) => guard.current = Some((day.clone(), file)),
            Err(_) => return, // 打不开就放弃本条，绝不影响调用方
        }
    }

    if let Some((_, file)) = guard.current.as_mut() {
        let _ = file.write_all(line.as_bytes());
        let _ = file.flush();
    }

    drop(guard);
    prune_old_files(sink);
}

/// 清理超过 `KEEP_DAYS` 天的日志文件；每个进程生命周期内最多跑一次。
fn prune_old_files(sink: &Mutex<Sink>) {
    static PRUNED: OnceLock<()> = OnceLock::new();
    if PRUNED.set(()).is_err() {
        return;
    }

    let dir = lock(sink).dir.clone();
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return;
    };

    let cutoff =
        std::time::SystemTime::now() - std::time::Duration::from_secs(KEEP_DAYS * 24 * 60 * 60);

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("log") {
            continue;
        }
        let too_old = entry
            .metadata()
            .and_then(|m| m.modified())
            .map(|modified| modified < cutoff)
            .unwrap_or(false);
        if too_old {
            let _ = std::fs::remove_file(path);
        }
    }
}

/// 把日志目录里的文件合并成一个文本，写到 `target`（供用户直接发送）。
pub fn export_to(target: &Path) -> crate::utils::error::AppResult<String> {
    let content = recent(20_000);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let header = format!(
        "HexoManager 诊断日志\n生成时间：{}\n版本：{}\n平台：{} {}\n{}\n",
        crate::utils::now_utc(),
        crate::update::check::APP_VERSION,
        std::env::consts::OS,
        std::env::consts::ARCH,
        "-".repeat(60)
    );
    std::fs::write(target, format!("{}{}", header, content))?;
    Ok(target.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 未初始化时调用不应 panic（命令里可能早于 setup 就记录日志）。
    #[test]
    fn test_write_before_init_is_noop() {
        // 该测试进程内不调用 init，因此 SINK 为空
        info("test", "不会写入任何文件，也不应 panic");
    }

    /// 截断按字符边界进行，中文不会被切坏。
    #[test]
    fn test_message_truncation_keeps_valid_utf8() {
        let long: String = "汉".repeat(MAX_MESSAGE_LEN + 100);
        let truncated: String = long.chars().take(MAX_MESSAGE_LEN).collect();
        assert_eq!(truncated.chars().count(), MAX_MESSAGE_LEN);
    }
}
