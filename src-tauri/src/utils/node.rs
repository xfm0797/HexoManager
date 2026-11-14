//! Node 工具链可执行文件名解析。
//!
//! Windows 上 `npx` / `npm` 是 `.cmd` 包装脚本，直接按裸名 spawn 会失败
//! （`CreateProcess` 只认可执行映像，不查 PATHEXT）。此前这段判断在 6 处
//! 各写一遍，漏一处就只在 Windows 上炸，集中到这里。

/// `npx` 可执行文件名（Windows 下为 `npx.cmd`）。
pub fn npx() -> &'static str {
    if cfg!(target_os = "windows") {
        "npx.cmd"
    } else {
        "npx"
    }
}

/// `npm` 可执行文件名（Windows 下为 `npm.cmd`）。
pub fn npm() -> &'static str {
    if cfg!(target_os = "windows") {
        "npm.cmd"
    } else {
        "npm"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bin_names_match_platform() {
        if cfg!(target_os = "windows") {
            assert_eq!(npx(), "npx.cmd");
            assert_eq!(npm(), "npm.cmd");
        } else {
            assert_eq!(npx(), "npx");
            assert_eq!(npm(), "npm");
        }
    }
}
