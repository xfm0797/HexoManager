/** 错误状态展示 */

import { Button, Result } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

interface ErrorStateProps {
  /** 错误信息 */
  message: string;
  /** 标题 */
  title?: string;
  /** 重试回调 */
  onRetry?: () => void;
  /** 额外操作 */
  extra?: React.ReactNode;
  /** 紧凑模式 */
  compact?: boolean;
}

/** 错误提示块，用于接口调用失败的就地展示 */
export function ErrorState({
  message,
  title = '出错了',
  onRetry,
  extra,
  compact = false,
}: ErrorStateProps) {
  if (compact) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
        <div className="font-medium">{title}</div>
        <div className="mt-1 break-all">{message}</div>
        {onRetry ? (
          <Button className="mt-2" size="small" icon={<ReloadOutlined />} onClick={onRetry}>
            重试
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <Result
      status="warning"
      title={title}
      subTitle={<span className="break-all">{message}</span>}
      extra={
        <div className="flex items-center justify-center gap-2">
          {onRetry ? (
            <Button type="primary" icon={<ReloadOutlined />} onClick={onRetry}>
              重试
            </Button>
          ) : null}
          {extra}
        </div>
      }
    />
  );
}
