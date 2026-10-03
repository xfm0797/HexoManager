/** 应用入口 */

// 必须先于任何编辑器渲染：把 Monaco 指向本地打包实例，避免 CDN 被 CSP 拦截
import '@/utils/monaco';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('未找到 #root 挂载节点');
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
