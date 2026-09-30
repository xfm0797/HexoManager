/** Tauri invoke 统一封装 */

import { invoke } from '@tauri-apps/api/core';
import { errorMessage } from '@/utils/validator';

/**
 * 调用 Tauri 后端命令。
 *
 * - 统一把 Rust 侧错误字符串转为 Error 抛出
 * - 便于全局错误处理与调试
 */
export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const message = errorMessage(error);
    // 开发期保留原始日志，便于定位后端错误
    if (import.meta.env.DEV) {
      console.error(`[invoke:${command}]`, message, args);
    }
    throw new Error(message);
  }
}

/** 带默认值的安全调用：失败时返回兜底值而非抛错 */
export async function callSafe<T>(
  command: string,
  args: Record<string, unknown> | undefined,
  fallback: T,
): Promise<T> {
  try {
    return await call<T>(command, args);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(`[invoke:${command}] 调用失败，使用兜底值`, errorMessage(error));
    }
    return fallback;
  }
}

/** 监听后端事件 */
export { listen } from '@tauri-apps/api/event';
