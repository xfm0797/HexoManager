/** YAML 处理工具 */

import yaml from 'js-yaml';

/**
 * 解析 YAML 文本为对象。
 * 失败时返回错误信息而非抛异常，便于表单中就地提示。
 */
export function parseYaml<T = Record<string, unknown>>(
  text: string,
): { data: T | null; error: string | null } {
  try {
    const data = yaml.load(text) as T;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 将对象序列化为 YAML 文本 */
export function stringifyYaml(data: unknown, options?: yaml.DumpOptions): string {
  try {
    return yaml.dump(data, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false,
      ...options,
    });
  } catch (e) {
    return `# YAML 序列化失败：${e instanceof Error ? e.message : String(e)}`;
  }
}

/** 校验 YAML 合法性 */
export function validateYaml(text: string): string | null {
  const { error } = parseYaml(text);
  return error;
}

/**
 * 深层合并 YAML 对象（用于配置模板填充）。
 * 仅合并普通对象，数组与原始值直接覆盖。
 */
export function mergeDeep<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result: Record<string, unknown> = { ...target };

  for (const [key, value] of Object.entries(source)) {
    const existing = result[key];

    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existing !== null &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      result[key] = mergeDeep(
        existing as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else if (value !== undefined) {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * 提取配置中的关键信息（用于站点卡片与列表展示）。
 */
export function extractSiteInfo(config: Record<string, unknown>): {
  title: string;
  subtitle: string;
  url: string;
  theme: string;
  author: string;
} {
  return {
    title: String(config.title ?? ''),
    subtitle: String(config.subtitle ?? ''),
    url: String(config.url ?? ''),
    theme: String(config.theme ?? 'landscape'),
    author: String(config.author ?? ''),
  };
}

/**
 * 将扁平的 `a.b.c` 键路径写入嵌套对象。
 */
export function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let cursor: Record<string, unknown> = obj;

  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    if (typeof cursor[key] !== 'object' || cursor[key] === null) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }

  cursor[keys[keys.length - 1]] = value;
}

/**
 * 按 `a.b.c` 键路径读取嵌套值。
 */
export function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}
