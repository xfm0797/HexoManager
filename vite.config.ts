import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // monaco-editor 的 exports 只映射 `*.js`，CSS 无法用包路径导入（会被拼成 *.css.js）。
      // 这里显式指向真实文件，供 utils/monacoEntry.ts 引入编辑器图标字体。
      'monaco-codicon-css': path.resolve(
        __dirname,
        'node_modules/monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css',
      ),
      'monaco-codicon-modifiers-css': path.resolve(
        __dirname,
        'node_modules/monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon-modifiers.css',
      ),
    },
  },
  // Tauri 期望固定端口，失败即报错
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    target: 'es2021',
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // 用函数而不是数组写法：数组形式（`{ monaco: ['monaco-editor'] }`）会把
        // 该 chunk 当作入口的静态依赖，index.html 直接预加载 4MB 的 monaco。
        // monaco 也不能单独切 chunk —— Rollup 会把动态 import 的 preload helper
        // 放进 monaco chunk，再次形成「入口静态依赖 monaco」的边。
        // 因此这里只固定 antd（首屏必用），Monaco 交给动态 import 自然分包。
        manualChunks(id) {
          if (id.includes('node_modules/antd') || id.includes('node_modules/@ant-design')) {
            return 'antd';
          }
          return undefined;
        },
      },
    },
  },
});
