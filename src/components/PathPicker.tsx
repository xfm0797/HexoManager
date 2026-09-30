/** 路径选择器：输入框 + 目录/文件选择按钮 */

import { Button, Input, Space } from 'antd';
import { FolderOpenOutlined, FileSearchOutlined } from '@ant-design/icons';
import type { InputProps } from 'antd';
import { pickDirectory, pickFile } from '@/utils/desktop';

interface PathPickerProps {
  value?: string;
  onChange?: (value: string) => void;
  /** 选择类型 */
  mode?: 'directory' | 'file';
  placeholder?: string;
  disabled?: boolean;
  /** 文件类型过滤（mode 为 file 时生效） */
  filters?: { name: string; extensions: string[] }[];
  /** 选择后回调（便于联动校验） */
  onPicked?: (path: string) => void;
  status?: InputProps['status'];
}

/**
 * 路径选择器。
 * 受控组件，可直接放在 Form.Item 中使用。
 */
export function PathPicker({
  value = '',
  onChange,
  mode = 'directory',
  placeholder = '请选择目录',
  disabled = false,
  filters,
  onPicked,
  status,
}: PathPickerProps) {
  const handlePick = async () => {
    const picked =
      mode === 'directory'
        ? await pickDirectory(placeholder)
        : await pickFile({ title: placeholder, filters });

    if (picked) {
      onChange?.(picked);
      onPicked?.(picked);
    }
  };

  return (
    <Space.Compact style={{ width: '100%' }}>
      <Input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        status={status}
        className="hm-mono"
        allowClear
      />
      <Button
        icon={mode === 'directory' ? <FolderOpenOutlined /> : <FileSearchOutlined />}
        onClick={handlePick}
        disabled={disabled}
      >
        选择
      </Button>
    </Space.Compact>
  );
}
