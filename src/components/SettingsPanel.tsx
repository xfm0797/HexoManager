/** 设置面板：应用偏好设置 */

import {
  App as AntdApp,
  Button,
  Divider,
  Form,
  InputNumber,
  Radio,
  Select,
  Switch,
  Tooltip,
} from 'antd';
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ThemeMode } from '@/types';
import { useUiStore } from '@/stores';
import { useUpdateStore } from '@/stores';
import { FormField, FormSection } from './FormField';
import { NODE_VERSIONS } from '@/constants';

const STORAGE_KEYS = {
  defaultNodeVersion: 'hexo-manager:default-node-version',
  defaultBranch: 'hexo-manager:default-branch',
  autoSaveInterval: 'hexo-manager:auto-save-interval',
  editorFontSize: 'hexo-manager:editor-font-size',
  editorWordWrap: 'hexo-manager:editor-word-wrap',
  confirmDangerous: 'hexo-manager:confirm-dangerous',
  defaultPlatform: 'hexo-manager:default-platform',
} as const;

/** 读取本地设置 */
function readSetting(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

/** 写入本地设置 */
function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 忽略持久化失败
  }
}

/** 偏好设置面板 */
export function SettingsPanel() {
  const { message } = AntdApp.useApp();
  const themeMode = useUiStore((s) => s.themeMode);
  const setThemeMode = useUiStore((s) => s.setThemeMode);
  const settings = useUpdateStore((s) => s.settings);
  const saveSettings = useUpdateStore((s) => s.saveSettings);

  const handleReset = () => {
    Object.values(STORAGE_KEYS).forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // 忽略
      }
    });
    message.success('已恢复默认设置，请刷新页面使部分设置生效');
  };

  return (
    <div className="max-w-3xl">
      <FormSection title="外观" description="界面主题选项">
        <Form.Item label="主题模式">
          <Radio.Group
            value={themeMode}
            onChange={(e) => setThemeMode(e.target.value as ThemeMode)}
            optionType="button"
            buttonStyle="solid"
            options={[
              { label: '跟随系统', value: 'system' },
              { label: '浅色', value: 'light' },
              { label: '深色', value: 'dark' },
            ]}
          />
        </Form.Item>

        <FormField name="editorFontSize" label="编辑器字号" tooltip="Monaco 编辑器与代码块的字号">
          <InputNumber
            min={11}
            max={20}
            defaultValue={Number(readSetting(STORAGE_KEYS.editorFontSize, '13'))}
            onChange={(value) => writeSetting(STORAGE_KEYS.editorFontSize, String(value ?? 13))}
            addonAfter="px"
          />
        </FormField>
      </FormSection>

      <Divider />

      <FormSection title="编辑体验" description="影响文章编辑与配置编辑的默认行为">
        <FormField
          name="autoSaveInterval"
          label="自动保存间隔"
          tooltip="编辑文章时自动保存的间隔，0 表示关闭自动保存"
        >
          <Select
            defaultValue={readSetting(STORAGE_KEYS.autoSaveInterval, '30000')}
            onChange={(value) => writeSetting(STORAGE_KEYS.autoSaveInterval, value)}
            options={[
              { label: '关闭自动保存', value: '0' },
              { label: '每 15 秒', value: '15000' },
              { label: '每 30 秒', value: '30000' },
              { label: '每 60 秒', value: '60000' },
            ]}
          />
        </FormField>

        <FormField name="editorWordWrap" label="编辑器自动换行" valuePropName="checked">
          <Switch
            defaultChecked={readSetting(STORAGE_KEYS.editorWordWrap, '1') === '1'}
            onChange={(checked) => writeSetting(STORAGE_KEYS.editorWordWrap, checked ? '1' : '0')}
          />
        </FormField>

        <FormField
          name="confirmDangerous"
          label="危险操作二次确认"
          tooltip="删除站点、回滚部署等操作是否弹出确认框，建议保持开启"
          valuePropName="checked"
        >
          <Switch
            defaultChecked={readSetting(STORAGE_KEYS.confirmDangerous, '1') === '1'}
            onChange={(checked) => writeSetting(STORAGE_KEYS.confirmDangerous, checked ? '1' : '0')}
          />
        </FormField>
      </FormSection>

      <Divider />

      <FormSection title="新建站点默认值" description="在创建站点向导中作为默认值预填">
        <FormField name="defaultNodeVersion" label="默认 Node 版本">
          <Select
            defaultValue={readSetting(STORAGE_KEYS.defaultNodeVersion, 'system')}
            onChange={(value) => writeSetting(STORAGE_KEYS.defaultNodeVersion, value)}
            options={[
              { label: '使用系统默认', value: 'system' },
              ...NODE_VERSIONS.filter((v) => v !== 'lts/*').map((v) => ({
                label: `Node ${v}`,
                value: v,
              })),
            ]}
          />
        </FormField>

        <FormField name="defaultBranch" label="默认分支名">
          <Select
            defaultValue={readSetting(STORAGE_KEYS.defaultBranch, 'main')}
            onChange={(value) => writeSetting(STORAGE_KEYS.defaultBranch, value)}
            options={[
              { label: 'main', value: 'main' },
              { label: 'master', value: 'master' },
            ]}
          />
        </FormField>

        <FormField name="defaultPlatform" label="默认部署平台">
          <Select
            defaultValue={readSetting(STORAGE_KEYS.defaultPlatform, 'github')}
            onChange={(value) => writeSetting(STORAGE_KEYS.defaultPlatform, value)}
            options={[
              { label: 'GitHub Pages', value: 'github' },
              { label: 'Gitee Pages', value: 'gitee' },
              { label: 'GitLab Pages', value: 'gitlab' },
              { label: 'Vercel', value: 'vercel' },
              { label: 'Netlify', value: 'netlify' },
              { label: 'Cloudflare Pages', value: 'cloudflare' },
              { label: 'EdgeOne Pages', value: 'edgeone' },
            ]}
          />
        </FormField>
      </FormSection>

      <Divider />

      <FormSection title="更新" description="版本检查与更新策略">
        <Form.Item label="自动检查更新">
          <Tooltip title="应用启动时静默检查是否有新版本">
            <Switch
              checked={settings.autoCheck}
              onChange={(checked) => void saveSettings({ autoCheck: checked })}
            />
          </Tooltip>
        </Form.Item>

        {settings.skipVersion ? (
          <Form.Item label="已忽略版本">
            <div className="flex items-center gap-2">
              <span className="hm-mono">{settings.skipVersion}</span>
              <Button
                size="small"
                type="link"
                onClick={() => void saveSettings({ skipVersion: null })}
              >
                取消忽略
              </Button>
            </div>
          </Form.Item>
        ) : null}
      </FormSection>

      <Divider />

      <div className="flex items-center justify-between">
        <span className="text-xs hm-text-secondary">以上偏好保存在本机，不会同步到仓库</span>
        <Button danger icon={<DeleteOutlined />} onClick={handleReset}>
          恢复默认设置
        </Button>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs hm-text-secondary">
        <ReloadOutlined />
        <span>部分设置需要刷新页面后生效</span>
      </div>
    </div>
  );
}
