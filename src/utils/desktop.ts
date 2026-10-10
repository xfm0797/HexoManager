/** 桌面能力封装：目录/文件选择、外部打开、剪贴板 */

import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { open as openPath } from '@tauri-apps/plugin-shell';
import { t } from '@/i18n';

/**
 * 原生对话框标题取词。
 *
 * 调用方可能传中文原文（如 `'选择站点目录'`）也可能传已翻译过的文案，
 * 这里统一过一遍字典：中文环境原样返回，英文环境命中即翻译，未命中亦原样返回。
 */
function dialogTitle(title: string | undefined, fallback: string): string {
  return t(title ?? fallback);
}

/** 选择目录，返回绝对路径（取消时返回 null） */
export async function pickDirectory(title = '选择目录'): Promise<string | null> {
  const result = await openDialog({
    directory: true,
    multiple: false,
    title: dialogTitle(title, '选择目录'),
  });
  return typeof result === 'string' ? result : null;
}

/** 选择单个文件 */
export async function pickFile(options?: {
  title?: string;
  filters?: { name: string; extensions: string[] }[];
}): Promise<string | null> {
  const result = await openDialog({
    directory: false,
    multiple: false,
    title: dialogTitle(options?.title, '选择文件'),
    filters: options?.filters,
  });
  return typeof result === 'string' ? result : null;
}

/** 选择多个文件 */
export async function pickFiles(options?: {
  title?: string;
  filters?: { name: string; extensions: string[] }[];
}): Promise<string[]> {
  const result = await openDialog({
    directory: false,
    multiple: true,
    title: dialogTitle(options?.title, '选择文件'),
    filters: options?.filters,
  });
  if (Array.isArray(result)) return result;
  return typeof result === 'string' ? [result] : [];
}

/** 另存为，返回目标路径（取消时返回 null） */
export async function pickSavePath(options?: {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}): Promise<string | null> {
  const result = await saveDialog({
    title: dialogTitle(options?.title, '保存文件'),
    defaultPath: options?.defaultPath,
    filters: options?.filters,
  });
  return typeof result === 'string' ? result : null;
}

/** 用系统默认程序打开路径或链接 */
export async function openWithSystem(target: string): Promise<void> {
  await openPath(target);
}

/** 复制文本到剪贴板（带降级方案） */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 继续降级
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/** 从剪贴板读取文本 */
export async function readClipboard(): Promise<string> {
  try {
    return (await navigator.clipboard.readText()) ?? '';
  } catch {
    return '';
  }
}
