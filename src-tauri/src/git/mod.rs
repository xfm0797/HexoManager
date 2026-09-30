//! Git 操作模块入口。

pub mod operations;
pub mod status;

pub use operations::{
    add, commit, diff, discard_changes, init, log, pull, push, set_remote, stash, stash_pop,
};
pub use status::git_status;
