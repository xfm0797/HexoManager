/** 格式化工具 */

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import { getLocale } from '@/i18n';

dayjs.extend(relativeTime);
// dayjs 的当前语言由 src/i18n 统一切换，这里不再固定为中文

/** 格式化日期时间 */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : '—';
}

/** 格式化日期 */
export function formatDateOnly(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD') : '—';
}

/** 相对时间（如「3 分钟前」） */
export function formatRelative(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const d = dayjs(value);
  return d.isValid() ? d.fromNow() : '—';
}

/** 格式化文件大小 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / 1024 ** i;
  return `${size >= 100 || i === 0 ? Math.round(size) : size.toFixed(1)} ${units[i]}`;
}

/** 格式化大数字（如 12345 → 12,345） */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString(getLocale());
}

/** 格式化数字为紧凑形式（中文 12345 → 1.2万，英文 12345 → 12.3K） */
export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (getLocale() === 'zh-CN') {
    if (Math.abs(value) >= 100000000) return `${(value / 100000000).toFixed(1)}亿`;
    if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(1)}万`;
    return value.toLocaleString('zh-CN');
  }
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toLocaleString('en-US');
}

/** 格式化耗时（毫秒） */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return getLocale() === 'zh-CN' ? `${minutes} 分 ${seconds} 秒` : `${minutes}m ${seconds}s`;
}

/** 截断文本 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

/** 生成站点卡片渐变色（按名称哈希，保证同一站点颜色稳定） */
export function gradientFromString(input: string): [string, string] {
  const palettes: [string, string][] = [
    ['#3366ff', '#5b8cff'],
    ['#722ed1', '#9d5cf0'],
    ['#13c2c2', '#36e0d6'],
    ['#fa8c16', '#ffb84d'],
    ['#eb2f96', '#ff5cb3'],
    ['#52c41a', '#7ee63f'],
    ['#2f54eb', '#597ef7'],
    ['#fa541c', '#ff7a45'],
  ];

  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) % 100000;
  }

  return palettes[hash % palettes.length];
}

/** 生成首字母/汉字缩写（用于头像占位） */
export function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';

  // 中文取前两个字符
  if (/[\u4e00-\u9fff]/.test(trimmed)) {
    return trimmed.slice(0, 2);
  }

  // 英文取各单词首字母（最多两个）
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

/** 格式化 Git 提交哈希（短哈希） */
export function shortHash(hash: string | null | undefined, length = 7): string {
  if (!hash) return '—';
  return hash.slice(0, length);
}

/** 将数字百分比化 */
export function formatPercent(value: number, total: number, digits = 1): string {
  if (!total) return '0%';
  return `${((value / total) * 100).toFixed(digits)}%`;
}

/** 把 camelCase 转为可读标签 */
export function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

export { dayjs };
