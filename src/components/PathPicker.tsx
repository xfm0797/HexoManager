/** 路径选择器：输入框 + 目录/文件选择按钮 */

import { Button, Input, Space } from 'antd';
import { FolderOpenOutlined, FileSearchOutlined } from '@ant-design/icons';
import type { InputProps } from 'antd';
import { pickDirectory, pickFile } from '@/utils/desktop';
import { useI18n } from '@/i18n';

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
  placeholder,
  disabled = false,
  filters,
  onPicked,
  status,
}: PathPickerProps) {
  const { t } = useI18n();
  const hint = placeholder ?? t('请选择目录');

  const handlePick = async () => {
    const picked =
      mode === 'directory'
        ? await pickDirectory(hint)
        : await pickFile({ title: hint, filters });

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
        placeholder={hint}
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
        {t('选择')}
      </Button>
    </Space.Compact>
  );
}
