/** Front Matter 模板管理面板：列表 + 编辑器（表格 / YAML 双模式） */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import {
  Alert,
  App as AntdApp,
  AutoComplete,
  Button,
  Card,
  Empty,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
} from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import yaml from 'js-yaml';
import { EmptyState } from './EmptyState';
import { TagInput } from './TagInput';
import { useTemplateStore } from '@/stores';
import { FRONT_MATTER_FIELD_PRESETS, TEMPLATE_BODY_PLACEHOLDERS } from '@/constants';
import type { FrontMatterTemplate } from '@/types';

type FieldType = 'text' | 'number' | 'boolean' | 'list' | 'json';
type EditorMode = 'table' | 'yaml';

/** 字段编辑行 */
interface FieldRow {
  uid: string;
  key: string;
  type: FieldType;
  /** text/json 用 string，number 用 number，boolean 用 boolean，list 用 string[] */
  value: string | number | boolean | string[];
}

let uidSeed = 0;
const nextUid = () => `f${(uidSeed += 1)}`;

/** 猜测某个字段值对应的编辑器类型 */
function detectType(value: unknown): FieldType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'text';
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return 'list';
  return 'json';
}

/** 把一个字段值转成编辑行 */
function toRow(key: string, value: unknown): FieldRow {
  const type = detectType(value);
  switch (type) {
    case 'boolean':
      return { uid: nextUid(), key, type, value: value as boolean };
    case 'number':
      return { uid: nextUid(), key, type, value: value as number };
    case 'list':
      return { uid: nextUid(), key, type, value: value as string[] };
    case 'json':
      return { uid: nextUid(), key, type, value: JSON.stringify(value, null, 2) };
    default:
      return { uid: nextUid(), key, type, value: value as string };
  }
}

/** 把模板字段对象拆成编辑行 */
function fieldsToRows(fields: Record<string, unknown>): FieldRow[] {
  return Object.entries(fields).map(([key, value]) => toRow(key, value));
}

/** 把编辑行组装回字段对象 */
function rowsToFields(rows: FieldRow[]): { fields: Record<string, unknown>; errors: string[] } {
  const fields: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    if (key in fields) errors.push(`字段名「${key}」重复，后一个会覆盖前一个`);

    switch (row.type) {
      case 'boolean':
        fields[key] = Boolean(row.value);
        break;
      case 'number': {
        const n = typeof row.value === 'number' ? row.value : Number(row.value);
        if (Number.isNaN(n)) {
          errors.push(`字段「${key}」需要是数字`);
          break;
        }
        fields[key] = n;
        break;
      }
      case 'list':
        fields[key] = (Array.isArray(row.value) ? row.value : []).filter(
          (v) => String(v).trim() !== '',
        );
        break;
      case 'json': {
        const raw = String(row.value ?? '').trim();
        if (!raw) break;
        try {
          fields[key] = JSON.parse(raw);
        } catch {
          errors.push(`字段「${key}」的 JSON 无法解析`);
        }
        break;
      }
      default: {
        const text = String(row.value ?? '');
        if (text.trim() === '') break;
        fields[key] = text;
      }
    }
  }

  return { fields, errors };
}

/** 生成预览用的 YAML 文本 */
function fieldsToYaml(fields: Record<string, unknown>): string {
  try {
    const text = yaml.dump(fields, { indent: 2, lineWidth: 120, noRefs: true });
    return text.trimEnd();
  } catch {
    return '# 当前字段无法序列化';
  }
}

/** 字段名候选：预设 + 当前模板已用的字段名 */
function keyOptions(rows: FieldRow[]) {
  const used = new Set(rows.map((r) => r.key));
  return FRONT_MATTER_FIELD_PRESETS.map((p) => ({
    value: p.name,
    label: `${p.name}（${used.has(p.name) ? '已用' : p.label}）`,
  }));
}

/** 编辑器初值 */
interface EditorState {
  id?: number;
  name: string;
  description: string;
  icon: string;
  mode: EditorMode;
  rows: FieldRow[];
  /** yaml 模式的文本 */
  yamlText: string;
  body: string;
  isBuiltin: boolean;
}

function emptyEditor(): EditorState {
  return {
    id: undefined,
    name: '',
    description: '',
    icon: '',
    mode: 'table',
    rows: [toRow('toc', true)],
    yamlText: '',
    body: '',
    isBuiltin: false,
  };
}

function editorFromTemplate(t: FrontMatterTemplate): EditorState {
  return {
    id: t.id,
    name: t.name,
    description: t.description ?? '',
    icon: t.icon ?? '',
    mode: 'table',
    rows: fieldsToRows(t.fields ?? {}),
    yamlText: fieldsToYaml(t.fields ?? {}),
    body: t.body ?? '',
    isBuiltin: t.isBuiltin,
  };
}

interface FrontMatterTemplatesPanelProps {
  /** 初始自动拉取模板列表 */
  autoLoad?: boolean;
}

/** 模板管理面板 */
export function FrontMatterTemplatesPanel({ autoLoad = true }: FrontMatterTemplatesPanelProps) {
  const { message } = AntdApp.useApp();
  const templates = useTemplateStore((s) => s.templates);
  const loading = useTemplateStore((s) => s.loading);
  const saving = useTemplateStore((s) => s.saving);
  const error = useTemplateStore((s) => s.error);
  const fetchTemplates = useTemplateStore((s) => s.fetchTemplates);
  const saveTemplate = useTemplateStore((s) => s.saveTemplate);
  const deleteTemplate = useTemplateStore((s) => s.deleteTemplate);
  const duplicateTemplate = useTemplateStore((s) => s.duplicateTemplate);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const bodyRef = useRef<ComponentRef<typeof Input.TextArea> | null>(null);

  useEffect(() => {
    if (autoLoad) void fetchTemplates();
  }, [autoLoad, fetchTemplates]);

  /** 当前编辑器产出的字段对象 + 错误 */
  const { fields, errors } = useMemo<{
    fields: Record<string, unknown>;
    errors: string[];
  }>(() => {
    if (editor.mode === 'yaml') {
      const raw = editor.yamlText.trim();
      if (!raw) return { fields: {}, errors: [] };
      try {
        const parsed = yaml.load(raw);
        if (parsed === null || parsed === undefined) return { fields: {}, errors: [] };
        if (typeof parsed !== 'object' || Array.isArray(parsed)) {
          return { fields: {}, errors: ['YAML 顶层必须是键值对（对象）'] };
        }
        return { fields: parsed as Record<string, unknown>, errors: [] };
      } catch (e) {
        return { fields: {}, errors: [`YAML 解析失败：${(e as Error).message}`] };
      }
    }
    return rowsToFields(editor.rows);
  }, [editor.mode, editor.rows, editor.yamlText]);

  const switchMode = (next: EditorMode) => {
    if (next === editor.mode) return;
    if (next === 'yaml') {
      setEditor((s) => ({ ...s, mode: 'yaml', yamlText: fieldsToYaml(rowsToFields(s.rows).fields) }));
      return;
    }
    // 从 YAML 切回表格：先校验，解析失败不放行
    if (errors.length > 0) {
      message.warning('当前 YAML 存在错误，修正后才能切换到表格模式');
      return;
    }
    setEditor((s) => ({ ...s, mode: 'table', rows: fieldsToRows(fields) }));
  };

  const patchRow = useCallback((uid: string, patch: Partial<FieldRow>) => {
    setEditor((s) => ({
      ...s,
      rows: s.rows.map((r) => (r.uid === uid ? { ...r, ...patch } : r)),
    }));
  }, []);

  const addRow = (preset?: (typeof FRONT_MATTER_FIELD_PRESETS)[number]) => {
    setEditor((s) => {
      const row = preset
        ? toRow(preset.name, preset.sample)
        : ({ uid: nextUid(), key: '', type: 'text', value: '' } as FieldRow);
      return { ...s, rows: [...s.rows, row] };
    });
  };

  const removeRow = (uid: string) => {
    setEditor((s) => ({ ...s, rows: s.rows.filter((r) => r.uid !== uid) }));
  };

  /** 在光标处插入占位符 */
  const insertPlaceholder = (token: string) => {
    const el = bodyRef.current?.resizableTextArea?.textArea ?? null;
    const current = editor.body;
    if (!el) {
      setEditor((s) => ({ ...s, body: `${current}${token}` }));
      return;
    }

    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? start;
    const next = `${current.slice(0, start)}${token}${current.slice(end)}`;
    setEditor((s) => ({ ...s, body: next }));

    // 光标落到插入内容之后，方便连续插入
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleSave = async () => {
    const name = editor.name.trim();
    if (!name) {
      message.warning('请填写模板名称');
      return;
    }
    if (errors.length > 0) {
      message.error(errors[0]);
      return;
    }

    try {
      await saveTemplate({
        id: editor.id,
        name,
        description: editor.description.trim() || undefined,
        icon: editor.icon.trim() || undefined,
        fields,
        body: editor.body.trim() || undefined,
      });
      message.success(editor.id ? '模板已更新' : '模板已创建');
      setEditorOpen(false);
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async (t: FrontMatterTemplate) => {
    try {
      await deleteTemplate(t.id);
      message.success(`模板「${t.name}」已删除`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDuplicate = async (t: FrontMatterTemplate) => {
    try {
      const created = await duplicateTemplate(t, `${t.name} 副本`);
      message.success(`已复制为「${created.name}」`);
      setEditor(editorFromTemplate(created));
      setEditorOpen(true);
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm hm-text-secondary">
          模板是全局的，所有站点共用。写新文章时选择模板即可一键写入常用字段与正文骨架。
        </div>
        <Space>
          <Tooltip title="重新载入模板列表">
            <Button
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={() => void fetchTemplates({ force: true })}
            />
          </Tooltip>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditor(emptyEditor());
              setEditorOpen(true);
            }}
          >
            新建模板
          </Button>
        </Space>
      </div>

      {error ? <Alert type="error" showIcon message="模板加载失败" description={error} /> : null}

      {loading && templates.length === 0 ? (
        <div className="flex justify-center py-12">
          <Spin />
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          kind="articles"
          title="还没有任何模板"
          description="新建一个模板，把 toc、comments、cover 这类常用字段存下来"
          actionText="新建模板"
          onAction={() => {
            setEditor(emptyEditor());
            setEditorOpen(true);
          }}
        />
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <Card key={t.id} size="small" className="hm-surface">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base">{t.icon || '📄'}</span>
                    <span className="font-medium">{t.name}</span>
                    {t.isBuiltin ? (
                      <Tag color="blue" className="m-0" style={{ fontSize: 11 }}>
                        内置
                      </Tag>
                    ) : null}
                    {t.body ? (
                      <Tooltip title="包含正文骨架">
                        <Tag icon={<FileTextOutlined />} className="m-0" style={{ fontSize: 11 }}>
                          骨架
                        </Tag>
                      </Tooltip>
                    ) : null}
                  </div>
                  {t.description ? (
                    <div className="mt-0.5 text-xs hm-text-secondary">{t.description}</div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {Object.keys(t.fields ?? {}).length === 0 ? (
                      <span className="text-xs hm-text-secondary">无自定义字段</span>
                    ) : (
                      Object.entries(t.fields).map(([key, value]) => (
                        <Tooltip key={key} title={`${key}: ${JSON.stringify(value)}`}>
                          <Tag className="m-0 hm-mono" style={{ fontSize: 11 }}>
                            {key}
                          </Tag>
                        </Tooltip>
                      ))
                    )}
                  </div>
                </div>

                <Space size={4}>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditor(editorFromTemplate(t));
                      setEditorOpen(true);
                    }}
                  >
                    编辑
                  </Button>
                  <Tooltip title="另存为新模板">
                    <Button
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => void handleDuplicate(t)}
                    />
                  </Tooltip>
                  {t.isBuiltin ? (
                    <Tooltip title="内置模板不可删除，可编辑或另存为新模板">
                      <Button size="small" danger disabled icon={<DeleteOutlined />} />
                    </Tooltip>
                  ) : (
                    <Popconfirm
                      title="删除模板？"
                      description={`「${t.name}」将被删除，已套用该模板的文章不受影响。`}
                      okText="删除"
                      okButtonProps={{ danger: true }}
                      cancelText="取消"
                      onConfirm={() => void handleDelete(t)}
                    >
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  )}
                </Space>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 编辑器 */}
      <Modal
        open={editorOpen}
        title={
          <Space>
            <ThunderboltOutlined />
            <span>{editor.id ? `编辑模板${editor.isBuiltin ? '（内置）' : ''}` : '新建模板'}</span>
          </Space>
        }
        width={880}
        onCancel={() => setEditorOpen(false)}
        footer={
          <Space>
            <Button onClick={() => setEditorOpen(false)}>取消</Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              disabled={errors.length > 0}
              onClick={() => void handleSave()}
            >
              保存模板
            </Button>
          </Space>
        }
      >
        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-[64px_1fr_1fr] gap-3">
            <div>
              <div className="mb-1.5 text-xs hm-text-secondary">图标</div>
              <Input
                value={editor.icon}
                onChange={(e) => setEditor((s) => ({ ...s, icon: e.target.value }))}
                placeholder="📘"
                maxLength={4}
                className="text-center"
              />
            </div>
            <div>
              <div className="mb-1.5 text-xs hm-text-secondary">
                模板名称 <span className="text-red-500">*</span>
              </div>
              <Input
                value={editor.name}
                onChange={(e) => setEditor((s) => ({ ...s, name: e.target.value }))}
                placeholder="如：技术长文"
                maxLength={40}
              />
            </div>
            <div>
              <div className="mb-1.5 text-xs hm-text-secondary">说明</div>
              <Input
                value={editor.description}
                onChange={(e) => setEditor((s) => ({ ...s, description: e.target.value }))}
                placeholder="一句话说明模板用途"
                maxLength={60}
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium">Front Matter 字段</div>
              <Segmented
                size="small"
                value={editor.mode}
                onChange={(v) => switchMode(v as EditorMode)}
                options={[
                  { label: '表格', value: 'table' },
                  { label: 'YAML', value: 'yaml' },
                ]}
              />
            </div>

            {editor.mode === 'table' ? (
              <div className="space-y-2">
                {editor.rows.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={<span className="text-xs">还没有字段</span>}
                  />
                ) : (
                  editor.rows.map((row) => (
                    <div key={row.uid} className="flex items-start gap-2">
                      <AutoComplete
                        size="small"
                        style={{ width: 190 }}
                        value={row.key}
                        placeholder="字段名"
                        options={keyOptions(editor.rows)}
                        onChange={(value) => patchRow(row.uid, { key: value })}
                        onSelect={(value) => {
                          const preset = FRONT_MATTER_FIELD_PRESETS.find((p) => p.name === value);
                          patchRow(row.uid, {
                            key: String(value),
                            ...(preset ? { type: preset.type, value: preset.sample } : {}),
                          });
                        }}
                        filterOption={(input, option) =>
                          String(option?.value ?? '')
                            .toLowerCase()
                            .includes(input.toLowerCase())
                        }
                      />
                      <Select
                        size="small"
                        style={{ width: 92 }}
                        value={row.type}
                        onChange={(type) => {
                          const next = type as FieldType;
                          let value: FieldRow['value'] = '';
                          if (next === 'boolean') value = false;
                          else if (next === 'number') value = 0;
                          else if (next === 'list') value = [];
                          else if (next === 'json') value = '{}';
                          patchRow(row.uid, { type: next, value });
                        }}
                        options={[
                          { label: '文本', value: 'text' },
                          { label: '数字', value: 'number' },
                          { label: '开关', value: 'boolean' },
                          { label: '列表', value: 'list' },
                          { label: 'JSON', value: 'json' },
                        ]}
                      />
                      <div className="min-w-0 flex-1">
                        {row.type === 'boolean' ? (
                          <Switch
                            size="small"
                            checked={Boolean(row.value)}
                            onChange={(checked) => patchRow(row.uid, { value: checked })}
                            checkedChildren="是"
                            unCheckedChildren="否"
                          />
                        ) : row.type === 'number' ? (
                          <InputNumber
                            size="small"
                            className="w-full"
                            value={typeof row.value === 'number' ? row.value : Number(row.value)}
                            onChange={(v) => patchRow(row.uid, { value: v ?? 0 })}
                          />
                        ) : row.type === 'list' ? (
                          <TagInput
                            value={Array.isArray(row.value) ? row.value : []}
                            onChange={(v) => patchRow(row.uid, { value: v })}
                            placeholder="输入后回车添加"
                            color="geekblue"
                          />
                        ) : row.type === 'json' ? (
                          <Input.TextArea
                            size="small"
                            autoSize={{ minRows: 1, maxRows: 6 }}
                            className="hm-mono"
                            value={String(row.value ?? '')}
                            onChange={(e) => patchRow(row.uid, { value: e.target.value })}
                            placeholder='{"key": "value"}'
                          />
                        ) : (
                          <Input
                            size="small"
                            value={String(row.value ?? '')}
                            onChange={(e) => patchRow(row.uid, { value: e.target.value })}
                            placeholder="字段值，留空表示不设置"
                          />
                        )}
                      </div>
                      <Tooltip title="删除该字段">
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => removeRow(row.uid)}
                        />
                      </Tooltip>
                    </div>
                  ))
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button size="small" icon={<PlusOutlined />} onClick={() => addRow()}>
                    添加字段
                  </Button>
                  <span className="text-xs hm-text-secondary">常用字段：</span>
                  {FRONT_MATTER_FIELD_PRESETS.slice(0, 6).map((p) => (
                    <Tag
                      key={p.name}
                      className="m-0 cursor-pointer hm-mono"
                      style={{ fontSize: 11 }}
                      onClick={() => addRow(p)}
                    >
                      + {p.name}
                    </Tag>
                  ))}
                </div>
              </div>
            ) : (
              <Input.TextArea
                value={editor.yamlText}
                onChange={(e) => setEditor((s) => ({ ...s, yamlText: e.target.value }))}
                autoSize={{ minRows: 8, maxRows: 18 }}
                className="hm-mono"
                placeholder={'categories:\n  - 技术\ntoc: true\nsticky: false'}
              />
            )}

            {errors.length > 0 ? (
              <Alert
                type="error"
                showIcon
                className="mt-2"
                message={errors[0]}
                description={
                  errors.length > 1 ? (
                    <ul className="mt-1 mb-0 list-disc pl-4 text-xs">
                      {errors.slice(1).map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  ) : undefined
                }
              />
            ) : null}
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">
                正文骨架 <span className="text-xs font-normal hm-text-secondary">可选</span>
              </div>
              <Space size={4} wrap>
                {TEMPLATE_BODY_PLACEHOLDERS.map((p) => (
                  <Tooltip key={p.token} title={p.label}>
                    <Tag
                      className="m-0 cursor-pointer hm-mono"
                      style={{ fontSize: 11 }}
                      onClick={() => insertPlaceholder(p.token)}
                    >
                      {p.token}
                    </Tag>
                  </Tooltip>
                ))}
              </Space>
            </div>
            <Input.TextArea
              ref={bodyRef}
              value={editor.body}
              onChange={(e) => setEditor((s) => ({ ...s, body: e.target.value }))}
              autoSize={{ minRows: 5, maxRows: 12 }}
              className="hm-mono"
              placeholder={'## 背景\n\n\n## 方案\n\n\n## 小结\n'}
            />
            <div className="mt-1 text-xs hm-text-secondary">
              新建文章时用它作为初始正文；套用到已有文章时默认不覆盖正文，可在套用对话框中选择追加。
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-2 text-sm font-medium">
              <span>预览</span>
              <span className="text-xs font-normal hm-text-secondary">
                实际写入文章文件的内容
              </span>
            </div>
            <pre
              className="hm-mono max-h-56 overflow-auto rounded border p-3 text-xs leading-relaxed"
              style={{ borderColor: 'var(--hm-border)', margin: 0 }}
            >
              {`---\ntitle: <文章标题>\ndate: <创建时间>\n${fieldsToYaml(fields)}\n---\n\n${
                editor.body || '<正文>'
              }`}
            </pre>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default FrontMatterTemplatesPanel;
