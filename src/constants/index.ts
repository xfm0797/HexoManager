/** 常量与枚举清单 */

import type { PlatformId } from '@/types';

/** 应用元信息 */
export const APP_META = {
  name: 'HexoManager',
  version: '1.0.0',
  description: '桌面端 Hexo 多站点管理工具',
  author: 'XFM',
  license: 'MIT',
  repository: 'https://github.com/xfm/hexo-manager',
  homepage: 'https://hexo-manager.xfm.dev',
} as const;

/** 本地存储键 */
export const STORAGE_KEYS = {
  theme: 'hexo-manager:theme',
  sidebar: 'hexo-manager:sidebar-collapsed',
  recentSites: 'hexo-manager:recent-sites',
} as const;

/** 分页默认值 */
export const PAGE_SIZE_OPTIONS = ['10', '20', '50', '100'] as const;

/** 代码仓库平台 */
export interface RepoPlatformMeta {
  id: PlatformId;
  name: string;
  /** 图标文字（简写） */
  badge: string;
  /** 主题色 */
  color: string;
  officialUrl: string;
  /** 是否支持作为代码托管 */
  isRepo: boolean;
}

export const REPO_PLATFORMS: RepoPlatformMeta[] = [
  {
    id: 'github',
    name: 'GitHub',
    badge: 'GH',
    color: '#24292f',
    officialUrl: 'https://github.com',
    isRepo: true,
  },
  {
    id: 'gitee',
    name: 'Gitee',
    badge: 'GE',
    color: '#c71d23',
    officialUrl: 'https://gitee.com',
    isRepo: true,
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    badge: 'GL',
    color: '#fc6d26',
    officialUrl: 'https://gitlab.com',
    isRepo: true,
  },
];

/** 部署平台（CI/CD） */
export interface DeployPlatformMeta {
  id: PlatformId;
  name: string;
  badge: string;
  color: string;
  description: string;
  officialUrl: string;
  /** 需要用户填写域名的场景提示 */
  domainHint: string;
  /** 是否支持自定义域名 */
  supportsCustomDomain: boolean;
}

export const DEPLOY_PLATFORMS: DeployPlatformMeta[] = [
  {
    id: 'github',
    name: 'GitHub Pages',
    badge: 'GH',
    color: '#24292f',
    description: '通过 GitHub Actions 构建并部署到 GitHub Pages，支持自定义域名与 HTTPS。',
    officialUrl: 'https://pages.github.com/',
    domainHint: '如 blog.example.com，需在仓库 Settings → Pages 中配置并添加 CNAME 记录',
    supportsCustomDomain: true,
  },
  {
    id: 'gitee',
    name: 'Gitee Pages',
    badge: 'GE',
    color: '#c71d23',
    description: '借助 Gitee Go / 手动部署到 Gitee Pages，国内访问速度较好。',
    officialUrl: 'https://gitee.com/help/articles/4136',
    domainHint: 'Gitee Pages 自定义域名需付费开通 Pro 服务',
    supportsCustomDomain: false,
  },
  {
    id: 'gitlab',
    name: 'GitLab Pages',
    badge: 'GL',
    color: '#fc6d26',
    description: '使用 .gitlab-ci.yml 流水线构建，产物自动发布到 GitLab Pages。',
    officialUrl: 'https://docs.gitlab.com/ee/user/project/pages/',
    domainHint: '可在仓库 Settings → Pages 中绑定自定义域名',
    supportsCustomDomain: true,
  },
  {
    id: 'vercel',
    name: 'Vercel',
    badge: 'VE',
    color: '#000000',
    description: '零配置边缘部署，自动 HTTPS，支持预览部署与瞬时回滚。',
    officialUrl: 'https://vercel.com/docs',
    domainHint: '在 Vercel 控制台 Domains 中添加域名并配置 DNS',
    supportsCustomDomain: true,
  },
  {
    id: 'netlify',
    name: 'Netlify',
    badge: 'NE',
    color: '#00c7b7',
    description: '通过 netlify.toml 声明构建与重定向规则，内置表单与函数能力。',
    officialUrl: 'https://docs.netlify.com/',
    domainHint: '在 Netlify 控制台 Domain management 中绑定',
    supportsCustomDomain: true,
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare Pages',
    badge: 'CF',
    color: '#f38020',
    description: '全球边缘网络分发，无限带宽，配合 Cloudflare Workers 可做强缓存与回源控制。',
    officialUrl: 'https://developers.cloudflare.com/pages/',
    domainHint: '在 Cloudflare Pages 项目中添加 Custom domain',
    supportsCustomDomain: true,
  },
  {
    id: 'edgeone',
    name: 'EdgeOne Pages',
    badge: 'EO',
    color: '#0052d9',
    description: '腾讯云边缘安全加速平台，国内节点覆盖好，支持边缘函数与回源策略。',
    officialUrl: 'https://cloud.tencent.com/product/teo',
    domainHint: '在 EdgeOne 控制台添加加速域名并配置 CNAME',
    supportsCustomDomain: true,
  },
];

/** 边缘层服务商 */
export interface EdgeProviderMeta {
  id: string;
  name: string;
  badge: string;
  color: string;
  description: string;
  officialUrl: string;
}

export const EDGE_PROVIDERS: EdgeProviderMeta[] = [
  {
    id: 'edgeone',
    name: '腾讯云 EdgeOne',
    badge: 'EO',
    color: '#0052d9',
    description: '国内边缘节点覆盖广，支持智能回源、缓存规则与边缘函数。',
    officialUrl: 'https://cloud.tencent.com/product/teo',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    badge: 'CF',
    color: '#f38020',
    description: '全球 Anycast 网络 + Workers，可做故障转移与 KV 健康状态记录。',
    officialUrl: 'https://www.cloudflare.com/',
  },
  {
    id: 'both',
    name: '双边缘（EdgeOne + Cloudflare）',
    badge: '2×',
    color: '#722ed1',
    description: '国内走 EdgeOne、海外走 Cloudflare，配合智能回源实现双活。',
    officialUrl: 'https://cloud.tencent.com/product/teo',
  },
  {
    id: 'none',
    name: '不使用边缘层',
    badge: '—',
    color: '#8c8c8c',
    description: '直接使用 Pages 平台自带 CDN，配置最简单。',
    officialUrl: 'https://pages.github.com/',
  },
];

/** 回源策略 */
export const ORIGIN_STRATEGIES = [
  {
    value: 'failover',
    label: '智能故障转移',
    description: '主源不可用时自动切换到备用源，适合追求可用性',
  },
  {
    value: 'primary',
    label: '仅主源',
    description: '始终回源到主站，配置简单',
  },
  {
    value: 'round-robin',
    label: '多源轮询',
    description: '在多个源站之间轮询，分摊压力',
  },
  {
    value: 'nearest',
    label: '就近回源',
    description: '按用户地理位置选择最近的源站',
  },
] as const;

/** 常用 Node 版本 */
export const NODE_VERSIONS = ['18', '20', '22', 'lts/*'] as const;

/** 常用构建命令 */
export const BUILD_COMMANDS = [
  { label: 'hexo clean && hexo generate', value: 'hexo clean && hexo generate' },
  { label: 'npm run build', value: 'npm run build' },
  { label: 'npm ci && hexo generate', value: 'npm ci && hexo generate' },
  { label: 'pnpm install && hexo generate', value: 'pnpm install && hexo generate' },
] as const;

/** 侧栏导航项 */
export interface NavItem {
  key: string;
  path: string;
  label: string;
  icon: string;
  /** 分组 */
  group: 'main' | 'content' | 'system';
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', path: '/', label: '工作台', icon: 'DashboardOutlined', group: 'main' },
  { key: 'sites', path: '/sites', label: '站点管理', icon: 'CloudServerOutlined', group: 'main' },
  {
    key: 'articles',
    path: '/articles',
    label: '文章管理',
    icon: 'FileTextOutlined',
    group: 'content',
  },
  {
    key: 'categories',
    path: '/categories',
    label: '分类标签',
    icon: 'TagsOutlined',
    group: 'content',
  },
  { key: 'config', path: '/config', label: '配置管理', icon: 'SettingOutlined', group: 'content' },
  { key: 'themes', path: '/themes', label: '主题管理', icon: 'BgColorsOutlined', group: 'content' },
  { key: 'plugins', path: '/plugins', label: '插件管理', icon: 'ApiOutlined', group: 'content' },
  { key: 'files', path: '/files', label: '文件管理', icon: 'FolderOutlined', group: 'content' },
  {
    key: 'preview',
    path: '/preview',
    label: '本地预览',
    icon: 'PlayCircleOutlined',
    group: 'content',
  },
  { key: 'deploy', path: '/deploy', label: '部署配置', icon: 'RocketOutlined', group: 'system' },
  { key: 'git', path: '/git', label: 'Git 操作', icon: 'BranchesOutlined', group: 'system' },
  { key: 'logs', path: '/logs', label: '部署记录', icon: 'HistoryOutlined', group: 'system' },
  {
    key: 'updates',
    path: '/updates',
    label: '关于与更新',
    icon: 'InfoCircleOutlined',
    group: 'system',
  },
  {
    key: 'notifications',
    path: '/notifications',
    label: '消息中心',
    icon: 'BellOutlined',
    group: 'system',
  },
  { key: 'settings', path: '/settings', label: '偏好设置', icon: 'ToolOutlined', group: 'system' },
];

/** 侧栏分组标题 */
export const NAV_GROUPS: Record<NavItem['group'], string> = {
  main: '概览',
  content: '内容',
  system: '运维',
};

/** 文章列表状态筛选项 */
export const ARTICLE_STATUS_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '已发布', value: 'published' },
  { label: '草稿', value: 'draft' },
] as const;

/** 站点状态展示配置 */
export const SITE_STATUS_META: Record<
  string,
  {
    label: string;
    color: string;
    badge: 'success' | 'default' | 'error' | 'warning' | 'processing';
  }
> = {
  active: { label: '正常', color: 'green', badge: 'success' },
  archived: { label: '已归档', color: 'default', badge: 'default' },
  error: { label: '异常', color: 'red', badge: 'error' },
  building: { label: '构建中', color: 'blue', badge: 'processing' },
};

/** 部署记录状态展示配置 */
export const DEPLOY_STATUS_META: Record<
  string,
  { label: string; color: string; badge: 'success' | 'error' | 'processing' | 'default' }
> = {
  success: { label: '成功', color: 'green', badge: 'success' },
  failed: { label: '失败', color: 'red', badge: 'error' },
  running: { label: '进行中', color: 'blue', badge: 'processing' },
  pending: { label: '等待中', color: 'default', badge: 'default' },
};
