/** Tauri invoke 统一封装 */

import { invoke } from '@tauri-apps/api/core';
import { errorMessage } from '@/utils/validator';
import { toBackendErrorPayload, translateBackendError } from '@/i18n/backendMessages';

/** 同一条失败消息的重复上报间隔（毫秒），避免轮询类接口刷爆日志文件 */
const LOG_DEDUPE_MS = 5000;

const lastReported = new Map<string, number>();

/**
 * 把前端捕获的失败上报到后端日志。
 *
 * 桌面应用的用户报障往往只有一句「点了没反应」，把命令名与错误消息落到统一
 * 日志里，配合「导出诊断日志」就能还原现场。上报本身失败（或后端尚未就绪）
 * 一律忽略 —— 日志绝不能反过来影响主流程。
 */
function reportToLog(command: string, message: string): void {
  if (command === 'log_client_error') return;

  const key = `${command}\u0000${message}`;
  const now = Date.now();
  const last = lastReported.get(key);
  if (last !== undefined && now - last < LOG_DEDUPE_MS) return;
  lastReported.set(key, now);

  // 太多 key 时清一次，避免长跑进程里无限增长
  if (lastReported.size > 200) lastReported.clear();

  void invoke('log_client_error', { command, message }).catch(() => undefined);
}

/**
 * 调用 Tauri 后端命令。
 *
 * - 统一把 Rust 侧错误（字符串或 `{ code, message, params }` 结构）转为 Error 抛出
 * - 英文界面下按 code 取译文，未收录时退回中文原文的旧映射（见 `i18n/errorCodes.ts`）
 * - 失败同时写入后端日志（中文原文，不做翻译），便于事后排查
 */
export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const payload = toBackendErrorPayload(error);
    // 开发期保留原始日志，便于定位后端错误
    if (import.meta.env.DEV) {
      console.error(`[invoke:${command}]`, payload, args);
    }
    reportToLog(command, payload.code ? `[${payload.code}] ${payload.message}` : payload.message);
    throw new Error(translateBackendError(payload));
  }
}

/**
 * 带兜底值的安全调用：失败时返回兜底值而非抛错。
 *
 * **使用边界**（很容易被滥用，滥用后故障会伪装成"没有数据"）：
 * - 只用于**装饰类/可选**数据：市场列表、模板清单、更新设置、进程探测……
 *   这类数据拿不到时界面仍有意义，例如主题市场为空可以提示"没有搜索结果"。
 * - **查询类**主数据（文章列表、站点列表、配置、分类/标签、部署日志、文件列表）
 *   必须用 `call`，让错误进入页面的 `ErrorState`/`message.error`。否则后端失败
 *   时用户看到的是"暂无文章"，真正的错误被吞掉，也没人再去看日志。
 */
export async function callSafe<T>(
  command: string,
  args: Record<string, unknown> | undefined,
  fallback: T,
): Promise<T> {
  try {
    return await call<T>(command, args);
  } catch (error) {
    // 生产构建下也要留下痕迹：这类失败不会被界面呈现，只能靠日志排查
    console.warn(`[invoke:${command}] 调用失败，使用兜底值`, errorMessage(error));
    return fallback;
  }
}

/** 监听后端事件 */
export { listen } from '@tauri-apps/api/event';
