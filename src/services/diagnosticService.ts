/** 诊断日志服务层 */

import { call } from './invoke';

export const diagnosticService = {
  /** 今天的日志文件路径（后端未初始化日志时为 null） */
  logPath(): Promise<string | null> {
    return call<string | null>('get_log_path');
  },

  /** 日志目录路径 */
  logDir(): Promise<string | null> {
    return call<string | null>('get_log_dir');
  },

  /** 把最近日志合并导出到指定位置，返回实际写入路径 */
  exportTo(target: string): Promise<string> {
    return call<string>('export_logs', { target });
  },
};
