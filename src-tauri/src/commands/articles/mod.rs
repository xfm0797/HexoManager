//! 文章模块的子模块，按职责划分：
//!
//! - `query` / `crud` / `publish` / `taxonomy`：Tauri 命令层（参数校验 + 编排）；
//! - `store`：文章数据层（扫描结果结构、列常量、单篇回写、整站对账）；
//! - `front_matter`：Front Matter 的拆分与拼装；
//! - `history`：基于 git 的历史版本读取。
//!
//! `commands::article_commands` 只是这些模块的对外门面（re-export）。

pub mod crud;
pub mod front_matter;
pub mod history;
pub mod publish;
pub mod query;
pub mod store;
pub mod taxonomy;
