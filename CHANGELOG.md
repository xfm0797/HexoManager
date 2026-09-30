# Changelog

本文件记录 HexoManager 的所有重要变更。
格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [1.0.0] - 2026-09-30

### 新增

- **站点管理**：新建站点向导（4 步）、导入已有站点、站点列表卡片/表格视图、站点详情统计、站点复制与备份
- **文章管理**：Monaco Editor 编辑、实时 Markdown 预览、草稿管理、分类与标签管理、文章搜索、批量导入
- **配置管理**：`_config.yml` 可视化表单编辑、主题配置编辑、部署配置编辑、原始 YAML 双向编辑、配置合法性验证
- **主题管理**：已安装主题列表、在线安装、主题切换、主题配置编辑、主题搜索、主题卸载与更新
- **部署管理**：Git 状态面板、一键部署（add + commit + push）、部署历史、部署日志、多平台部署、Webhook 触发
- **Pages 服务配置**：GitHub Pages、Gitee Pages、GitLab Pages、Vercel、Netlify、Cloudflare Pages、EdgeOne Pages 配置生成，边缘层智能回源配置，CI/CD 配置预览
- **本地预览**：内置 Hexo server 启停、多端口并行预览、文件变更自动刷新
- **关于与更新**：软件信息、技术栈展示、检查更新、自动更新开关、更新日志、开源许可、反馈入口

### 技术栈

- Tauri 2.x + React 18 + TypeScript 5 + Ant Design 5 + Tailwind CSS 3 + Zustand 4
- Rust 后端：rusqlite (SQLite)、tokio、handlebars、reqwest
- 数据库：SQLite，8 张业务表 + 索引

[Unreleased]: https://github.com/xfm/hexo-manager/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/xfm/hexo-manager/releases/tag/v1.0.0
