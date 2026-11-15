# Changelog

本文件记录 HexoManager 的所有重要变更。
格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。



## [Unreleased]

### 修复

- **保存文章会误删同站其他文章的数据库记录**：新建/保存原本复用了「整站对账」逻辑
  （本次扫描未见到的 `file_path` 直接删除），却只传入当前这一篇，导致其余文章的行被清空 ——
  表现为分类/标签筛选列表瞬间塌缩、下次全量扫描后文章 ID 漂移（编辑器里持有的旧 ID 失效）。
  现拆分为两种语义：`upsert_article`（单篇回写，绝不删除）与 `reconcile_site`（整站对账，
  仅刷新/导入/站点切换时使用），并新增 2 个回归测试锁定
- **发布草稿会静默覆盖同名文章**：`_drafts/hello.md` 发布时若 `_posts/hello.md` 已存在，
  原本直接写入目标文件（不可撤销）。现按 `create_article` 的策略改名为 `hello-1.md`，
  界面提示实际发布后的文件名；下架回草稿同样处理
- **主题配置读写文件不一致**：读取优先级原本把 `themes/<t>/_config.yml` 排在
  `_config.<t>.yml` 之前，而几乎所有主题都自带前者，导致官方推荐的站点级覆盖永远读不到，
  修改又写进被覆盖的那份 —— 表现为「改了主题配置没生效」。现按 Hexo 实际生效顺序
  （站点级覆盖优先）读写，接口返回 `sourcePath` / `isSiteOverride`，编辑抽屉顶部直接显示
  正在编辑的文件及覆盖关系；两份都不存在时新建站点级覆盖文件，避免动主题自带文件
- 已发布文章重复保存不再重置 `published_at`（此前每次保存都写当前时间，改错别字就会跳到列表最前）
- 站点 `updated_at` 仅在文章计数真正变化时刷新（此前每篇保存都会改，站点列表排序随浏览行为变动）

### 性能

- **读接口不再隐式扫描全站**：`get_articles` / `get_site_stats` 原本每次调用都遍历
  `source/_posts` 与 `source/_drafts`（500 篇站点每次翻页 ≈ 500 次文件读 + YAML 解析 + 全表
  UPDATE）。现在列表/统计只读数据库，磁盘同步由显式动作触发：新增 `refresh_articles` 命令，
  「刷新」按钮与「本次会话首次进入某站点」时调用
- **增量扫描**：新增 `articles.file_mtime` / `file_size`，扫描时先 `stat`，指纹一致直接跳过
  读取与解析；`db/migrations` 改为 `PRAGMA user_version` 驱动的顺序迁移（老库自动补列）
- **列表不再回传正文**：新增 `ARTICLE_LIST_COLUMNS`（`content` 以 `NULL` 占位，保持
  `row_to_article` 索引不变），列表/搜索的 IPC 体积降一个数量级；阅读时长改用库里的字数估算
- **扫描移出 async 上下文**：`rescan_articles` 的读盘部分放进 `spawn_blocking`，
  避免长时间占住 tokio worker 让其他命令排队
- **Monaco 精简与懒加载**：新增 `utils/monacoEntry.ts`（从 `editor.main.js` 裁剪，只保留编辑
  器功能 + markdown/yaml/json/ini/shell/javascript 六种语言），移除 ts/css/html 三个 worker，
  并把编辑器改为 `React.lazy` 加载。`dist` 从 **16 MB 降到 6.9 MB**，首屏 JS 不再包含约 4 MB
  的 Monaco（`index.html` 只剩 index + antd 两个入口 chunk）
- **页面按需加载**：`App.tsx` 的 15 个页面改为 `React.lazy`，`MainLayout` 提供 `Suspense` 占位

### 修复

- **部署配置生成三处失真**
  - 「启用边缘层」此前不生成任何文件：边缘层模板靠 `ciPlatforms.contains("edge")` 过滤，而
    平台清单里永远没有 `edge`。现改为按模板作用域判断（`Platform` / `Edge` / `Common`），
    边缘层由 `edge_provider` 控制，README 常驻生成
  - 构建命令此前被 GitHub / Gitee / GitLab / Cloudflare 四个 workflow 模板忽略（硬编码
    `npm install`）。现统一改用 `{{build_command}}`，并把默认预设改为
    `npm install && npx hexo clean && npx hexo generate`（CI 里没有全局 `hexo`）
  - 分支与输出目录不再硬编码 `main` / `public`：部署配置新增「部署分支」「输出目录」两项，
    随 `deploy_configs` 持久化（迁移 v2），并用于生成 workflow 的触发分支与产物路径
- **Front Matter 回写保序、且无变化不写盘**：`serde_json` 启用 `preserve_order`，键序不再
  被按字母重排；保存时先构建「不含 updated」的结果与原文比较，完全一致则既不写盘也不改
  `updated`（此前 30 秒自动保存会给每篇文章刷一个空 diff）
- 发布草稿/下架的实时进度事件接上：部署页监听 `deploy:log`，git 暂存/提交/推送的进度
  即时追加到日志，而不是等命令返回后一次性回放

### 安全

- **自动更新安装前强制验签**：此前 `install_update` 拿到下载好的安装包直接执行，签名虽已下发却
  从未被校验 —— 攻击者只需劫持 `latest.json` 即可投递任意可执行文件。现新增
  `update/install.rs::verify_signature`（`minisign-verify`），从 `latest.json` 同一条目取出
  `signature` 一并传给后端，公钥读 `tauri.conf.json` 的 `plugins.updater.pubkey`；
  **缺少签名或公钥直接拒装**（`AppError::Forbidden`），不做「跳过校验继续装」的降级
- **更新包下载改为流式落盘**：原本 `resp.bytes()` 把整个安装包读进内存再写文件，百 MB 级安装包
  在低配机器上会瞬时吃满内存。现改为按 chunk 边下边写
- **本地文件读写加路径白名单**：`read_file` / `write_file` / `delete_file` / `list_dir` 等 10 个
  命令此前接受任意绝对路径，前端一旦被注入脚本即可读写全盘。现默认只允许**已登记站点目录**内的
  路径，`..` 逃逸与根目录一律拒绝；文件对话框选定的路径需显式带 `allowOutside=true` 才放行
  （`canonical_ish` 逐级向上规范化，兼容尚不存在的子路径）

### 修复

- **时间口径三处不一致**：数据库里 `created_at` / `updated_at` / `published_at` 与文章
  front matter 的 `date` 混用了「本地时间字符串」和「UTC 字符串」，同一批数据排序时会出现
  8 小时错位（如「刚刚保存」的文章排到昨天）。现统一为 UTC 落库：新增
  `utils::local_time_to_utc`（依次尝试带偏移格式 → 裸时间按本地解释 → 纯日期补零），
  `format_system_time` 也改为 UTC 输出，前端 `parseTimestamp()` 对无时区串补 `Z` 后解析
- **预览服务进程泄漏**：`start_preview_server` 原本 `mem::forget` 掉子进程句柄，关窗、切站点、
  重复启动都不会杀掉 `hexo server`，端口与进程持续累积。现由 `ServerRegistry` 持有 `Child`，
  支持按站点 / 按 pid 停止，并在 `RunEvent::ExitRequested` 时统一 `stop_all()`；
  同时后台线程常驻读取 stdout/stderr（此前管道写满 64KB 会让 hexo 直接卡死），
  启动失败时回传最近 12 行输出，超时从 20s 放宽到 30s
- **查询失败被静默成空数据**：列表、分类、标签、主题、插件、日志、git 状态等查询类调用原本走
  `callSafe(..., [])`，后端报错时界面显示「暂无数据」，用户无从判断是真没有还是出错。
  现这些调用统一改 `call`，由各 store 捕获写入 `error`，`MainLayout` 顶部新增全局错误条聚合展示
  （切换路由自动复位）；`callSafe` 保留但仅用于「失败即视为可忽略」的探测类调用
- 删除站点不再直接 `remove_dir_all`：改为重命名到同级 `.name.deleted-<时间戳>` 隔离，
  界面提示实际隔离路径，误删可人工找回

### 工程化

- **版本号脚本化**：新增 `scripts/bump-version.mjs`（以 `version.json` 为唯一来源改写 7 个文件
  8 处，含 SemVer 校验、`--dry-run`、Cargo.lock 只改 `hexo-manager` 段）与
  `scripts/check-version.mjs`（核对 9 处一致性），对应 `npm run version:bump` / `version:check`；
  CI 在 TypeScript 检查后新增版本号一致性卡口，避免此前「关于页版本号滞后」类问题复发
- **抽取重复实现**：`db::site_path_of`（5 处 → 1）、`utils::fs::copy_dir`（3 份 → 1）、
  `utils::node::{npx,npm}`（6 处内联平台判断 → 1）、`git::operations::parse_log_lines`
  （2 份 → 1），均补了单元测试
- **拆分 `article_commands.rs`**：1703 行降至 1252 行，front matter 编解码、文章数据层
  （`UpsertArticle` / 列常量 / 对账）、git 历史读取分别迁到 `commands/articles/{front_matter,
  store,history}.rs`，对外命令路径通过 re-export 保持不变

### 新增

- **日志落盘与「导出诊断日志」**：此前命令失败只在前端弹一个 toast，关掉就没了，用户
  报障时无从查起。现在后端把关键路径写进 `<app_data>/logs/app-YYYY-MM-DD.log`
  （按天切分、保留 7 天、单条截断 4000 字、写失败绝不影响主流程）：
  预览服务启停与失败输出、更新检查结果、更新包验签失败；前端 `call` 的每次失败
  也带命令名上报（同一条消息 5 秒内去重，避免轮询接口刷爆文件）。
  「偏好设置 → 本地数据」新增「导出诊断日志」，把最近日志合并成一个带版本/平台
  头的文本，用户可直接附在反馈里

### 性能

- **同步命令移出主线程**：Tauri 2 里普通 `fn` 命令跑在**主线程**上，此前的
  `read_file` / `read_file_base64` / `list_files` / `get_file_tree` / `copy_path` 等
  一旦遇到大文件或大目录就会把窗口卡死。现在这些命令统一改为 `async fn` +
  `spawn_blocking`（新增 `utils::blocking::{run, cmd}`），涉及：
  `file_commands` 全部 10 个命令、`theme_commands` 的主题列表/配置读写/卸载/预览链接、
  `config_commands` 的站点配置读写与导入导出/插件列表、`deploy_commands` 的生成/预览/
  文件冲突检查/部署日志、`site_commands` 的文件树与站点复制/备份、`update_commands`
  的更新日志与本地版本号。前端调用方式不变
- 站点复制与备份改为整段在阻塞线程池执行（整站可达数百 MB，此前会长时间占住
  tokio worker）

### 变更

- **依赖与插件大扫除**：移除 4 个从未被调用的 Rust 插件（`tauri-plugin-fs` /
  `shell` / `process` / `updater`）与 6 个前端包（`@ant-design/charts`、
  `isomorphic-git`、`@tauri-apps/plugin-{fs,process,updater,shell,opener}`）。
  `utils/desktop.ts` 的 `openWithSystem` 改走自研命令（http/https → `open_external`，
  本地路径 → `open_in_explorer`），因此不再需要 shell 插件
- **capabilities 收窄到最小权限**：删掉 `fs:*`（含 `$HOME/**` 等 scope）、`shell:allow-execute`
  （可执行任意命令）、`process:*`、`updater:*`、`opener:*`，只留窗口控制与系统对话框。
  文件读写、子进程、更新安装本就由后端命令自行完成并带路径白名单/验签

### 工程化

- **`article_commands` 二次拆分**：1252 → 323 行，命令层按职责拆到
  `commands/articles/{query,crud,publish,taxonomy}.rs`（列表搜索 / 增删改导入 /
  发布下架 / 分类标签），`article_commands` 只保留 re-export 门面。
  **踩坑记录**：`#[tauri::command]` 生成的 `__cmd__*` 宏不会被 `pub use` 带出去，
  所以 `lib.rs` 的命令注册必须写真实路径，用门面别名会报宏找不到
- CI 的 ESLint 步骤从 `continue-on-error` 改为硬卡口（源码已 0 警告）；
  Clippy 加 `-- -D warnings` 让新增告警以失败标记暴露，暂保留 `continue-on-error`

### 变更

- **后端错误改为结构化载荷（全模块）**：此前 `AppError` 只序列化成中文原文，
  `src/i18n/backendMessages.ts` 用「精确表 + 正则表」按文本匹配翻译 —— Rust 侧改一个字的
  措辞映射就静默失效（1.2.0 修过两条少空格的键）。现在：
  - `AppError::Coded { code, message, params }` 序列化为 `{ code, message, params }`，
    `Display` 仍是中文原文，因此日志与未迁移路径的输出不受影响
  - **全部命令**的签名从 `Result<T, String>` 改为 `AppResult<T>`，删掉约 150 处
    `map_err(|e| e.to_string())`，净减 300 余行样板代码
  - 17 个语义错误码带参数（`site.not_found` / `site.path_taken` / `path.outside_site` /
    `article.not_found` / `article.file_missing` / `git.show_failed` …），
    译文集中在新增的 `src/i18n/errorCodes.ts`，用 `{name}` 占位符插值
  - 前端 `invoke.ts` 先按 code 取译文，未收录再退回旧的中文文本映射 —— 迁移期间不会出现
    「英文界面漏中文」的中间态，旧表因此可以慢慢收缩
  - 顺带修正语义：`get_article` / `update_article` 原本把**任何**数据库错误都报成
    「文章不存在」，现在只有 `QueryReturnedNoRows` 才算不存在，其余保留原始错误

### 工程化

- 新增 `scripts/error-codes-check.mjs`：静态比对 Rust 里 `AppError::coded("…")` 用到的
  code 与 `errorCodes.ts` 的条目，缺失或有中文残留即退出码 1；并入 `npm run i18n:check`，
  CI 的检查步骤相应改为跑 `npm run i18n:check`（含覆盖率 + 错误码两项）

## [1.2.0] - 2026-10-10

### 新增

- **中英双语界面（i18n）**：非中文环境默认英文，中文环境保持中文
  - 语言解析规则为「显式偏好 > 系统语言」：系统语言以 `zh` 开头 → 简体中文；**其余一切（含 `en`、`C`、空值）→ 英文**，因此非中文环境首次启动即为英文界面
  - 「偏好设置 → 常规 → 界面语言」新增三选：跟随系统 / 简体中文 / English；选择持久化到 `localStorage`（`hexo-manager:locale`），偏好为「跟随系统」时监听 `languagechange` 实时跟进
  - 切换语言同步生效：AntD `ConfigProvider` locale、`dayjs` 区域、`<html lang>`、窗口标题
  - 实现方式取「中文原文即词条」：源码保留中文原文并用 `t()` 包裹，英文译文集中在 `src/i18n/locales/en-US.ts`（**键即中文原文**），命中即翻译、未命中原样回退中文，不引入任何第三方 i18n 依赖
  - 支持 `{name}` 占位符插值；数字与时长按语言分别格式化（`万/亿` 对应 `K/M/B`，时长对应 `x 分 y 秒` / `xm ys`）
  - 新增 `scripts/i18n-merge.mjs`（增量合并词条零件，不覆盖手工修正）与 `scripts/i18n-coverage.mjs`（覆盖率校验，存在缺译文时退出码 1，可用作 CI 卡口）
  - 当前覆盖率：源码 1356 条 `t()` 词条 / 字典 1466 条，**缺译文 0**；编辑器、设置、看板、分类标签、通知、404、工具函数与后端消息层均已覆盖
- **后端错误消息的前端英文映射层** `src/i18n/backendMessages.ts`
  - Rust 侧 250+ 条中文错误（统一 `Result<T, String>`）不改命令签名，改由 `services/invoke.ts` 在 catch 中按「精确表 + 带参正则规则表」映射为英文，未命中则原样返回中文，绝不吞掉信息
  - 彻底解法是把 Rust 侧错误改为错误码枚举，届时该过渡层即可移除

### 修复

- 修复「关于与更新 → 技术栈」分层展示顺序错乱：`LAYER_ORDER` 与后端 `src-tauri/src/update/check.rs` 的 `layer` 取值不一致（如后端为 `UI 组件库` 而前端写 `UI 组件`），`indexOf` 恒返回 -1，该分组总是被排到最前
- 技术栈分层名改为跟随当前界面语言展示
- 修正 `backendMessages` 精确表中两条与 Rust 原文不符的键（`站点尚未安装依赖，请先执行 npm install` 与 `无法获取预览进程 PID` 各少一个空格），此前这两条英文映射不会生效
- 清理 4 处失效的 `// eslint-disable-next-line no-await-in-loop` 指令（该规则并未启用，指令只是历史残留，会让 `npm run lint --max-warnings 0` 直接报错）

## [1.1.0] - 2026-10-03

### 新增

- **文章 Front Matter 模板**：把「写新文章时的常用字段」沉淀成模板，一键套用
  - 新建文章对话框可选择模板，创建时即写入模板字段与正文骨架（字段只补缺失，外观里手填的分类/标签优先）
  - 编辑器工具栏新增「套用模板」：可对已有文章补字段，支持「只补缺失 / 覆盖同名字段」与「正文不动 / 追加骨架 / 替换正文」
  - 新增「写作模板」管理面板（文章管理页与偏好设置页均可进入）：表格 / YAML 双模式编辑字段，支持文本、数字、开关、列表、嵌套 JSON 五种类型
  - 正文骨架支持 `{{title}}` / `{{slug}}` / `{{date}}` / `{{datetime}}` 占位符
  - 内置「技术长文 / 教程·操作指南 / 生活随笔」三套模板，可编辑、可另存，但不可删除
  - 后端新增 `front_matter_templates` 表与 `get/save/delete/apply_front_matter_template` 四个命令；模板为全局共享（跨站点复用）

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


[Unreleased]: https://github.com/xfm0797/HexoManager/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/xfm0797/HexoManager/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/xfm0797/HexoManager/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/xfm0797/HexoManager/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/xfm0797/HexoManager/compare/v1.0.0...v1.0.1

