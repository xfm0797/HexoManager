/** 环境变量编辑器 */

import { Button, Input, Space, Switch, Tooltip } from 'antd';
import { DeleteOutlined, LockOutlined, PlusOutlined, UnlockOutlined } from '@ant-design/icons';
import type { EnvVar } from '@/types';
import { validateEnvKey } from '@/utils/validator';
import { FieldLabel } from './FormField';

interface EnvVarEditorProps {
  value?: EnvVar[];
  onChange?: (value: EnvVar[]) => void;
  disabled?: boolean;
  /** 是否允许标记为密钥（默认允许） */
  allowSecret?: boolean;
}

/**
 * 环境变量键值对编辑器。
 * 支持标记密钥（展示为密码框）与键名合法性校验。
 */
export function EnvVarEditor({
  value = [],
  onChange,
  disabled = false,
  allowSecret = true,
}: EnvVarEditorProps) {
  const update = (index: number, patch: Partial<EnvVar>) => {
    const next = value.map((item, i) => (i === index ? { ...item, ...patch } : item));
    onChange?.(next);
  };

  const remove = (index: number) => {
    onChange?.(value.filter((_, i) => i !== index));
  };

  const append = () => {
    onChange?.([...value, { key: '', value: '', secret: false }]);
  };

  return (
    <div className="w-full">
      {value.length === 0 ? (
        <div
          className="mb-2 rounded-lg border border-dashed px-3 py-4 text-center text-sm hm-text-secondary"
          style={{ borderColor: 'var(--hm-border)' }}
        >
          暂无环境变量，点击下方按钮添加
        </div>
      ) : (
        <div className="mb-2 space-y-2">
          {value.map((item, index) => {
            const keyError = validateEnvKey(item.key);
            return (
              <div key={index} className="flex items-start gap-2">
                <div className="w-[38%]">
                  <Input
                    value={item.key}
                    onChange={(e) => update(index, { key: e.target.value })}
                    placeholder="变量名，如 ACCESS_TOKEN"
                    disabled={disabled}
                    status={keyError ? 'error' : undefined}
                    className="hm-mono"
                  />
                  {keyError ? <div className="mt-1 text-xs text-red-500">{keyError}</div> : null}
                </div>

                <Input
                  value={item.value}
                  onChange={(e) => update(index, { value: e.target.value })}
                  placeholder="变量值"
                  disabled={disabled}
                  className="hm-mono flex-1"
                  type={item.secret ? 'password' : 'text'}
                />

                {allowSecret ? (
                  <Tooltip title={item.secret ? '已标记为密钥' : '标记为密钥（隐藏展示）'}>
                    <Button
                      type="text"
                      icon={item.secret ? <LockOutlined /> : <UnlockOutlined />}
                      onClick={() => update(index, { secret: !item.secret })}
                      disabled={disabled}
                    />
                  </Tooltip>
                ) : null}

                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => remove(index)}
                  disabled={disabled}
                />
              </div>
            );
          })}
        </div>
      )}

      <Button type="dashed" icon={<PlusOutlined />} onClick={append} disabled={disabled} block>
        添加环境变量
      </Button>
    </div>
  );
}

interface EnvVarLabelProps {
  required?: boolean;
}

/** 环境变量字段标签（供表单复用） */
export function EnvVarLabel({ required }: EnvVarLabelProps) {
  return (
    <FieldLabel
      label="环境变量"
      required={required}
      tooltip="部署时注入的环境变量，如 Node 版本、部署 Token。标记为密钥的变量在界面中以密文展示"
    />
  );
}

/** 只读环境变量展示（如配置预览） */
export function EnvVarList({ value = [] }: { value?: EnvVar[] }) {
  if (value.length === 0) {
    return <span className="hm-text-secondary">未配置环境变量</span>;
  }

  return (
    <Space direction="vertical" size={4} className="w-full">
      {value.map((item, index) => (
        <div key={index} className="flex items-center gap-2 text-xs">
          <span className="hm-mono font-medium">{item.key}</span>
          <span className="hm-text-secondary">=</span>
          <span className="hm-mono hm-text-secondary break-all">
            {item.secret ? '••••••••' : item.value}
          </span>
        </div>
      ))}
    </Space>
  );
}

/** 启用 / 停用开关（复用统一样式） */
export function FeatureSwitch({
  checked,
  onChange,
  disabled,
  checkedChildren = '启用',
  unCheckedChildren = '停用',
}: {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  checkedChildren?: string;
  unCheckedChildren?: string;
}) {
  return (
    <Switch
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      checkedChildren={checkedChildren}
      unCheckedChildren={unCheckedChildren}
    />
  );
}
