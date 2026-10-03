//! 领域模型定义（与数据库表结构、前端 TypeScript 类型一一对应）。

use serde::{Deserialize, Serialize};
use serde_json::Value;

// ==================== 站点 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Site {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub domain: Option<String>,
    pub path: String,
    pub node_version: Option<String>,
    pub theme: Option<String>,
    pub status: Option<String>,
    pub article_count: i64,
    pub draft_count: i64,
    pub last_deploy_at: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// 站点创建入参。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSiteInput {
    pub name: String,
    pub path: String,
    pub description: Option<String>,
    pub domain: Option<String>,
    pub theme: Option<String>,
    pub node_version: Option<String>,
    pub repo_url: Option<String>,
    pub branch: Option<String>,
}

/// 站点更新入参（部分字段）。
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSiteInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub domain: Option<String>,
    pub theme: Option<String>,
    pub status: Option<String>,
    pub node_version: Option<String>,
}

/// 站点统计。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteStats {
    pub article_count: i64,
    pub draft_count: i64,
    pub published_count: i64,
    pub total_words: i64,
    pub categories: Vec<String>,
    pub tags: Vec<String>,
    pub last_deploy_at: Option<String>,
    pub disk_usage: u64,
}

// ==================== 文章 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Article {
    pub id: i64,
    pub site_id: i64,
    pub title: String,
    pub slug: Option<String>,
    pub file_path: String,
    pub content: Option<String>,
    pub excerpt: Option<String>,
    pub status: String,
    pub categories: Vec<String>,
    pub tags: Vec<String>,
    pub cover_image: Option<String>,
    pub is_top: bool,
    pub allow_comment: bool,
    pub word_count: i64,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub published_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedArticles {
    pub items: Vec<Article>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
}

/// 文章查询参数。
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleQuery {
    pub site_id: i64,
    pub status: Option<String>,
    pub category: Option<String>,
    pub tag: Option<String>,
    pub query: Option<String>,
    pub page: Option<i64>,
    pub limit: Option<i64>,
}

/// 文章更新入参。
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateArticleInput {
    pub title: Option<String>,
    pub content: Option<String>,
    pub excerpt: Option<String>,
    pub categories: Option<Vec<String>>,
    pub tags: Option<Vec<String>>,
    pub cover_image: Option<String>,
    pub is_top: Option<bool>,
    pub allow_comment: Option<bool>,
    pub status: Option<String>,
}

/// 分类。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub name: String,
    pub count: i64,
}

/// 标签。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub name: String,
    pub count: i64,
}

// ==================== Front Matter 模板 ====================

/// Front Matter 模板。
///
/// 模板是**全局**的（不区分站点）：一套「常用字段」在多站点间复用。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontMatterTemplate {
    pub id: i64,
    /// 模板名（列表主标题）
    pub name: String,
    /// 一句话说明，用于选择时的副标题
    pub description: Option<String>,
    /// 展示用图标（emoji 或图标名）
    pub icon: Option<String>,
    /// 模板字段，必须是 JSON 对象；值可为任意 YAML 可表达的类型
    pub fields: Value,
    /// 正文骨架，支持 `{{title}}` / `{{slug}}` / `{{date}}` / `{{datetime}}` 占位符
    pub body: Option<String>,
    /// 是否为内置模板（内置模板不可删除）
    pub is_builtin: bool,
    /// 排序值（小的在前）
    pub sort_order: i64,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// 模板保存入参（`id` 为空表示新建）。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFrontMatterTemplateInput {
    pub id: Option<i64>,
    pub name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub fields: Option<Value>,
    pub body: Option<String>,
    pub sort_order: Option<i64>,
}

/// 套用模板到已有文章时的选项。
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyTemplateInput {
    pub article_id: i64,
    pub template_id: i64,
    /// 已存在的同名字段是否被模板覆盖（默认 `false`，只补缺失字段）
    pub overwrite: Option<bool>,
    /// 正文处理方式：`none`（默认，不动正文）/ `replace` / `append`
    pub body_mode: Option<String>,
}

/// 套用模板的结果：文章本身 + 本次实际改动了什么（供 UI 回报）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyTemplateResult {
    pub article: Article,
    /// 实际写入 front matter 的字段名
    pub applied_fields: Vec<String>,
    /// 实际生效的正文处理方式
    pub body_mode: String,
    /// 正文是否真的被改动
    pub body_changed: bool,
}

// ==================== Git ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStatus {
    pub path: String,
    /// 工作区状态（M/A/D/?/R）
    pub worktree: String,
    /// 暂存区状态
    pub index: String,
    pub staged: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub is_repo: bool,
    pub branch: Option<String>,
    pub remote: Option<String>,
    pub ahead: i64,
    pub behind: i64,
    pub staged: Vec<GitFileStatus>,
    pub unstaged: Vec<GitFileStatus>,
    pub untracked: Vec<GitFileStatus>,
    pub clean: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitLog {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitConfig {
    pub site_id: i64,
    pub remote_url: String,
    pub branch: String,
    pub auto_deploy: bool,
    pub last_commit: Option<String>,
    pub last_commit_msg: Option<String>,
    pub last_push_at: Option<String>,
}

// ==================== Hexo ====================

/// Hexo 环境检查结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvCheck {
    pub node_installed: bool,
    pub node_version: Option<String>,
    pub npm_installed: bool,
    pub npm_version: Option<String>,
    pub git_installed: bool,
    pub git_version: Option<String>,
    pub hexo_installed: bool,
    pub hexo_version: Option<String>,
    /// 目标目录是否为合法 Hexo 站点
    pub is_hexo_site: bool,
    pub has_node_modules: bool,
    pub issues: Vec<String>,
    pub ready: bool,
}

/// 构建/生成结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildResult {
    pub success: bool,
    pub duration_ms: u64,
    pub output: String,
    pub error: Option<String>,
    /// 生成的静态文件数量
    pub files_generated: Option<usize>,
}

/// 预览服务器句柄。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewServer {
    pub pid: u32,
    pub site_id: i64,
    pub port: u16,
    pub url: String,
    pub started_at: String,
    pub running: bool,
}

/// 部署结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployResult {
    pub success: bool,
    pub commit_hash: Option<String>,
    pub remote: Option<String>,
    pub branch: Option<String>,
    pub duration_ms: u64,
    pub output: String,
    pub error: Option<String>,
}

// ==================== 主题 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Theme {
    pub name: String,
    pub path: String,
    pub version: Option<String>,
    pub description: Option<String>,
    pub author: Option<String>,
    pub repo: Option<String>,
    pub is_active: bool,
    pub has_config: bool,
    pub installed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeInfo {
    pub name: String,
    pub display_name: Option<String>,
    pub description: Option<String>,
    pub author: Option<String>,
    pub repo: Option<String>,
    pub stars: Option<i64>,
    pub npm_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeConfig {
    pub site_id: i64,
    pub theme_name: String,
    pub config: serde_json::Value,
    pub is_active: bool,
    pub raw: String,
}

// ==================== 插件 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Plugin {
    pub id: i64,
    pub site_id: i64,
    pub name: String,
    pub version: Option<String>,
    pub is_active: bool,
    pub config: Option<String>,
    pub created_at: Option<String>,
}

// ==================== 部署配置 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployConfig {
    pub site_id: i64,
    pub repo_platform: String,
    pub ci_platforms: Vec<String>,
    pub node_version: String,
    pub build_command: String,
    pub deploy_targets: Vec<String>,
    pub env_vars: Vec<EnvVar>,
    pub edge_provider: Option<String>,
    pub edge_domain: Option<String>,
    pub origin_strategy: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvVar {
    pub key: String,
    pub value: String,
    #[serde(default)]
    pub secret: bool,
}

/// 生成的配置文件。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedFile {
    pub path: String,
    pub content: String,
    pub description: String,
    pub platform: String,
}

/// 部署配置生成入参。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateConfigInput {
    pub site_path: String,
    pub site_name: Option<String>,
    pub domain: Option<String>,
    pub repo_url: Option<String>,
    pub repo_platform: Option<String>,
    pub ci_platforms: Option<Vec<String>>,
    pub node_version: Option<String>,
    pub build_command: Option<String>,
    pub env_vars: Option<Vec<EnvVar>>,
    pub edge_provider: Option<String>,
    pub edge_domain: Option<String>,
    pub origin_strategy: Option<String>,
    /// 为 true 时真正写入文件，否则仅预览
    #[serde(default)]
    pub write_files: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployTemplate {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub files: Vec<String>,
    pub description: String,
    pub official_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployLog {
    pub id: i64,
    pub site_id: i64,
    pub status: String,
    pub commit_message: Option<String>,
    pub commit_hash: Option<String>,
    pub branch: Option<String>,
    pub duration_ms: Option<i64>,
    pub error_message: Option<String>,
    pub output: Option<String>,
    pub created_at: Option<String>,
}

// ==================== 更新与关于 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub available: bool,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub notes: Option<String>,
    pub pub_date: Option<String>,
    pub download_url: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSettings {
    pub auto_check: bool,
    pub last_check_at: Option<String>,
    pub last_version: Option<String>,
    pub skip_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Changelog {
    pub version: String,
    pub date: String,
    pub changes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub license: String,
    pub repository: String,
    pub homepage: String,
    pub tauri_version: String,
    pub build_date: String,
    pub tech_stack: Vec<TechItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TechItem {
    pub name: String,
    pub version: String,
    pub layer: String,
    pub url: String,
}

/// 通用键值设置项。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSetting {
    pub key: String,
    pub value: String,
}
