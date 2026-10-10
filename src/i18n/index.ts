/**
 * 轻量国际化（i18n）。
 *
 * 设计取舍：**中文原文即词条**。
 *   - 源码里保留中文原文，用 `t('文章管理')` 包裹；
 *   - 英文环境下到 `locales/en-US.ts` 的字典里按中文原文查英文；
 *   - 查不到就原样返回中文（永不崩、永不显示 key）。
 *
 * 这样做的好处：中文是唯一表述源，无需维护 key 命名与两份文案结构；
 * 代价是改动文案时要同步字典的键。对本项目（中文优先、单人维护）是更划算的取舍。
 *
 * 语言解析规则（与 AppImage 目录的收录要求一致）：
 *   1. 用户在「偏好设置 → 通用」里显式选择过 → 用该选择；
 *   2. 否则看系统语言（`navigator.languages` / `navigator.language`）：
 *      以 `zh` 开头 → 中文；**其余一切（含 en、C、空值）→ 英文**。
 *   在 Tauri 里 webview 的 `navigator.language` 跟随系统 LANG / LC_* / OS 区域设置，
 *   因此「非中文环境默认英文」这一约定天然成立。
 */

import { useCallback } from 'react';
import { create } from 'zustand';
import dayjs from 'dayjs';
import { EN_US } from './locales/en-US';

/** 支持的界面语言 */
export type Locale = 'zh-CN' | 'en-US';

/** 语言偏好：跟随系统 / 强制中文 / 强制英文 */
export type LocalePreference = 'system' | Locale;

/** 语言偏好持久化键 */
export const LOCALE_STORAGE_KEY = 'hexo-manager:locale';

/** 供外部判断用：当前是否中文 */
export function isZh(): boolean {
  return useLocaleStore.getState().locale === 'zh-CN';
}

/** 从浏览器/系统语言推断界面语言 */
export function detectSystemLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en-US';
  const candidates = [navigator.language, ...(navigator.languages ?? [])];
  for (const lang of candidates) {
    if (typeof lang === 'string' && lang.trim()) {
      return lang.trim().toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
    }
  }
  return 'en-US';
}

/** 读取持久化的语言偏好 */
function readStoredPreference(): LocalePreference {
  try {
    const value = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (value === 'zh-CN' || value === 'en-US' || value === 'system') return value;
  } catch {
    // localStorage 不可用时回退「跟随系统」
  }
  return 'system';
}

/** 把偏好解析为最终生效的语言 */
function resolveLocale(preference: LocalePreference): Locale {
  return preference === 'system' ? detectSystemLocale() : preference;
}

/** 语言切换后的副作用：dayjs 本地化、html lang、文档标题语言 */
function applySideEffects(locale: Locale): void {
  try {
    dayjs.locale(locale === 'zh-CN' ? 'zh-cn' : 'en');
  } catch {
    // dayjs locale 未注册时忽略
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

interface LocaleState {
  /** 用户偏好 */
  preference: LocalePreference;
  /** 最终生效的语言（由 preference 解析而来） */
  locale: Locale;
  /** 设置偏好：system / zh-CN / en-US */
  setPreference: (preference: LocalePreference) => void;
  /** 系统语言变化时重新解析（仅当偏好为 system） */
  syncFromSystem: () => void;
}

const initialPreference = readStoredPreference();

export const useLocaleStore = create<LocaleState>((set, get) => ({
  preference: initialPreference,
  locale: resolveLocale(initialPreference),

  setPreference(preference) {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, preference);
    } catch {
      // 忽略持久化失败
    }
    const locale = resolveLocale(preference);
    applySideEffects(locale);
    set({ preference, locale });
  },

  syncFromSystem() {
    if (get().preference !== 'system') return;
    const locale = detectSystemLocale();
    if (locale === get().locale) return;
    applySideEffects(locale);
    set({ locale });
  },
}));

// 首次加载即应用一次副作用，避免首屏 lang / dayjs 与界面语言不一致
applySideEffects(useLocaleStore.getState().locale);

if (typeof window !== 'undefined') {
  // 系统语言变化（如切换区域设置）时，跟随系统者需要实时更新
  window.addEventListener('languagechange', () => {
    useLocaleStore.getState().syncFromSystem();
  });
}

/** 参数插值：`t('共 {count} 篇', { count: 3 })` */
function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? match : String(value);
  });
}

/** 按指定语言取词（`t` 与 `useI18n().t` 共用，保证两者语义完全一致） */
function translateIn(
  locale: Locale,
  zh: string,
  params?: Record<string, string | number>,
): string {
  const raw = locale === 'zh-CN' ? zh : EN_US[zh] ?? zh;
  return interpolate(raw, params);
}

/**
 * 取词。中文环境下直接返回原文；英文环境下查字典，查不到回退原文。
 *
 * @param zh 中文原文（同时作为词条键）
 * @param params 可选插值参数，对应原文里的 `{name}` 占位符
 */
export function t(zh: string, params?: Record<string, string | number>): string {
  return translateIn(useLocaleStore.getState().locale, zh, params);
}

/**
 * React 取词钩子：订阅语言变化，切语言时组件会重渲染。
 *
 * 组件里请用这个而不是直接 import `t`，否则切换语言不会触发重渲染。
 *
 * 返回的 `t` 用 `useCallback` 按 `locale` 固化了函数身份（它内部就是
 * `translateIn(locale, …)`）。因此把它写进 `useMemo` / `useCallback` 的依赖数组
 * 既符合 `react-hooks/exhaustive-deps`（它是合法的局部依赖，不是外部作用域的值），
 * 又能在切换语言时真正触发重算。
 */
export function useI18n(): {
  t: typeof t;
  locale: Locale;
  preference: LocalePreference;
  setPreference: (preference: LocalePreference) => void;
} {
  const locale = useLocaleStore((s) => s.locale);
  const preference = useLocaleStore((s) => s.preference);
  const setPreference = useLocaleStore((s) => s.setPreference);
  const translate = useCallback<typeof t>(
    (zh, params) => translateIn(locale, zh, params),
    [locale],
  );
  return { t: translate, locale, preference, setPreference };
}

/** 当前语言（非响应式，供非组件代码使用） */
export function getLocale(): Locale {
  return useLocaleStore.getState().locale;
}

/** 语言选项（供偏好设置下拉使用） */
export const LOCALE_OPTIONS: { value: LocalePreference; label: string; hint: string }[] = [
  { value: 'system', label: '跟随系统', hint: '按系统语言自动选择（中文环境中文，其余英文）' },
  { value: 'zh-CN', label: '简体中文', hint: '始终使用中文界面' },
  { value: 'en-US', label: 'English', hint: 'Always use the English interface' },
];

export { EN_US };
