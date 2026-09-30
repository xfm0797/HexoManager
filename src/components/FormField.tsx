/** 表单字段包装：标签、提示、必填标记与错误信息 */

import { Form, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';

interface FieldLabelProps {
  label: string;
  tooltip?: string;
  required?: boolean;
}

/** 带提示图标的表单标签 */
export function FieldLabel({ label, tooltip, required }: FieldLabelProps) {
  return (
    <span className="inline-flex items-center gap-1">
      {required ? <span className="text-red-500">*</span> : null}
      <span>{label}</span>
      {tooltip ? (
        <Tooltip title={tooltip}>
          <InfoCircleOutlined className="text-xs opacity-50" />
        </Tooltip>
      ) : null}
    </span>
  );
}

interface FormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  /** 是否为子分组（更小的标题） */
  sub?: boolean;
}

/** 表单分组区块 */
export function FormSection({ title, description, children, sub = false }: FormSectionProps) {
  return (
    <section className={sub ? 'mb-4' : 'mb-6'}>
      <div className="mb-3">
        <h3 className={`m-0 font-semibold ${sub ? 'text-sm' : 'text-base'}`}>{title}</h3>
        {description ? <p className="mt-1 mb-0 text-xs hm-text-secondary">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

interface FormFieldProps {
  name: string | string[];
  label: string;
  tooltip?: string;
  required?: boolean;
  rules?: Parameters<typeof Form.Item>[0]['rules'];
  children: ReactNode;
  /** 占据整行（在栅格布局中） */
  fullWidth?: boolean;
  /** 附加说明文字（展示在控件下方） */
  help?: ReactNode;
  /** 值绑定字段名，Switch / Checkbox 场景传 "checked" */
  valuePropName?: string;
  /** 触发校验的事件名，Switch / Checkbox 场景传 "onChange" */
  trigger?: string;
}

/** 表单字段：整合标签、校验与帮助文案 */
export function FormField({
  name,
  label,
  tooltip,
  required,
  rules,
  children,
  fullWidth = false,
  help,
  valuePropName,
  trigger,
}: FormFieldProps) {
  const mergedRules = required
    ? [{ required: true, message: `请填写${label}` }, ...(rules ?? [])]
    : rules;

  return (
    <Form.Item
      name={name}
      label={<FieldLabel label={label} tooltip={tooltip} />}
      rules={mergedRules}
      className={fullWidth ? 'col-span-full' : ''}
      extra={help}
      valuePropName={valuePropName}
      trigger={trigger}
    >
      {children}
    </Form.Item>
  );
}

interface GridFieldsProps {
  children: ReactNode;
  columns?: number;
}

/** 表单字段两列/多列栅格容器 */
export function GridFields({ children, columns = 2 }: GridFieldsProps) {
  return (
    <div
      className="grid gap-x-4"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}
