/** 文件操作服务层 */

import { call, callSafe } from './invoke';
import type { FileInfo, FileTreeNode } from '@/types';

export const fileService = {
  /** 读取文本文件 */
  read(path: string): Promise<string> {
    return call<string>('read_file', { path });
  },

  /** 写入文本文件 */
  write(path: string, content: string): Promise<void> {
    return call<void>('write_file', { path, content });
  },

  /** 删除文件或空目录 */
  remove(path: string): Promise<void> {
    return call<void>('delete_file', { path });
  },

  /** 列出目录内容 */
  list(path: string, pattern?: string): Promise<FileInfo[]> {
    return callSafe<FileInfo[]>('list_files', { path, pattern: pattern ?? null }, []);
  },

  /** 创建目录 */
  mkdir(path: string): Promise<void> {
    return call<void>('create_directory', { path });
  },

  /** 检查路径是否存在 */
  exists(path: string): Promise<boolean> {
    return callSafe<boolean>('file_exists', { path }, false);
  },

  /** 获取文件树 */
  tree(path: string, maxDepth = 4): Promise<FileTreeNode> {
    return call<FileTreeNode>('get_file_tree', { path, maxDepth });
  },

  /** 在系统文件管理器中打开 */
  reveal(path: string): Promise<void> {
    return call<void>('open_in_explorer', { path });
  },

  /** 复制路径 */
  copy(from: string, to: string): Promise<void> {
    return call<void>('copy_path', { from, to });
  },

  /** 重命名/移动 */
  rename(from: string, to: string): Promise<void> {
    return call<void>('rename_path', { from, to });
  },

  /** 读取文件为 Base64 */
  readBase64(path: string): Promise<string> {
    return call<string>('read_file_base64', { path });
  },
};
