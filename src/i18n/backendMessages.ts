/**
 * 后端消息的英文映射层。
 *
 * 背景：Rust 侧的命令一律返回 `Result<T, String>`，错误文案是中文且带参数
 * （`站点不存在：3`）。要在英文界面下不留中文，有两条路：
 *   1. 把 250+ 条消息改成错误码、在前端翻译 —— 会牵动 60+ 个命令签名，
 *      还会影响日志与部署输出，改动面过大；
 *   2. **在前端拦一层**：拿到中文消息后按规则表映射成英文 —— 本文件的做法。
 *
 * 因此这里用「精确匹配 + 带参正则规则」两张表：
 *   - 命中 → 返回对应英文；
 *   - 未命中 → **原样返回中文**（绝不吞掉信息，只是暂时没英化）。
 *
 * 后续若要彻底解决，应把 Rust 侧的错误改为错误码枚举，本文件即成为过渡层。
 */

import { getLocale } from './index';

/**
 * 精确匹配表：无参数、可整句对应的消息。
 *
 * 所有键一律加引号。纯中文的裸键在 JS 里虽然合法（CJK 属于标识符字符），
 * 但只要键里出现 `，`、空格或全角括号就会变成语法错误，统一加引号可避免这类陷阱。
 */
const EXACT: Record<string, string> = {
  // 站点
  '站点路径不能为空': 'Site path cannot be empty',
  '未命名站点': 'Untitled site',
  '未命名': 'Untitled',
  '未检测到 Git，部署功能将不可用': 'Git was not found; deployment is unavailable',
  '未检测到 Node.js，请先安装 Node.js 18 或更高版本':
    'Node.js was not found — please install Node.js 18 or later',
  '未检测到 npm，请检查 Node.js 安装是否完整':
    'npm was not found — please check that your Node.js installation is complete',
  '当前平台不支持自动安装': 'Automatic installation is not supported on this platform',
  '站点尚未安装依赖，请先执行 npm install':
    'This site has no dependencies installed — run npm install first',
  '目标目录不是有效的 Hexo 站点（缺少 _config.yml 或 source 目录）':
    'Target directory is not a valid Hexo site (missing _config.yml or the source directory)',
  '该目录不是有效的 Hexo 站点：缺少 _config.yml':
    'That directory is not a valid Hexo site: _config.yml is missing',

  // 文章
  '操作后未能读取文章': 'Could not read the article after the operation',
  '更新后未能读取文章': 'Could not read the article after updating',
  '套用模板后未能读取文章': 'Could not read the article after applying the template',
  '无法解析文件名': 'Could not parse the file name',
  '读取历史版本失败': 'Failed to read the article history',

  // Hexo / 预览
  '当前平台不支持进程终止': 'Stopping processes is not supported on this platform',
  '无法获取预览进程 PID': 'Could not get the preview process PID',

  // Git
  '提交信息不能为空': 'The commit message cannot be empty',
  '没有可提交的变更': 'There is nothing to commit',
  '没有需要提交的变更': 'There are no changes to commit',
  '提交成功但未能读取提交记录': 'The commit succeeded but the record could not be read',

  // 配置
  '必须提供 config 或 raw 其中之一': 'Either config or raw must be provided',
  '没有可恢复的配置备份': 'There is no configuration backup to restore',
  'TOML 校验暂未内置，请在保存前自行确认格式':
    'TOML validation is not built in — please verify the format before saving',
  '站点配置文件格式异常，无法写入 theme 字段':
    'The site configuration file is malformed; the theme field cannot be written',

  // 模板
  '模板名称不能为空': 'The template name cannot be empty',
  '模板字段必须是一个 YAML 对象（键值对）':
    'Template fields must be a YAML object (key/value pairs)',
  '字段必须为对象': 'Fields must be an object',
  '内置模板不可删除，可编辑它或另存为新模板':
    'Built-in templates cannot be deleted — edit one or save it as a new template',

  // 主题
  '未在主题文档中找到演示链接': 'No demo link was found in the theme documentation',

  // 部署 / 更新
  '未知平台': 'Unknown platform',
  '清单格式无法识别': 'Unrecognised manifest format',
  '仅支持打开 http/https 链接': 'Only http/https links can be opened',

  // 数据库 / 启动
  '数据库连接锁已损坏': 'The database connection lock is corrupted',
  'HexoManager 启动失败': 'HexoManager failed to start',
  '打开内存数据库失败': 'Failed to open the in-memory database',

  // 域名校验（Pages 配置生成）
  '域名不能为空': 'The domain cannot be empty',
  '域名格式不正确，至少应包含一个点号': 'Invalid domain: it must contain at least one dot',
  '域名中存在空的标签段': 'Invalid domain: it contains an empty label',
  '域名标签段过长（超过 63 字符）': 'Invalid domain: a label exceeds 63 characters',
  '请填写纯域名，不要包含协议或路径（例如 blog.example.com）':
    'Enter a bare domain without protocol or path (e.g. blog.example.com)',
};

/** 带参规则表：命中即返回英文，捕获组按顺序填入 */
const RULES: { re: RegExp; en: (...groups: string[]) => string }[] = [
  // 站点
  { re: /^站点不存在：(.*)$/s, en: (id) => `Site not found: ${id}` },
  { re: /^站点目录不存在：(.*)$/s, en: (p) => `Site directory not found: ${p}` },
  { re: /^该路径已被其他站点占用：(.*)$/s, en: (p) => `That path is already used by another site: ${p}` },
  { re: /^该路径已被导入：(.*)$/s, en: (p) => `That path has already been imported: ${p}` },
  { re: /^删除站点目录失败：(.*)$/s, en: (e) => `Failed to delete the site directory: ${e}` },
  { re: /^目标路径已存在：(.*)$/s, en: (p) => `The target path already exists: ${p}` },
  {
    re: /^目标目录非空，无法初始化站点：(.*)$/s,
    en: (p) => `The target directory is not empty; the site cannot be initialised: ${p}`,
  },
  { re: /^目录不存在：(.*)$/s, en: (p) => `Directory not found: ${p}` },
  { re: /^路径不存在：(.*)$/s, en: (p) => `Path not found: ${p}` },
  { re: /^路径不存在: (.*)$/s, en: (p) => `Path not found: ${p}` },
  { re: /^路径不能为空$/s, en: () => 'The path cannot be empty' },

  // 文章
  { re: /^文章不存在：(.*)$/s, en: (id) => `Article not found: ${id}` },
  { re: /^新建文章后未能读取记录：(.*)$/s, en: (e) => `Could not read the new article record: ${e}` },
  { re: /^读取新建文章记录失败：(.*)$/s, en: (e) => `Failed to read the new article record: ${e}` },
  { re: /^删除文件失败：(.*)$/s, en: (e) => `Failed to delete the file: ${e}` },
  { re: /^复制文件失败：(.*)$/s, en: (e) => `Failed to copy the file: ${e}` },

  // 文件操作
  { re: /^文件不存在：(.*)$/s, en: (p) => `File not found: ${p}` },
  { re: /^创建目录失败：(.*)$/s, en: (e) => `Failed to create the directory: ${e}` },
  {
    re: /^删除目录失败（目录可能非空）：(.*)$/s,
    en: (e) => `Failed to delete the directory (it may not be empty): ${e}`,
  },
  { re: /^写入文件失败：(.*)$/s, en: (e) => `Failed to write the file: ${e}` },
  { re: /^读取文件失败：(.*)$/s, en: (e) => `Failed to read the file: ${e}` },
  { re: /^读取目录失败：(.*)$/s, en: (e) => `Failed to read the directory: ${e}` },
  { re: /^重命名失败：(.*)$/s, en: (e) => `Rename failed: ${e}` },
  { re: /^打开目录失败：(.*)$/s, en: (e) => `Failed to open the directory: ${e}` },
  { re: /^源路径不存在：(.*)$/s, en: (p) => `Source path not found: ${p}` },
  { re: /^目标不是目录：(.*)$/s, en: (p) => `The target is not a directory: ${p}` },
  {
    re: /^目标是一个目录，无法作为文件读取：(.*)$/s,
    en: (p) => `The target is a directory and cannot be read as a file: ${p}`,
  },
  {
    re: /^出于安全考虑，不允许直接操作根目录：(.*)$/s,
    en: (p) => `Operating on the root directory is not allowed for safety reasons: ${p}`,
  },

  // Hexo / 进程
  { re: /^命令 `(.*)` 执行超时（(.*) 秒）$/s, en: (cmd, s) => `Command \`${cmd}\` timed out after ${s}s` },
  { re: /^端口 (.*) 已被占用，请更换端口$/s, en: (p) => `Port ${p} is already in use — please pick another` },
  {
    re: /^预览服务在 (.*) 秒内未能监听端口 (.*)，请检查站点依赖是否安装完整$/s,
    en: (s, p) =>
      `The preview server did not listen on port ${p} within ${s}s — check that the site's dependencies are fully installed`,
  },
  { re: /^结束进程 (.*) 失败$/s, en: (pid) => `Failed to terminate process ${pid}` },
  {
    re: /^Hexo 初始化失败：\n([\s\S]*?)\n---回退方案---\n([\s\S]*)$/,
    en: (e, fb) => `Hexo initialisation failed:\n${e}\n--- fallback ---\n${fb}`,
  },
  { re: /^依赖安装失败：\n([\s\S]*)$/s, en: (e) => `Failed to install dependencies:\n${e}` },

  // Git
  { re: /^未检测到 Git 仓库，正在初始化…$/s, en: () => 'No Git repository found — initialising…' },
  { re: /^正在提交：(.*)$/s, en: (m) => `Committing: ${m}` },
  { re: /^chore: 自动部署于 (.*)$/s, en: (t) => `chore: automated deploy at ${t}` },

  // 配置
  { re: /^JSON 格式错误：(.*)$/s, en: (e) => `Invalid JSON: ${e}` },
  { re: /^解析导入内容失败：(.*)$/s, en: (e) => `Failed to parse the imported content: ${e}` },
  { re: /^恢复配置失败：(.*)$/s, en: (e) => `Failed to restore the configuration: ${e}` },
  { re: /^解析主题配置失败（(.*)）：([\s\S]*)$/s, en: (f, e) => `Failed to parse the theme config (${f}): ${e}` },
  { re: /^读取主题配置失败（(.*)）：([\s\S]*)$/s, en: (f, e) => `Failed to read the theme config (${f}): ${e}` },
  { re: /^安装插件失败：\n([\s\S]*)$/s, en: (e) => `Failed to install the plugin:\n${e}` },
  { re: /^卸载插件失败：\n([\s\S]*)$/s, en: (e) => `Failed to uninstall the plugin:\n${e}` },

  // 模板
  { re: /^模板不存在：(.*)$/s, en: (id) => `Template not found: ${id}` },
  {
    re: /^已存在同名模板「(.*)」，请换一个名称$/s,
    en: (name) => `A template named “${name}” already exists — please pick another name`,
  },

  // 主题
  { re: /^主题不存在：(.*)$/s, en: (n) => `Theme not found: ${n}` },
  { re: /^主题已存在：(.*)$/s, en: (n) => `Theme already exists: ${n}` },
  { re: /^主题未安装：(.*)$/s, en: (n) => `Theme not installed: ${n}` },
  { re: /^npm 安装主题失败：(.*)$/s, en: (e) => `npm failed to install the theme: ${e}` },
  {
    re: /^npm 安装完成，但未在 node_modules 中找到主题 `(.*)`，请检查包名是否正确$/s,
    en: (n) =>
      `npm finished but the theme \`${n}\` was not found in node_modules — check the package name`,
  },
  { re: /^克隆主题失败：(.*)$/s, en: (e) => `Failed to clone the theme: ${e}` },
  { re: /^卸载主题失败：(.*)$/s, en: (e) => `Failed to uninstall the theme: ${e}` },
  {
    re: /^主题 `(.*)` 正在使用中，请先切换到其他主题$/s,
    en: (n) => `Theme \`${n}\` is currently in use — switch to another theme first`,
  },
  {
    re: /^主题「(.*)」目录为空，主题可能未完整安装（(.*)）。$/s,
    en: (n, c) => `The theme “${n}” directory is empty; the theme may be incomplete (${c}).`,
  },
  {
    re: /^主题「(.*)」目录中未找到 _config.yml（目录内容：(.*)）。$/s,
    en: (n, c) => `No _config.yml was found in the theme “${n}” directory (contents: ${c}).`,
  },
  {
    re: /^主题目录不存在：(.*)。当前已安装的主题：(.*)。$/s,
    en: (d, list) => `Theme directory not found: ${d}. Installed themes: ${list}.`,
  },
  {
    re: /^主题目录不存在：(.*)。该站点尚未安装任何主题，请先在「主题管理」中安装。$/s,
    en: (d) =>
      `Theme directory not found: ${d}. This site has no theme installed yet — install one under Themes first.`,
  },
  {
    re: /^主题更新失败，该主题可能既非 Git 仓库也无法通过 npm 更新：\n([\s\S]*)$/s,
    en: (e) => `Failed to update the theme; it is neither a Git repository nor updatable via npm:\n${e}`,
  },

  // 部署 / Webhook
  { re: /^Webhook 请求失败：(.*)$/s, en: (e) => `Webhook request failed: ${e}` },
  {
    re: /^Webhook 返回状态码 (.*)：(.*)$/s,
    en: (code, body) => `Webhook returned status ${code}: ${body}`,
  },
  { re: /^状态码 (.*)：(.*)$/s, en: (code, body) => `Status ${code}: ${body}` },
  { re: /^创建请求客户端失败：(.*)$/s, en: (e) => `Failed to create the HTTP client: ${e}` },
  { re: /^回滚到 (.*)$/s, en: (rev) => `Roll back to ${rev}` },

  // 更新
  { re: /^下载失败，服务返回状态码 (.*)$/s, en: (c) => `Download failed with status ${c}` },
  { re: /^下载失败：(.*)$/s, en: (e) => `Download failed: ${e}` },
  { re: /^读取下载内容失败：(.*)$/s, en: (e) => `Failed to read the downloaded content: ${e}` },
  {
    re: /^更新源返回状态码 (.*)（(.*)）$/s,
    en: (code, url) => `The update source returned status ${code} (${url})`,
  },
  {
    re: /^请求更新清单失败（(.*)）：([\s\S]*)$/s,
    en: (url, e) => `Failed to fetch the update manifest (${url}): ${e}`,
  },
  {
    re: /^解析更新清单失败（(.*)）：([\s\S]*)$/s,
    en: (url, e) => `Failed to parse the update manifest (${url}): ${e}`,
  },

  // 打开链接 / 命令执行
  { re: /^打开链接失败：(.*)$/s, en: (e) => `Failed to open the link: ${e}` },
  { re: /^命令执行失败: (.*)$/s, en: (e) => `Command failed: ${e}` },
  { re: /^数据库初始化失败（(.*)）：([\s\S]*)$/s, en: (p, e) => `Database initialisation failed (${p}): ${e}` },

  // 域名校验（Pages 配置生成）
  {
    re: /^域名标签段 `(.*)` 不能以连字符开头或结尾$/s,
    en: (l) => `Invalid domain: the label \`${l}\` cannot start or end with a hyphen`,
  },
  {
    re: /^域名标签段 `(.*)` 含非法字符$/s,
    en: (l) => `Invalid domain: the label \`${l}\` contains illegal characters`,
  },

  // 通用错误包装（error.rs）
  { re: /^IO 错误: (.*)$/s, en: (e) => `I/O error: ${e}` },
  { re: /^JSON 解析错误: (.*)$/s, en: (e) => `JSON parse error: ${e}` },
  { re: /^YAML 解析错误: (.*)$/s, en: (e) => `YAML parse error: ${e}` },
  { re: /^模板渲染错误: (.*)$/s, en: (e) => `Template rendering error: ${e}` },
  { re: /^数据库错误: (.*)$/s, en: (e) => `Database error: ${e}` },
  { re: /^网络请求错误: (.*)$/s, en: (e) => `Network error: ${e}` },
  { re: /^参数非法: (.*)$/s, en: (e) => `Invalid argument: ${e}` },
  { re: /^操作被拒绝: (.*)$/s, en: (e) => `Operation refused: ${e}` },
  { re: /^资源未找到: (.*)$/s, en: (e) => `Resource not found: ${e}` },
];

/**
 * 把后端返回的消息翻成当前语言。
 *
 * 中文界面原样返回；英文界面先查精确表，再按规则表匹配，都不中则回退原文。
 */
export function translateBackendMessage(message: string): string {
  if (!message || getLocale() === 'zh-CN') return message;

  const trimmed = message.trim();
  const exact = EXACT[trimmed];
  if (exact) return exact;

  for (const rule of RULES) {
    const m = trimmed.match(rule.re);
    if (m) return rule.en(...m.slice(1));
  }

  return message;
}
