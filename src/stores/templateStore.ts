/** Front Matter 模板状态管理 */

import { create } from 'zustand';
import { templateService } from '@/services';
import type {
  ApplyTemplateInput,
  ApplyTemplateResult,
  FrontMatterTemplate,
  SaveFrontMatterTemplateInput,
} from '@/types';

interface TemplateState {
  /** 全部模板（内置在前） */
  templates: FrontMatterTemplate[];
  /** 列表加载中 */
  loading: boolean;
  /** 保存中 */
  saving: boolean;
  /** 最近一次加载的错误 */
  error: string | null;
  /** 上次选用的模板 ID（跨会话记忆由 localStorage 侧负责，这里只记本次会话） */
  lastUsedId: number | null;

  /** 拉取模板列表 */
  fetchTemplates: (options?: { force?: boolean }) => Promise<void>;
  /** 新建或更新模板 */
  saveTemplate: (input: SaveFrontMatterTemplateInput) => Promise<FrontMatterTemplate>;
  /** 删除模板 */
  deleteTemplate: (templateId: number) => Promise<void>;
  /** 复制模板（另存为新模板，用于派生内置模板） */
  duplicateTemplate: (template: FrontMatterTemplate, name: string) => Promise<FrontMatterTemplate>;
  /** 套用到已有文章 */
  applyTemplate: (input: ApplyTemplateInput) => Promise<ApplyTemplateResult>;
  /** 记录最近使用的模板 */
  markUsed: (templateId: number) => void;
  /** 清除错误 */
  clearError: () => void;
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  templates: [],
  loading: false,
  saving: false,
  error: null,
  lastUsedId: null,

  async fetchTemplates(options) {
    if (!options?.force && get().templates.length > 0) return;

    set({ loading: true, error: null });
    try {
      const templates = await templateService.list();
      set({ templates, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  async saveTemplate(input) {
    set({ saving: true, error: null });
    try {
      const saved = await templateService.save(input);
      set((state) => {
        const exists = state.templates.some((t) => t.id === saved.id);
        const templates = exists
          ? state.templates.map((t) => (t.id === saved.id ? saved : t))
          : [...state.templates, saved];
        return {
          templates: templates.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
          saving: false,
        };
      });
      return saved;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ saving: false, error: message });
      throw new Error(message);
    }
  },

  async deleteTemplate(templateId) {
    await templateService.remove(templateId);
    set((state) => ({
      templates: state.templates.filter((t) => t.id !== templateId),
      lastUsedId: state.lastUsedId === templateId ? null : state.lastUsedId,
    }));
  },

  async duplicateTemplate(template, name) {
    return get().saveTemplate({
      name,
      description: template.description ?? undefined,
      icon: template.icon ?? undefined,
      fields: template.fields,
      body: template.body ?? undefined,
    });
  },

  async applyTemplate(input) {
    const result = await templateService.apply(input);
    set({ lastUsedId: input.templateId });
    return result;
  },

  markUsed(templateId) {
    set({ lastUsedId: templateId });
  },

  clearError() {
    set({ error: null });
  },
}));
