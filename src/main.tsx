/** 应用入口 */

// 注意：Monaco 的初始化（loader 指向本地实例 + worker 注册）已随
// `components/MonacoEditor` 懒加载，不再在首屏求值 —— 见 utils/monaco.ts 的说明。

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { t } from '@/i18n';
import './styles/global.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error(t('未找到 #root 挂载节点'));
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
