/** 创建站点向导演进条 */

import { Steps } from 'antd';
import {
  CheckCircleOutlined,
  FolderOpenOutlined,
  InfoCircleOutlined,
  SettingOutlined,
} from '@ant-design/icons';

/** 向导步骤定义 */
export const WIZARD_STEPS = [
  { key: 'basic', title: '基本信息', description: '站点名称与描述' },
  { key: 'location', title: '存放位置', description: '目录与环境版本' },
  { key: 'repo', title: '仓库与部署', description: '远程仓库配置' },
  { key: 'confirm', title: '确认创建', description: '检查并执行' },
] as const;

const STEP_ICONS = [
  <InfoCircleOutlined key="basic" />,
  <FolderOpenOutlined key="location" />,
  <SettingOutlined key="repo" />,
  <CheckCircleOutlined key="confirm" />,
];

interface WizardStepsProps {
  current: number;
  onChange?: (step: number) => void;
  /** 已完成步骤集合，用于标记错误回退 */
  completed?: number[];
}

/** 创建站点向导顶部步骤条 */
export function WizardSteps({ current, onChange, completed = [] }: WizardStepsProps) {
  return (
    <Steps
      current={current}
      size="small"
      onChange={onChange}
      items={WIZARD_STEPS.map((step, index) => ({
        title: step.title,
        description: step.description,
        icon: STEP_ICONS[index],
        status: completed.includes(index) && index !== current ? 'finish' : undefined,
      }))}
    />
  );
}
