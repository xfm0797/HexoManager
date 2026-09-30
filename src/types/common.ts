/** 通用类型与工具类型 */

/** 异步请求状态 */
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

/** 通用 API 响应包装（后端直接返回数据或抛错，此处用于前端统一处理） */
export type InvokeResult<T> = Promise<T>;

/** 键值对 */
export interface KeyValue<T = string> {
  key: string;
  value: T;
}

/** 选项 */
export interface Option<T = string> {
  label: string;
  value: T;
  description?: string;
  disabled?: boolean;
}

/** 分页参数 */
export interface Pagination {
  page: number;
  limit: number;
  total: number;
}

/** 排序方向 */
export type SortOrder = 'asc' | 'desc';

/** 主题模式 */
export type ThemeMode = 'light' | 'dark' | 'system';

/** 消息类型 */
export type MessageType = 'success' | 'error' | 'warning' | 'info';

/** 通知消息 */
export interface AppNotification {
  id: string;
  type: MessageType;
  title: string;
  description?: string;
  createdAt: number;
  read?: boolean;
}

/** 空状态类型 */
export type EmptyStateKind = 'sites' | 'articles' | 'themes' | 'logs' | 'search' | 'files';
