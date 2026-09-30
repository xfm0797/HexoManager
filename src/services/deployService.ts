/** 部署配置服务层 */

import { call, callSafe } from './invoke';
import type {
  DeployConfig,
  DeployLog,
  DeployTemplate,
  GeneratedFile,
  GenerateConfigInput,
} from '@/types';

export const deployService = {
  /** 生成部署配置（可选写盘） */
  generate(input: GenerateConfigInput): Promise<GeneratedFile[]> {
    return call<GeneratedFile[]>('generate_deploy_config', { input });
  },

  /** 预览部署配置 */
  preview(input: GenerateConfigInput): Promise<GeneratedFile[]> {
    return callSafe<GeneratedFile[]>('preview_deploy_config', { input }, []);
  },

  /** 生成指定 Pages 平台配置 */
  generatePages(input: GenerateConfigInput, platform: string): Promise<GeneratedFile[]> {
    return call<GeneratedFile[]>('generate_pages_config', { input, platform });
  },

  /** 部署模板清单 */
  templates(): Promise<DeployTemplate[]> {
    return callSafe<DeployTemplate[]>('get_deploy_templates', undefined, []);
  },

  /** 保存部署配置 */
  save(siteId: number, config: Partial<DeployConfig>): Promise<void> {
    return call<void>('save_deploy_config', { siteId, config });
  },

  /** 读取部署配置 */
  getConfig(siteId: number): Promise<DeployConfig> {
    return call<DeployConfig>('get_deploy_config', { siteId });
  },

  /** 部署历史 */
  logs(siteId: number, limit = 50): Promise<DeployLog[]> {
    return callSafe<DeployLog[]>('get_deploy_logs', { siteId, limit }, []);
  },

  /** 回滚部署 */
  rollback(siteId: number, commitHash: string): Promise<string> {
    return call<string>('rollback_deploy', { siteId, commitHash });
  },

  /** 触发 Webhook */
  triggerWebhook(url: string, payload?: Record<string, unknown>): Promise<string> {
    return call<string>('trigger_webhook', { url, payload: payload ?? null });
  },

  /** 校验域名 */
  validateDomain(domain: string): Promise<void> {
    return call<void>('validate_domain', { domain });
  },

  /** 检查目标配置文件是否已存在 */
  checkFiles(input: GenerateConfigInput): Promise<[string, boolean][]> {
    return callSafe<[string, boolean][]>('check_deploy_files', { input }, []);
  },
};
