/** 文件操作服务层 */

import { call, callSafe } from './invoke';
import type { FileInfo, FileTreeNode } from '@/types';

export const fileService = {
  /**
   * 读取文本文件。
   *
   * 后端默认只允许站点目录内的路径；`allowOutside` 仅用于用户在系统对话框里
   * 亲自选定的文件（导入配置等）。
   */
  read(path: string, allowOutside = false): Promise<string> {
    return call<string>('read_file', { path, allowOutside });
  },

  /** 写入文本文件（`allowOutside` 用于导出到用户选定的位置） */
  write(path: string, content: string, allowOutside = false): Promise<void> {
    return call<void>('write_file', { path, content, allowOutside });
  },

  /** 删除文件或空目录 */
  remove(path: string, allowOutside = false): Promise<void> {
    return call<void>('delete_file', { path, allowOutside });
  },

  /** 列出目录内容 */
  list(path: string, pattern?: string, allowOutside = false): Promise<FileInfo[]> {
    return call<FileInfo[]>('list_files', { path, pattern: pattern ?? null, allowOutside });
  },

  /** 创建目录 */
  mkdir(path: string, allowOutside = false): Promise<void> {
    return call<void>('create_directory', { path, allowOutside });
  },

  /** 检查路径是否存在 */
  exists(path: string): Promise<boolean> {
    return callSafe<boolean>('file_exists', { path }, false);
  },

  /** 获取文件树 */
  tree(path: string, maxDepth = 4, allowOutside = false): Promise<FileTreeNode> {
    return call<FileTreeNode>('get_file_tree', { path, maxDepth, allowOutside });
  },

  /** 在系统文件管理器中打开 */
  reveal(path: string): Promise<void> {
    return call<void>('open_in_explorer', { path });
  },

  /** 复制路径 */
  copy(from: string, to: string, allowOutside = false): Promise<void> {
    return call<void>('copy_path', { from, to, allowOutside });
  },

  /** 重命名/移动 */
  rename(from: string, to: string, allowOutside = false): Promise<void> {
    return call<void>('rename_path', { from, to, allowOutside });
  },

  /** 读取文件为 Base64 */
  readBase64(path: string, allowOutside = false): Promise<string> {
    return call<string>('read_file_base64', { path, allowOutside });
  },
};
