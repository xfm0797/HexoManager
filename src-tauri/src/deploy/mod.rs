//! 部署配置生成模块入口。

pub mod config_generator;
pub mod pages_generator;

pub use config_generator::{
    generate_all, list_templates, preview_all, render_file, TemplateContext,
};
