# Changelog

本文件记录 HexoManager 的所有重要变更。
格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。



## [1.0.2] - 2026-10-03

### 修复

- **修复「文章管理 → 编辑区一直 loading，预览正常」**：编辑区用的 `@monaco-editor/react` 底层由 `@monaco-editor/loader` 从 jsDelivr CDN（`https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs`）动态注入 `<script>` 加载 Monaco，而应用 CSP 的 `script-src 'self'` 会拦截外链脚本，导致 loader 的 Promise 永不 resolve、编辑器永久停在 loading；预览走的是已打包的 `react-markdown`，同源渲染故不受影响
  - 新增 `src/utils/monaco.ts`：用 `loader.config({ monaco })` 把 loader 指向本地打包的 monaco 实例，并配置 `MonacoEnvironment.getWorker` 使用本地 worker，彻底去掉运行时 CDN 依赖
  - 在 `src/main.tsx` 最顶部以副作用方式引入该模块，确保先于任何编辑器渲染生效
  - 注意：`monaco-editor@0.57` 的 `exports` 已把子路径映射为 `./esm/vs/*.js`，worker 需以 `monaco-editor/<lang>/xxx.worker.js?worker`（去前缀、保留 `.js`）形式导入

## [1.0.1] - 2026-10-02

### 修复

- **修复「文件管理」点击文件后长时间 loading 的问题**：
  - `loadTree` 的 `useCallback` 依赖含 `selectedDir`，而它自己又会 `setSelectedDir`，导致每次点击目录都重建回调并触发整棵文件树重新拉取（实测旧实现 effect 触发 3 次、新实现 1 次）；现移除该依赖并改用函数式 `setSelectedDir`
  - `FileTree` 在 `loading` 为真时用 `Spin` 整体替换树内容，刷新期间列表被完全顶掉；现仅在**首次加载**显示骨架，后续刷新保留旧树并在标题旁显示小尺寸指示器
  - 文件树加载失败只弹一条 toast、树仍显示空态；现新增 `treeError` 状态并在页面展示带重试按钮的错误 Alert
  - 站点切换时未重置 `selectedDir`/`files`，可能残留上一个站点的目录选择；现显式重置
- **修复「编辑主题配置」加载不出内容的问题**（三层原因）：
  - 后端 `current_theme` 在站点未配置 `theme` 字段时静默兜底 `landscape`，导致去读一个与用户无关的主题目录；现改为「显式配置 → `themes/` 唯一主题推断 → 最后兜底」
  - 后端 `get_theme_config` 只查 `themes/<theme>/_config.yml` 一个位置，漏掉官方的站点级覆盖文件 `_config.<theme>.yml`；现按 3 个候选路径依次查找
  - 前端 `fetchThemeConfig` 把错误写进 `error` 却从不由 Hook 暴露，抽屉因此落入「该主题没有独立的 _config.yml」的误导性空态；现新增 `themeError` 并透出，抽屉展示错误详情 + 重试按钮
- 主题配置加载失败时返回可操作的诊断信息：列出现有主题名或主题目录实际内容，而非一句「文件不存在」
- 支持 Hexo 的 `theme: {name: xxx}` 对象写法
- **修复文章模块完全不可用的问题**：`row_to_article` 的列索引与 `ARTICLE_COLUMNS` 错位（`categories` 起全部偏移一格，`published_at` 读到越界索引 17），导致新建文章报「资源未找到：新建文章后未能读取记录」，文章列表、详情、保存、发布、下架、搜索同样失效
- 修正 `create_article` 的错误映射：区分「记录确实不存在」与「映射失败」，不再把内部错误伪装成 `NotFound`
- 清理误导性的 `_COLUMN_ORDER_NOTE` 注释，改为在 `row_to_article` 上方标注权威列序

### 新增

- **自动更新检测**：内置默认更新源链路（GitHub Releases `latest.json` 首选 + Releases API 回退），应用启动时按设置静默检查最新版本
- **多格式清单解析**：兼容 Tauri updater v2 三元组平台键（`windows-x86_64` 等）与 GitHub Releases API（`tag_name` + `assets` 按平台挑选安装包）
- **顶栏更新入口**：发现新版本且未忽略时，顶栏常驻「新版本」角标按钮直达更新页
- **更新源链路展示**：「关于与更新 → 更新设置」新增当前平台与更新源优先级可视化
- 新增 `get_update_config` 命令与 14 个单元测试（更新解析 5 个、state 注册 2 个、文章列索引 2 个、主题解析 5 个）
- 修复 managed state 类型不匹配：`app.manage(Arc::new(state))` 改为 `app.manage(state)`，此前全部 83 处带 state 的命令均报 "state not managed"

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


[1.0.2]: https://github.com/xfm0797/HexoManager/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/xfm0797/HexoManager/compare/v1.0.0...v1.0.1

