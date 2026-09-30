/** Vite 环境类型声明 */

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly BASE_URL: string;
  /** 应用版本号，由 vite define 注入 */
  readonly VITE_APP_VERSION?: string;
  /** 更新清单地址 */
  readonly VITE_UPDATE_MANIFEST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** 允许导入 CSS 模块 */
declare module '*.css';

/** 允许导入 SVG 作为 URL */
declare module '*.svg' {
  const src: string;
  export default src;
}

/** 允许导入图片资源 */
declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.webp' {
  const src: string;
  export default src;
}
