//! 更新管理模块入口。

pub mod check;
pub mod download;
pub mod install;

pub use check::{check_update, get_app_info, get_changelog, read_local_version};
pub use download::download_update;
pub use install::install_update;
