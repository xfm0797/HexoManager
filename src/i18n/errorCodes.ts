/**
 * 后端**稳定错误码**的英文译文 —— 前端唯一的后端错误翻译来源。
 *
 * 后端所有命令都返回 `AppResult`，Tauri 把错误序列化成 `{ code, message, params }`：
 * - `code` 由 Rust 侧 `AppError::coded("<模块>.<语义>", …)` 决定，**与中文措辞无关**，
 *   所以改文案不会让译文静默失效（这是旧的「按中文原文匹配」方案最大的坑）；
 * - `params` 填译文里的 `{name}` 占位符；
 * - `message` 是中文原文，只用于日志与「查不到译文」时的兜底。
 *
 * 两类条目：
 * 1. **语义码** —— 形如 `<模块>.<语义>`，一条对应一种具体失败。
 *    `npm run i18n:check` 会静态比对本表与 Rust 源码里的 `AppError::coded("…")`。
 * 2. **通用码** —— 不带点号，对应 `AppError` 的粗粒度变体（IO / JSON / 子进程 …）。
 *    这类错误的正文来自操作系统或第三方库，**本来就翻不了**，所以模板里统一用
 *    `{detail}` 原样透传，只翻译我们自己加的那层前缀。
 */

export const ERROR_CODES: Record<string, string> = {
  // ==================== 通用码（AppError 粗粒度变体） ====================
  // Rust 侧 `AppError::params()` 为这些变体填 `{ detail }`。
  'io': 'I/O error: {detail}',
  'db': 'Database error: {detail}',
  'json': 'JSON parse error: {detail}',
  'yaml': 'YAML parse error: {detail}',
  'template': 'Template rendering error: {detail}',
  'network': 'Network error: {detail}',
  'process': 'Command failed: {detail}',
  'path_not_found': 'Path not found: {detail}',
  'invalid_argument': 'Invalid argument: {detail}',
  'not_found': 'Not found: {detail}',
  'forbidden': 'Operation refused: {detail}',
  /** 兜底变体：没有语义，`message` 就是正文。别往这里塞新用法。 */
  'other': '{detail}',

  // ==================== 站点 ====================
  'site.not_found': 'Site {id} was not found',
  'site.path_empty': 'Site path cannot be empty',
  'site.path_taken': 'That path is already used by another site: {path}',
  'site.already_imported': 'That path has already been imported: {path}',
  'site.path_missing': 'The site directory does not exist: {path}',
  'site.dir_missing': 'The directory does not exist: {path}',
  'site.not_hexo': 'That directory is not a valid Hexo site: _config.yml is missing',
  'site.target_exists': 'The target path already exists: {path}',
  'site.dir_remove_failed':
    'Failed to move the site directory aside (nothing was lost): {detail}',

  // ==================== 文章 ====================
  'article.not_found': 'Article {id} was not found',
  'article.file_missing': 'The file does not exist: {path}',
  'article.filename_invalid': 'Could not parse the file name',
  'article.reload_failed': 'Could not read the article after the operation',
  'article.new_record_unreadable': 'The new article was written but its record could not be read: {path}',
  'article.new_record_read_failed': 'Failed to read the new article record: {detail}',
  'article.scan_failed': 'Failed to scan the articles on disk: {detail}',
  'article.source_cleanup_failed':
    'Wrote {to}, but failed to remove the source file {from}: {detail}',

  // ==================== 模板 ====================
  'template.not_found': 'Template {id} was not found',
  'template.name_empty': 'The template name cannot be empty',
  'template.name_taken': 'A template named “{name}” already exists — please pick another name',
  'template.fields_not_object': 'Template fields must be a YAML object (key/value pairs)',
  'template.builtin_undeletable':
    'Built-in templates cannot be deleted — edit one or save it as a new template',

  // ==================== 主题 ====================
  'theme.not_found': 'Theme “{name}” was not found',
  'theme.not_installed': 'Theme “{name}” is not installed',
  'theme.exists': 'Theme “{name}” already exists',
  'theme.in_use': 'Theme “{name}” is currently in use — switch to another theme first',
  'theme.clone_failed': 'Failed to clone the theme: {detail}',
  'theme.npm_install_failed': 'npm failed to install the theme: {detail}',
  'theme.npm_missing':
    'npm finished but the theme “{name}” was not found in node_modules — check the package name',
  'theme.uninstall_failed': 'Failed to uninstall the theme: {detail}',
  'theme.update_failed':
    'Failed to update the theme; it is neither a Git repository nor updatable via npm:\n{detail}',
  'theme.config_read_failed': 'Failed to read the theme config ({path}): {detail}',
  'theme.config_parse_failed': 'Failed to parse the theme config ({path}): {detail}',
  'theme.config_dir_missing': 'Theme directory not found: {path}. Installed themes: {list}.',
  'theme.config_dir_missing_any':
    'Theme directory not found: {path}. This site has no theme installed yet — install one under Themes first.',
  'theme.config_dir_empty':
    'The theme “{name}” directory is empty; the theme may be incomplete ({path}).',
  'theme.config_no_config':
    'No _config.yml was found in the theme “{name}” directory (contents: {detail}).',
  'theme.demo_missing': 'No demo link was found in the theme documentation',

  // ==================== 文件与路径 ====================
  'path.empty': 'The path cannot be empty',
  'path.root_forbidden': 'Refusing to operate on a filesystem root for safety: {path}',
  'path.outside_site':
    'That path is outside every site directory, so the operation was refused: {path}',
  'file.not_found': 'File not found: {path}',
  'file.is_dir': 'That path is a directory and cannot be read as a file: {path}',
  'file.not_a_dir': 'That path is not a directory: {path}',
  'file.dir_not_found': 'Directory not found: {path}',
  'file.path_missing': 'Path not found: {path}',
  'file.src_missing': 'Source path not found: {path}',
  'file.read_failed': 'Failed to read the file: {detail}',
  'file.write_failed': 'Failed to write the file: {detail}',
  'file.remove_failed': 'Failed to delete the file: {detail}',
  'file.copy_failed': 'Failed to copy the file: {detail}',
  'file.rename_failed': 'Failed to rename the path: {detail}',
  'file.dir_create_failed': 'Failed to create the directory: {detail}',
  'file.dir_remove_failed': 'Failed to delete the directory (it may not be empty): {detail}',
  'file.dir_read_failed': 'Failed to read the directory: {detail}',
  'file.dir_open_failed': 'Failed to open the directory: {detail}',

  // ==================== 配置 ====================
  'config.payload_missing': 'Either config or raw must be provided',
  'config.json_invalid': 'Invalid JSON: {detail}',
  'config.toml_unsupported':
    'TOML validation is not built in — please verify the format before saving',
  'config.backup_missing': 'There is no configuration backup to restore',
  'config.restore_failed': 'Failed to restore the configuration: {detail}',
  'config.import_parse_failed': 'Failed to parse the imported content: {detail}',
  'config.plugin_install_failed': 'Failed to install the plugin:\n{detail}',
  'config.plugin_uninstall_failed': 'Failed to uninstall the plugin:\n{detail}',
  'config.theme_field_unwritable':
    'The site configuration file is malformed; the theme field cannot be written',
  'config.yaml_parse_failed': 'YAML parse error: {detail} (original: {original})',

  // ==================== 预览服务与子进程 ====================
  'preview.port_in_use': 'Port {port} is already in use — please pick another',
  'preview.spawn_failed': 'Failed to start the preview server: {detail}',
  'preview.listen_timeout':
    'The preview server did not listen on port {port} in time. Recent output:\n{detail}',
  'preview.listen_timeout_no_output':
    "The preview server did not listen on port {port} and printed nothing — check that the site's dependencies are installed (npm install)",
  'preview.kill_failed': 'Failed to terminate process {pid}',
  'preview.kill_unsupported': 'Stopping processes is not supported on this platform',
  'proc.timeout': 'Command `{cmd}` timed out after {secs}s',
  'proc.stdout_missing': 'Could not capture stdout of the child process',
  'proc.stderr_missing': 'Could not capture stderr of the child process',
  'proc.join_failed': 'The background task terminated unexpectedly: {detail}',

  // ==================== Hexo ====================
  'hexo.dir_not_empty': 'The target directory is not empty; the site cannot be initialised: {path}',
  'hexo.init_failed': 'Hexo initialisation failed:\n{detail}\n--- fallback ---\n{fallback}',
  'hexo.deps_install_failed': 'Failed to install dependencies:\n{detail}',

  // ==================== Git ====================
  'git.show_failed': 'Failed to read the historical version: {commit}',
  'git.commit_read_failed': 'The commit succeeded but its record could not be read',
  'git.empty_message': 'The commit message cannot be empty',
  'git.nothing_to_commit': 'There is nothing to commit',

  // ==================== 部署 ====================
  'deploy.webhook_client_failed': 'Failed to create the HTTP client: {detail}',
  'deploy.webhook_failed': 'Webhook request failed: {detail}',
  'deploy.webhook_status': 'Webhook returned status {status}: {detail}',
  'deploy.domain_empty': 'The domain cannot be empty',
  'deploy.domain_bare':
    'Enter a bare domain without protocol or path (e.g. blog.example.com)',
  'deploy.domain_need_dot': 'Invalid domain: it must contain at least one dot',
  'deploy.domain_empty_label': 'Invalid domain: it contains an empty label',
  'deploy.domain_label_long': 'Invalid domain: the label `{label}` exceeds 63 characters',
  'deploy.domain_label_char': 'Invalid domain: the label `{label}` contains illegal characters',
  'deploy.domain_label_hyphen':
    'Invalid domain: the label `{label}` cannot start or end with a hyphen',
  'deploy.template_register_failed': 'Failed to register template {id}: {detail}',
  'deploy.template_render_failed': 'Failed to render template {id}: {detail}',

  // ==================== 更新 ====================
  'update.manifest_request_failed': 'Failed to fetch the update manifest ({url}): {detail}',
  'update.manifest_parse_failed': 'Failed to parse the update manifest ({url}): {detail}',
  'update.source_status': 'The update source returned status {status} ({url})',
  'update.download_failed': 'Download failed: {detail}',
  'update.download_status': 'Download failed with status {status}',
  'update.download_read_failed': 'Failed to read the downloaded content: {detail}',
  'update.pubkey_invalid': 'The update public key is invalid: {detail}',
  'update.signature_malformed': 'The update signature is malformed: {detail}',
  'update.package_read_failed': 'Failed to read the update package ({path}): {detail}',
  'update.signature_mismatch':
    'The update package failed signature verification; installation was aborted: {detail}',
  'update.signature_unavailable':
    'Could not verify the update package (the manifest has no signature, or the local public key is missing), so installation was aborted. Please download the installer from the GitHub Releases page instead.',
  'update.install_unsupported': 'Automatic installation is not supported on this platform',

  // ==================== 数据库 / 链接 ====================
  'db.lock_corrupted': 'The database connection lock is corrupted',
  'db.site_path_read_failed': 'Failed to read the site path: {detail}',
  'link.unsupported_scheme': 'Only http/https links can be opened',
  'link.open_failed': 'Failed to open the link: {detail}',
};

/** 占位符形态：`{name}`；不做嵌套与函数式替换，保持可静态检查。 */
export function fillParams(template: string, params?: Record<string, string>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? params[name] : whole,
  );
}

/**
 * 按错误码取译文；未收录返回 `null`，交给调用方回退。
 *
 * `params` 里缺某个占位符时保留 `{name}` 原样 —— 宁可露出占位符，
 * 也不要静默删掉一段话（后者会让人以为后端没返回参数）。
 */
export function translateErrorCode(
  code: string,
  params?: Record<string, string>,
): string | null {
  const template = ERROR_CODES[code];
  return template ? fillParams(template, params) : null;
}
