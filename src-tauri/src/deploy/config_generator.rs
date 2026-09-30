//! 部署配置文件生成器。
//!
//! 使用 handlebars 渲染内置模板，产出 8 个平台所需的 CI/CD 与 Pages 配置。
//! 模板通过 `include_str!` 编译期内联，保证打包后无需外部文件。

use crate::models::{DeployTemplate, GeneratedFile};
use crate::utils::error::{AppError, AppResult};
use handlebars::Handlebars;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::path::Path;

/// 模板渲染上下文。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateContext {
    pub site_name: String,
    pub domain: String,
    pub repo_url: String,
    pub repo_owner: String,
    pub repo_name: String,
    pub branch: String,
    pub node_version: String,
    pub build_command: String,
    pub output_dir: String,
    pub env_vars: Vec<EnvVarPlain>,
    pub edge_provider: String,
    pub edge_domain: String,
    pub origin_strategy: String,
    pub origin_url: String,
    pub edgeone_project: String,
    pub cloudflare_project: String,
    pub vercel_org: String,
    pub vercel_project: String,
    pub netlify_site: String,
    pub year: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvVarPlain {
    pub key: String,
    pub value: String,
}

impl Default for TemplateContext {
    fn default() -> Self {
        Self {
            site_name: "My Hexo Blog".into(),
            domain: "example.com".into(),
            repo_url: "https://github.com/username/blog".into(),
            repo_owner: "username".into(),
            repo_name: "blog".into(),
            branch: "main".into(),
            node_version: "20".into(),
            build_command: "npm install && npx hexo generate".into(),
            output_dir: "public".into(),
            env_vars: Vec::new(),
            edge_provider: "cloudflare".into(),
            edge_domain: "edge.example.com".into(),
            origin_strategy: "smart_routing".into(),
            origin_url: "https://username.github.io/blog".into(),
            edgeone_project: "hexo-blog".into(),
            cloudflare_project: "hexo-blog".into(),
            vercel_org: "username".into(),
            vercel_project: "hexo-blog".into(),
            netlify_site: "hexo-blog".into(),
            year: "2026".into(),
        }
    }
}

/// 单个模板文件定义。
struct TemplateFile {
    /// 模板在 bundle 中的 id
    id: &'static str,
    /// 目标相对路径
    path: &'static str,
    /// 平台标识
    platform: &'static str,
    /// 文件说明
    description: &'static str,
    /// 模板内容
    source: &'static str,
}

/// 全部内置模板清单。
const TEMPLATES: &[TemplateFile] = &[
    // ---------- GitHub Pages ----------
    TemplateFile {
        id: "github_pages",
        path: ".github/workflows/pages.yml",
        platform: "github",
        description: "GitHub Actions 自动构建并部署到 GitHub Pages",
        source: include_str!("templates/github_pages.yml.hbs"),
    },
    TemplateFile {
        id: "github_cname",
        path: "source/CNAME",
        platform: "github",
        description: "自定义域名配置（GitHub Pages / Gitee Pages 通用）",
        source: include_str!("templates/cname.hbs"),
    },
    // ---------- Gitee Pages ----------
    TemplateFile {
        id: "gitee_pages",
        path: ".gitee/workflows/pages.yml",
        platform: "gitee",
        description: "Gitee Go 自动构建并部署到 Gitee Pages",
        source: include_str!("templates/gitee_pages.yml.hbs"),
    },
    // ---------- GitLab Pages ----------
    TemplateFile {
        id: "gitlab_ci",
        path: ".gitlab-ci.yml",
        platform: "gitlab",
        description: "GitLab CI/CD 自动构建并部署到 GitLab Pages",
        source: include_str!("templates/gitlab_ci.yml.hbs"),
    },
    // ---------- Vercel ----------
    TemplateFile {
        id: "vercel_json",
        path: "vercel.json",
        platform: "vercel",
        description: "Vercel 项目配置：构建命令、输出目录与缓存响应头",
        source: include_str!("templates/vercel.json.hbs"),
    },
    TemplateFile {
        id: "vercel_workflow",
        path: ".github/workflows/vercel.yml",
        platform: "vercel",
        description: "GitHub Actions 自动部署到 Vercel",
        source: include_str!("templates/vercel.yml.hbs"),
    },
    // ---------- Netlify ----------
    TemplateFile {
        id: "netlify_toml",
        path: "netlify.toml",
        platform: "netlify",
        description: "Netlify 项目配置：构建命令、发布目录与重定向规则",
        source: include_str!("templates/netlify.toml.hbs"),
    },
    TemplateFile {
        id: "netlify_workflow",
        path: ".github/workflows/netlify.yml",
        platform: "netlify",
        description: "GitHub Actions 自动部署到 Netlify",
        source: include_str!("templates/netlify.yml.hbs"),
    },
    // ---------- Cloudflare Pages ----------
    TemplateFile {
        id: "cloudflare_toml",
        path: "cloudflare.toml",
        platform: "cloudflare",
        description: "Cloudflare Pages 项目配置（wrangler 读取）",
        source: include_str!("templates/cloudflare.toml.hbs"),
    },
    TemplateFile {
        id: "cloudflare_workflow",
        path: ".github/workflows/cloudflare-pages.yml",
        platform: "cloudflare",
        description: "GitHub Actions 自动部署到 Cloudflare Pages",
        source: include_str!("templates/cloudflare_pages.yml.hbs"),
    },
    // ---------- EdgeOne Pages ----------
    TemplateFile {
        id: "edgeone_config",
        path: "edgeone.config.json",
        platform: "edgeone",
        description: "腾讯云 EdgeOne Pages 项目配置",
        source: include_str!("templates/edgeone.config.json.hbs"),
    },
    TemplateFile {
        id: "edgeone_workflow",
        path: ".github/workflows/edgeone.yml",
        platform: "edgeone",
        description: "GitHub Actions 自动部署到 EdgeOne Pages",
        source: include_str!("templates/edgeone.yml.hbs"),
    },
    // ---------- 边缘层配置 ----------
    TemplateFile {
        id: "edgeone_origin_guide",
        path: "deploy-config/edgeone-config.txt",
        platform: "edge",
        description: "EdgeOne 智能回源与故障转移配置指南",
        source: include_str!("templates/edgeone-config.txt.hbs"),
    },
    TemplateFile {
        id: "cloudflare_worker",
        path: "deploy-config/cloudflare-worker.js",
        platform: "edge",
        description: "Cloudflare Workers 智能回源与故障转移脚本",
        source: include_str!("templates/cloudflare-worker.js.hbs"),
    },
    TemplateFile {
        id: "deploy_readme",
        path: "deploy-config/README.md",
        platform: "edge",
        description: "部署配置说明文档",
        source: include_str!("templates/deploy_readme.md.hbs"),
    },
];

/// 平台 → 模板分组标识。返回静态字符串以便写入 GeneratedFile。
fn platform_filter(platform: &str) -> Option<&'static str> {
    match platform {
        "github" => Some("github"),
        "gitee" => Some("gitee"),
        "gitlab" => Some("gitlab"),
        "vercel" => Some("vercel"),
        "netlify" => Some("netlify"),
        "cloudflare" => Some("cloudflare"),
        "edgeone" => Some("edgeone"),
        "edge" => Some("edge"),
        _ => None,
    }
}

/// 注册全部模板并返回 Handlebars 实例。
fn build_registry() -> AppResult<Handlebars<'static>> {
    let mut hb = Handlebars::new();
    hb.set_strict_mode(false);
    for tpl in TEMPLATES {
        hb.register_template_string(tpl.id, tpl.source)
            .map_err(|e| AppError::Other(format!("模板 {} 注册失败：{}", tpl.id, e)))?;
    }

    // 辅助：把环境变量列表渲染为 KEY=value 形式
    hb.register_helper(
        "env_lines",
        Box::new(
            |h: &handlebars::Helper,
             _: &Handlebars,
             _: &handlebars::Context,
             _: &mut handlebars::RenderContext,
             out: &mut dyn handlebars::Output|
             -> Result<(), handlebars::RenderError> {
                let value = h.param(0).ok_or_else(|| {
                    handlebars::RenderErrorReason::ParamNotFoundForIndex("env_lines", 0)
                })?;
                let arr = value.value().as_array().cloned().unwrap_or_default();
                let mut lines = Vec::new();
                for item in arr {
                    let k = item.get("key").and_then(Value::as_str).unwrap_or("");
                    let v = item.get("value").and_then(Value::as_str).unwrap_or("");
                    if !k.is_empty() {
                        lines.push(format!("{}={}", k, v));
                    }
                }
                out.write(&lines.join("\n"))?;
                Ok(())
            },
        ),
    );

    // 辅助：比较两个字符串是否相等（用于条件渲染）
    hb.register_helper(
        "eq",
        Box::new(
            |h: &handlebars::Helper,
             _: &Handlebars,
             _: &handlebars::Context,
             _: &mut handlebars::RenderContext,
             out: &mut dyn handlebars::Output|
             -> Result<(), handlebars::RenderError> {
                let a = h.param(0).and_then(|v| v.value().as_str()).unwrap_or("");
                let b = h.param(1).and_then(|v| v.value().as_str()).unwrap_or("");
                out.write(if a == b { "true" } else { "false" })?;
                Ok(())
            },
        ),
    );

    // 辅助：字符串是否非空
    hb.register_helper(
        "nonEmpty",
        Box::new(
            |h: &handlebars::Helper,
             _: &Handlebars,
             _: &handlebars::Context,
             _: &mut handlebars::RenderContext,
             out: &mut dyn handlebars::Output|
             -> Result<(), handlebars::RenderError> {
                let v = h.param(0).and_then(|v| v.value().as_str()).unwrap_or("");
                out.write(if v.trim().is_empty() { "" } else { "true" })?;
                Ok(())
            },
        ),
    );

    Ok(hb)
}

/// 从远程地址解析出 owner / repo。
///
/// 支持以下形式：
///   - `https://github.com/owner/repo.git`
///   - `git@github.com:owner/repo.git`
///   - `https://gitee.com/owner/repo`
fn split_repo(repo_url: &str) -> (String, String) {
    let cleaned = repo_url
        .trim()
        .trim_end_matches(".git")
        .trim_end_matches('/');

    // 取出 URL 路径部分：SSH 形式用 ':' 分隔，HTTPS 形式用 '/' 分隔
    let path_part = if cleaned.starts_with("git@") || !cleaned.contains("://") {
        cleaned.rsplit(':').next().unwrap_or(cleaned)
    } else {
        // 去掉协议与主机名
        cleaned
            .split_once("://")
            .map(|(_, rest)| rest.split_once('/').map(|(_, p)| p).unwrap_or(""))
            .unwrap_or(cleaned)
    };

    let mut segments = path_part.split('/').filter(|s| !s.is_empty());
    let owner = segments.next().unwrap_or("username").to_string();
    let repo = segments.next().unwrap_or("blog").to_string();

    (owner, repo)
}

/// 依据入参构建完整渲染上下文。
pub fn build_context(input: &crate::models::GenerateConfigInput) -> TemplateContext {
    let repo_url = input.repo_url.clone().unwrap_or_default();
    let (owner, repo) = split_repo(&repo_url);

    let domain = input.domain.clone().unwrap_or_else(|| {
        format!(
            "{}.github.io",
            if owner == "username" {
                "example".into()
            } else {
                owner.clone()
            }
        )
    });

    let site_name = input
        .site_name
        .clone()
        .unwrap_or_else(|| "My Hexo Blog".into());

    let env_vars = input
        .env_vars
        .clone()
        .unwrap_or_default()
        .into_iter()
        .map(|e| EnvVarPlain {
            key: e.key,
            value: e.value,
        })
        .collect();

    let edge_domain = input
        .edge_domain
        .clone()
        .unwrap_or_else(|| format!("edge.{}", domain));

    TemplateContext {
        site_name,
        origin_url: format!("https://{}", domain),
        edgeone_project: repo.clone(),
        cloudflare_project: repo.clone(),
        vercel_project: repo.clone(),
        netlify_site: repo.clone(),
        domain,
        repo_url,
        repo_owner: owner.clone(),
        repo_name: repo,
        branch: "main".into(),
        node_version: input.node_version.clone().unwrap_or_else(|| "20".into()),
        build_command: input
            .build_command
            .clone()
            .unwrap_or_else(|| "npm install && npx hexo generate".into()),
        output_dir: "public".into(),
        env_vars,
        edge_provider: input
            .edge_provider
            .clone()
            .unwrap_or_else(|| "cloudflare".into()),
        edge_domain,
        origin_strategy: input
            .origin_strategy
            .clone()
            .unwrap_or_else(|| "smart_routing".into()),
        vercel_org: owner.clone(),
        year: chrono::Utc::now().format("%Y").to_string(),
    }
}

/// 渲染单个模板 id。
pub fn render_file(hb: &Handlebars, template_id: &str, ctx: &TemplateContext) -> AppResult<String> {
    hb.render(template_id, ctx)
        .map_err(|e| AppError::Other(format!("模板 {} 渲染失败：{}", template_id, e)))
}

/// 汇总为一个平台集合：默认生成全部平台 + 边缘层 + README。
fn resolve_platforms(ci_platforms: &[String]) -> Vec<&'static str> {
    let mut out: Vec<&'static str> = Vec::new();
    for p in ci_platforms {
        if let Some(f) = platform_filter(p) {
            if !out.contains(&f) {
                out.push(f);
            }
        }
    }
    out
}

/// 预览（不写盘）：返回全部将生成的文件。
pub fn preview_all(input: &crate::models::GenerateConfigInput) -> AppResult<Vec<GeneratedFile>> {
    let hb = build_registry()?;
    let ctx = build_context(input);
    let platforms = resolve_platforms(
        &input
            .ci_platforms
            .clone()
            .unwrap_or_else(|| vec!["github".into()]),
    );

    let mut files = Vec::new();
    for tpl in TEMPLATES {
        // 边缘层配置与 README 始终生成（只要有 github 或任何平台）
        let include = platforms.contains(&tpl.platform);
        if !include {
            continue;
        }
        let content = render_file(&hb, tpl.id, &ctx)?;
        files.push(GeneratedFile {
            path: tpl.path.to_string(),
            content,
            description: tpl.description.to_string(),
            platform: tpl.platform.to_string(),
        });
    }

    Ok(files)
}

/// 生成并（可选）写入文件。
pub fn generate_all(input: &crate::models::GenerateConfigInput) -> AppResult<Vec<GeneratedFile>> {
    let files = preview_all(input)?;

    if input.write_files {
        let root = Path::new(&input.site_path);
        if !root.exists() {
            return Err(AppError::PathNotFound(input.site_path.clone()));
        }
        for f in &files {
            let target = root.join(&f.path);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&target, &f.content)?;
        }
    }

    Ok(files)
}

/// 返回可用模板清单（供前端「部署配置」页展示平台卡片）。
pub fn list_templates() -> Vec<DeployTemplate> {
    let mut grouped: BTreeMap<&'static str, Vec<&'static str>> = BTreeMap::new();
    for tpl in TEMPLATES {
        grouped.entry(tpl.platform).or_default().push(tpl.path);
    }

    grouped
        .into_iter()
        .map(|(platform, files)| {
            let (name, description, url) = platform_meta(platform);
            DeployTemplate {
                id: platform.to_string(),
                name: name.to_string(),
                platform: platform.to_string(),
                files: files.iter().map(|s| s.to_string()).collect(),
                description: description.to_string(),
                official_url: url.to_string(),
            }
        })
        .collect()
}

/// 平台元信息。
fn platform_meta(platform: &str) -> (&'static str, &'static str, &'static str) {
    match platform {
        "github" => (
            "GitHub Pages",
            "免费静态站点托管，支持自定义域名与 HTTPS",
            "https://pages.github.com/",
        ),
        "gitee" => (
            "Gitee Pages",
            "国内访问速度快的静态站点托管服务",
            "https://gitee.com/help/articles/4136",
        ),
        "gitlab" => (
            "GitLab Pages",
            "GitLab 内置的静态站点托管，支持 CI/CD 流水线",
            "https://docs.gitlab.com/ee/user/project/pages/",
        ),
        "vercel" => (
            "Vercel",
            "面向前端的一体化部署平台，支持自动预览与环境变量",
            "https://vercel.com/docs",
        ),
        "netlify" => (
            "Netlify",
            "JAMstack 部署平台，支持表单、函数与边缘网络",
            "https://docs.netlify.com/",
        ),
        "cloudflare" => (
            "Cloudflare Pages",
            "Cloudflare 全球边缘网络静态托管，免费无限带宽",
            "https://developers.cloudflare.com/pages/",
        ),
        "edgeone" => (
            "EdgeOne Pages",
            "腾讯云 EdgeOne 边缘安全加速平台的静态托管能力",
            "https://cloud.tencent.com/product/teo",
        ),
        "edge" => (
            "边缘层配置",
            "智能回源、故障转移与多源站容灾配置脚本",
            "https://developers.cloudflare.com/workers/",
        ),
        _ => ("未知平台", "", ""),
    }
}
