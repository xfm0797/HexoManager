/** Slug 与路径处理工具 */

/**
 * 由标题生成 URL 友好 slug。
 * 保留中文字符（Hexo 支持），英文转小写，空格与符号转连字符。
 */
export function slugify(title: string): string {
  let slug = '';
  let prevDash = false;

  for (const ch of title.trim()) {
    if (/[a-zA-Z0-9]/.test(ch)) {
      slug += ch.toLowerCase();
      prevDash = false;
    } else if (/[\u4e00-\u9fff]/.test(ch)) {
      slug += ch;
      prevDash = false;
    } else if (/[\s\-_]/.test(ch)) {
      if (!prevDash && slug.length > 0) {
        slug += '-';
        prevDash = true;
      }
    }
    // 其他符号（如 : / ? *）直接丢弃
  }

  return slug.replace(/^-+|-+$/g, '');
}

/** 确保文件名合法（移除各平台非法字符） */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 规范化路径分隔符为当前风格（展示用，统一为正斜杠） */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

/** 取路径最后一段 */
export function baseName(path: string): string {
  const normalized = normalizePath(path).replace(/\/+$/, '');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

/** 取路径最后一段（路径语义别名，便于区分「文件基名」与「目录名」） */
export const basenameOfPath = baseName;

/** 取路径的父目录 */
export function dirName(path: string): string {
  const normalized = normalizePath(path).replace(/\/+$/, '');
  const idx = normalized.lastIndexOf('/');
  return idx > 0 ? normalized.slice(0, idx) : normalized;
}

/** 取文件扩展名（小写，不含点） */
export function fileExtension(path: string): string {
  const name = baseName(path);
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : '';
}

/** 拼接路径 */
export function joinPath(...parts: string[]): string {
  return parts
    .filter((p) => p !== '')
    .map((p, i) => (i === 0 ? p.replace(/[/\\]+$/, '') : p.replace(/^[/\\]+|[/\\]+$/g, '')))
    .join('/');
}

/** 判断路径是否为 Markdown 文件 */
export function isMarkdownFile(path: string): boolean {
  return ['md', 'markdown', 'mkd'].includes(fileExtension(path));
}

/** 由文章文件名推断标题（去掉日期前缀与扩展名） */
export function titleFromFileName(fileName: string): string {
  let name = baseName(fileName).replace(/\.(md|markdown|mkd)$/i, '');
  // 去掉形如 2024-01-01- 的日期前缀
  name = name.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  return name || '未命名';
}

/**
 * 生成不会与已有文件名冲突的路径。
 */
export function uniqueFileName(desired: string, existing: Set<string>): string {
  if (!existing.has(desired)) return desired;

  const dotIdx = desired.lastIndexOf('.');
  const stem = dotIdx > 0 ? desired.slice(0, dotIdx) : desired;
  const ext = dotIdx > 0 ? desired.slice(dotIdx) : '';

  let counter = 1;
  let candidate = `${stem}-${counter}${ext}`;
  while (existing.has(candidate)) {
    counter += 1;
    candidate = `${stem}-${counter}${ext}`;
  }
  return candidate;
}

/** 计算相对路径（用于展示站点内文件位置） */
export function relativePath(fullPath: string, root: string): string {
  const normalizedFull = normalizePath(fullPath);
  const normalizedRoot = normalizePath(root).replace(/\/+$/, '');
  if (normalizedFull.startsWith(normalizedRoot)) {
    return normalizedFull.slice(normalizedRoot.length).replace(/^\/+/, '');
  }
  return normalizedFull;
}
