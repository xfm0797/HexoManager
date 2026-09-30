/** 标签编辑器：自由输入 + 分类选择 */

import { Select, Tag } from 'antd';
import type { SelectProps } from 'antd';

interface TagInputProps {
  value?: string[];
  onChange?: (value: string[]) => void;
  /** 已存在的可选项 */
  options?: { name: string; count?: number }[];
  placeholder?: string;
  /** 最多可选数量 */
  maxCount?: number;
  /** 标签颜色 */
  color?: string;
  disabled?: boolean;
  /** 是否限制为单选（分类场景） */
  single?: boolean;
  status?: SelectProps['status'];
}

/**
 * 标签编辑器。
 * 支持从已有选项中挑选，也支持输入新标签后回车创建。
 */
export function TagInput({
  value = [],
  onChange,
  options = [],
  placeholder = '输入后回车创建',
  maxCount,
  color = 'blue',
  disabled = false,
  single = false,
  status,
}: TagInputProps) {
  const selectOptions = options.map((item) => ({
    label:
      item.count !== undefined ? (
        <span className="flex items-center justify-between gap-3">
          <span>{item.name}</span>
          <span className="text-xs opacity-60">{item.count}</span>
        </span>
      ) : (
        item.name
      ),
    value: item.name,
  }));

  const handleChange = (next: string[]) => {
    if (maxCount !== undefined && next.length > maxCount) {
      onChange?.(next.slice(0, maxCount));
      return;
    }
    onChange?.(next);
  };

  return (
    <Select
      mode={single ? undefined : 'tags'}
      value={single ? (value[0] as unknown as string) : value}
      onChange={(next) => handleChange(Array.isArray(next) ? next : next ? [next] : [])}
      options={selectOptions}
      placeholder={placeholder}
      disabled={disabled}
      status={status}
      style={{ width: '100%' }}
      allowClear
      showSearch
      optionFilterProp="value"
      maxTagCount="responsive"
      tagRender={
        single
          ? undefined
          : (props) => {
              const { label, closable, onClose } = props;
              return (
                <Tag
                  color={color}
                  closable={closable}
                  onClose={onClose}
                  style={{ marginInlineEnd: 4 }}
                >
                  {label}
                </Tag>
              );
            }
      }
    />
  );
}

interface TagListProps {
  values: string[];
  color?: string;
  /** 最多显示数量，超出显示 +N */
  max?: number;
  onClick?: (value: string) => void;
  size?: 'small' | 'default';
}

/** 只读标签列表 */
export function TagList({ values, color = 'blue', max, onClick, size = 'small' }: TagListProps) {
  if (values.length === 0) return <span className="hm-text-secondary">—</span>;

  const visible = max !== undefined ? values.slice(0, max) : values;
  const rest = max !== undefined ? values.length - max : 0;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {visible.map((value) => (
        <Tag
          key={value}
          color={color}
          className={onClick ? 'cursor-pointer' : ''}
          style={{ marginInlineEnd: 0, fontSize: size === 'small' ? 12 : 14 }}
          onClick={() => onClick?.(value)}
        >
          {value}
        </Tag>
      ))}
      {rest > 0 ? <Tag style={{ marginInlineEnd: 0, fontSize: 12 }}>+{rest}</Tag> : null}
    </span>
  );
}
