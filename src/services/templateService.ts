/** Front Matter 模板服务层 */

import { call } from './invoke';
import type {
  ApplyTemplateInput,
  ApplyTemplateResult,
  FrontMatterTemplate,
  SaveFrontMatterTemplateInput,
} from '@/types';

export const templateService = {
  /** 获取全部模板（首次调用时后端会播种内置模板） */
  list(): Promise<FrontMatterTemplate[]> {
    return call<FrontMatterTemplate[]>('get_front_matter_templates');
  },

  /** 新建或更新模板 */
  save(input: SaveFrontMatterTemplateInput): Promise<FrontMatterTemplate> {
    return call<FrontMatterTemplate>('save_front_matter_template', { input });
  },

  /** 删除模板（内置模板会被后端拒绝） */
  remove(templateId: number): Promise<void> {
    return call<void>('delete_front_matter_template', { templateId });
  },

  /** 把模板套用到已有文章 */
  apply(input: ApplyTemplateInput): Promise<ApplyTemplateResult> {
    return call<ApplyTemplateResult>('apply_front_matter_template', { input });
  },
};
