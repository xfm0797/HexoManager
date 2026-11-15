/**
 * 把后端错误翻译成当前界面语言。
 *
 * 后端所有命令都返回 `AppResult`，Tauri 2 会把实现了 `Serialize` 的错误原样交给
 * 前端，因此这里拿到的是对象 `{ code, message, params }`，翻译**只依赖 `code`**：
 *
 * 1. `errorCodes.ts` 里有该 code → 用它（语义码是逐句译文，通用码只翻前缀、
 *    用 `{detail}` 透传 OS / 第三方库的原文）；
 * 2. 查不到 → 返回中文原文（绝不吞信息），并在开发模式下告警。
 *
 * 旧方案按中文原文匹配，Rust 侧改一个字译文就静默消失；现在措辞随便改，
 * 只要 code 不动，译文就一直在。`npm run i18n:check` 负责拦截漏译的 code。
 */

import { getLocale } from './index';
import { translateErrorCode } from './errorCodes';

/** 后端错误的结构化载荷。 */
export interface BackendErrorPayload {
  code?: string;
  message: string;
  params?: Record<string, string>;
}

/**
 * 把 Tauri 的 rejection（字符串 / Error / 结构化对象）归一成载荷。
 *
 * 字符串形态只为兼容仍然 `Result<T, String>` 的少数内部函数（如启动期初始化），
 * 这类错误没有 code，只能原样显示中文。
 */
export function toBackendErrorPayload(error: unknown): BackendErrorPayload {
  if (typeof error === 'string') return { message: error };
  if (error instanceof Error) return { message: error.message };
  if (error && typeof error === 'object') {
    const rec = error as Record<string, unknown>;
    const message = typeof rec.message === 'string' ? rec.message : String(error);
    const code = typeof rec.code === 'string' && rec.code ? rec.code : undefined;
    const params =
      rec.params && typeof rec.params === 'object'
        ? (rec.params as Record<string, string>)
        : undefined;
    return { code, message, params };
  }
  return { message: String(error) };
}

/**
 * 翻译后端错误：code 优先，未收录回退中文原文。
 *
 * 中文界面直接返回 `message` —— 那是后端写的中文原文，比译文更贴近代码。
 */
export function translateBackendError(error: unknown): string {
  const payload = toBackendErrorPayload(error);
  if (getLocale() === 'zh-CN') return payload.message;

  if (payload.code) {
    const byCode = translateErrorCode(payload.code, payload.params);
    if (byCode) return byCode;
    // 漏译只在开发期暴露：生产环境宁可显示中文，也不要弹一个错误码给用户
    if (import.meta.env.DEV) {
      console.warn(`[i18n] 错误码缺少译文：${payload.code} → ${payload.message}`);
    }
  }

  return payload.message;
}
