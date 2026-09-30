/** 部署进度条：展示部署各阶段状态 */

import { Steps, Progress, Alert } from 'antd';
import {
  BuildOutlined,
  CloudUploadOutlined,
  FileAddOutlined,
  LoadingOutlined,
  RocketOutlined,
} from '@ant-design/icons';

/** 部署阶段定义 */
export const DEPLOY_PHASES = [
  { key: 'build', title: '构建站点', description: 'hexo clean && hexo generate' },
  { key: 'stage', title: '暂存文件', description: 'git add -A' },
  { key: 'commit', title: '创建提交', description: 'git commit -m' },
  { key: 'push', title: '推送远程', description: 'git push origin' },
] as const;

const PHASE_ICONS = {
  build: <BuildOutlined />,
  stage: <FileAddOutlined />,
  commit: <RocketOutlined />,
  push: <CloudUploadOutlined />,
};

interface DeployProgressProps {
  /** 当前阶段索引（0-3），-1 表示未开始，4 表示全部完成 */
  current: number;
  /** 是否执行中 */
  running?: boolean;
  /** 部署失败时的错误信息 */
  error?: string | null;
  /** 是否展示为紧凑的步骤条（默认展示步骤条） */
  variant?: 'steps' | 'progress';
  /** progress 模式下的百分比 */
  percent?: number;
}

/**
 * 部署进度展示。
 * 提供步骤条与进度条两种形态，便于在不同区域复用。
 */
export function DeployProgress({
  current,
  running = false,
  error = null,
  variant = 'steps',
  percent = 0,
}: DeployProgressProps) {
  if (variant === 'progress') {
    return (
      <div className="space-y-2">
        <Progress
          percent={percent}
          status={error ? 'exception' : running ? 'active' : percent >= 100 ? 'success' : 'normal'}
          strokeColor={{ '0%': '#3366ff', '100%': '#722ed1' }}
        />
        {error ? <Alert type="error" showIcon message={error} /> : null}
      </div>
    );
  }

  return (
    <div>
      <Steps
        direction="vertical"
        size="small"
        current={current}
        status={
          error
            ? 'error'
            : running
              ? 'process'
              : current >= DEPLOY_PHASES.length
                ? 'finish'
                : 'wait'
        }
        items={DEPLOY_PHASES.map((phase, index) => {
          const isCurrent = index === current && running;
          const isDone = index < current || current >= DEPLOY_PHASES.length;

          return {
            title: phase.title,
            description: (
              <span className="text-xs hm-text-secondary">
                {isDone && !error ? '已完成' : phase.description}
              </span>
            ),
            icon: isCurrent ? <LoadingOutlined /> : PHASE_ICONS[phase.key],
            status: error && index === current ? 'error' : undefined,
          };
        })}
      />

      {error ? (
        <Alert
          className="mt-3"
          type="error"
          showIcon
          message="部署失败"
          description={<span className="break-all text-xs">{error}</span>}
        />
      ) : null}
    </div>
  );
}
