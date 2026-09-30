# 部署配置示例

本目录用于存放 HexoManager「部署配置」页生成的配置产物样例，便于对照与手工部署。

## 目录说明

实际生成的配置文件会直接写入你的 **Hexo 站点目录**（而非本目录）。本目录仅作为参考样例与输出沙箱。

## 文件清单

在「部署配置」页选中不同平台后，工具会生成以下文件：

| 文件 | 来源平台 | 说明 |
| --- | --- | --- |
| `.github/workflows/deploy.yml` | GitHub Pages | GitHub Actions 构建并发布到 Pages |
| `.github/workflows/gitee-pages.yml` | Gitee Pages | Gitee Go 流水线配置 |
| `.gitlab-ci.yml` | GitLab Pages | GitLab CI 流水线 |
| `vercel.json` | Vercel | Vercel 项目声明式配置 |
| `.github/workflows/vercel.yml` | Vercel | 通过 Actions 触发 Vercel 部署 |
| `netlify.toml` | Netlify | 构建命令、发布目录与重定向规则 |
| `.github/workflows/netlify.yml` | Netlify | 通过 Actions 触发 Netlify 部署 |
| `.github/workflows/cloudflare-pages.yml` | Cloudflare Pages | 通过 Wrangler 发布 |
| `cloudflare.toml` | Cloudflare | Wrangler 项目配置 |
| `cloudflare-worker.js` | 边缘层 | Worker 脚本：智能回源、故障转移、缓存策略 |
| `.github/workflows/edgeone.yml` | EdgeOne Pages | EdgeOne 部署流水线 |
| `edgeone.config.json` | EdgeOne | 声明式配置 |
| `edgeone-config.txt` | EdgeOne | 控制台手工配置指引 |
| `CNAME` | 自定义域名 | GitHub Pages 自定义域名声明 |
| `deploy_readme.md` | 全部 | 部署操作手册，含各平台控制台步骤 |

## 使用建议

1. **先预览再写入**：在页面上点击「预览配置」确认内容无误后再写入磁盘
2. **同名文件会先备份**：工具在覆盖前会自动备份为 `{文件名}.bak.{时间戳}`
3. **敏感信息用 Secrets**：环境变量（如 `CF_API_TOKEN`、`VERCEL_TOKEN`）应配置在平台 Secrets 中，不要提交到仓库
4. **Workflow 权限**：GitHub Actions 需要在仓库 Settings → Actions → General 中将 Workflow permissions 设为 "Read and write permissions"

## 回源策略对照

| 策略值 | 界面名称 | 适用场景 |
| --- | --- | --- |
| `failover` | 智能故障转移 | 追求高可用，主源故障时自动切换 |
| `primary` | 仅主源 | 单源站，配置最简单 |
| `round-robin` | 多源轮询 | 多源站分摊流量 |
| `nearest` | 就近回源 | 按地理位置选择最近源站，降低延迟 |
