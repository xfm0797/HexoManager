/** 校验工具 */

/** URL 校验 */
export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Git 仓库地址校验（支持 HTTPS 与 SSH） */
export function isValidRepoUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  // HTTPS / HTTP
  if (isValidUrl(trimmed)) return true;

  // SSH: git@host:owner/repo.git
  return /^[\w.-]+@[\w.-]+:[\w./-]+$/.test(trimmed);
}

/** 域名校验 */
export function isValidDomain(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.includes('://') || trimmed.includes('/')) return false;

  const labels = trimmed.split('.');
  if (labels.length < 2) return false;

  return labels.every((label) => {
    if (!label || label.length > 63) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
    return /^[a-zA-Z0-9-]+$/.test(label);
  });
}

/** 站点名称校验 */
export function validateSiteName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return '请输入站点名称';
  if (trimmed.length > 60) return '站点名称不能超过 60 个字符';
  return null;
}

/** 路径校验（绝对路径） */
export function validateAbsolutePath(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return '请选择站点目录';

  const isWindows = /^[a-zA-Z]:[\\/]/.test(trimmed);
  const isUnix = trimmed.startsWith('/');
  const isUnc = trimmed.startsWith('\\\\');

  if (!isWindows && !isUnix && !isUnc) {
    return '请填写绝对路径（如 /Users/name/blog 或 D:\\blog）';
  }
  return null;
}

/** 节点版本校验 */
export function validateNodeVersion(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'system') return null;
  if (!/^\d+(\.\d+){0,2}$/.test(trimmed)) {
    return 'Node 版本格式应为 20 或 20.11.0';
  }
  return null;
}

/** 环境变量键名校验 */
export function validateEnvKey(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
    return '变量名只能包含字母、数字与下划线，且不能以数字开头';
  }
  return null;
}

/** 提交信息校验 */
export function validateCommitMessage(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return '请输入提交信息';
  if (trimmed.length > 200) return '提交信息不能超过 200 个字符';
  return null;
}

/** 端口校验 */
export function validatePort(value: number | string): string | null {
  const port = Number(value);
  if (!Number.isInteger(port)) return '端口必须为整数';
  if (port < 1024) return '建议使用 1024 以上的端口';
  if (port > 65535) return '端口不能超过 65535';
  return null;
}

/** 通用必填校验 */
export function required(value: unknown, label = '此项'): string | null {
  if (value === null || value === undefined) return `${label}不能为空`;
  if (typeof value === 'string' && !value.trim()) return `${label}不能为空`;
  if (Array.isArray(value) && value.length === 0) return `${label}不能为空`;
  return null;
}

/** 长度校验 */
export function maxLength(value: string, max: number, label = '内容'): string | null {
  if (value.length > max) return `${label}不能超过 ${max} 个字符`;
  return null;
}

/** 组合多个校验器，返回第一个错误 */
export function runValidators(
  value: unknown,
  validators: ((v: unknown) => string | null)[],
): string | null {
  for (const validate of validators) {
    const error = validate(value);
    if (error) return error;
  }
  return null;
}

/** 提取错误信息为可读文本 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}
