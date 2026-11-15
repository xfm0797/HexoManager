/**
 * 后端**稳定错误码**的英文译文。
 *
 * 与 `backendMessages.ts` 的区别：
 * - 那边按**中文原文**匹配（措辞一改就静默失效，是过渡方案）；
 * - 这边按 Rust 侧 `AppError::coded("site.not_found", …)` 里的 **code** 匹配，
 *   改措辞、改参数顺序都不影响译文。
 *
 * 约定：
 * - key 由 Rust 侧决定，形如 `<模块>.<语义>`，全小写、点分隔；
 * - value 里的 `{name}` 是占位符，运行时用错误 payload 的 `params` 填充；
 * - 新增 code 时**必须**在这里补条目 —— `npm run i18n:check` 会扫描
 *   `src-tauri/src` 里的 `AppError::coded("…")` 与本文档比对，缺失即失败。
 *
 * 未收录的 code（例如只做了粗粒度迁移的通用变体）会回退到中文原文，
 * 再交给 `backendMessages.ts` 的旧映射层，因此这里漏写不会让界面漏中文。
 */
export const ERROR_CODES: Record<string, string> = {
  // ===== 站点 =====
  'site.not_found': 'Site {id} was not found',
  'site.path_empty': 'Site path cannot be empty',
  'site.path_taken': 'That path is already used by another site: {path}',
  'site.already_imported': 'That path has already been imported: {path}',
  'site.path_missing': 'The site directory does not exist: {path}',
  'site.dir_missing': 'The directory does not exist: {path}',
  'site.not_hexo': 'That directory is not a valid Hexo site: _config.yml is missing',
  'site.target_exists': 'The target path already exists: {path}',

  // ===== 文章 =====
  'article.not_found': 'Article {id} was not found',
  'article.file_missing': 'The file does not exist: {path}',
  'article.filename_invalid': 'Could not parse the file name',
  'article.reload_failed': 'Could not read the article after the operation',

  // ===== Git =====
  'git.show_failed': 'Failed to read the historical version: {commit}',
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
