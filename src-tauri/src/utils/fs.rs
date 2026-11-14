//! 文件系统工具。
//!
//! 目录复制此前有三份实现（`file_commands` / `site_commands` / `theme_commands`），
//! 各自跳过不同的子目录：备份站点跳过 `public`，复制主题只跳过依赖与版本库，
//! 通用复制什么都不跳。改成「一份实现 + 跳过清单」后，差异变成显式参数。

use crate::utils::error::AppResult;
use std::path::Path;

/// 依赖与版本库：体积大且可重建，复制时几乎总是应该跳过。
pub const SKIP_VCS_AND_DEPS: &[&str] = &[".git", "node_modules"];

/// 在 [`SKIP_VCS_AND_DEPS`] 基础上再跳过构建产物（站点备份/复制用）。
pub const SKIP_BUILD_OUTPUT: &[&str] = &[".git", "node_modules", "public"];

/// 递归复制目录（全部内容，不做跳过）。
pub fn copy_dir(src: &Path, dst: &Path) -> AppResult<()> {
    copy_dir_skipping(src, dst, &[])
}

/// 递归复制目录，跳过清单中的条目名（按文件名精确匹配）。
pub fn copy_dir_skipping(src: &Path, dst: &Path, skip: &[&str]) -> AppResult<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let name = entry.file_name();
        if skip.iter().any(|s| name.to_string_lossy() == *s) {
            continue;
        }
        let to = dst.join(&name);
        if entry.file_type()?.is_dir() {
            copy_dir_skipping(&entry.path(), &to, skip)?;
        } else {
            std::fs::copy(entry.path(), &to)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("hexo-mgr-fs-{}-{}", tag, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// 递归复制：子目录要跟着复制，`public`/`node_modules` 按清单跳过。
    #[test]
    fn test_copy_dir_skips_listed_entries() {
        let root = temp("copy");
        let src = root.join("src");
        std::fs::create_dir_all(src.join("sub")).unwrap();
        std::fs::create_dir_all(src.join("node_modules").join("pkg")).unwrap();
        std::fs::create_dir_all(src.join("public")).unwrap();
        std::fs::write(src.join("a.md"), "a").unwrap();
        std::fs::write(src.join("sub").join("b.md"), "b").unwrap();
        std::fs::write(src.join("node_modules").join("pkg").join("i.js"), "x").unwrap();
        std::fs::write(src.join("public").join("index.html"), "<html>").unwrap();

        let dst = root.join("dst");
        copy_dir_skipping(&src, &dst, SKIP_BUILD_OUTPUT).unwrap();

        assert!(dst.join("a.md").exists());
        assert!(dst.join("sub").join("b.md").exists(), "子目录必须递归复制");
        assert!(!dst.join("node_modules").exists(), "依赖应被跳过");
        assert!(!dst.join("public").exists(), "构建产物应被跳过");

        let _ = std::fs::remove_dir_all(&root);
    }

    /// 不传跳过清单时是全量复制。
    #[test]
    fn test_copy_dir_without_skip_copies_everything() {
        let root = temp("copy-all");
        let src = root.join("src");
        std::fs::create_dir_all(src.join("node_modules")).unwrap();
        std::fs::write(src.join("node_modules").join("x.js"), "x").unwrap();

        let dst = root.join("dst");
        copy_dir(&src, &dst).unwrap();
        assert!(dst.join("node_modules").join("x.js").exists());

        let _ = std::fs::remove_dir_all(&root);
    }
}
