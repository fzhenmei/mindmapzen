import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { disableBrowserContextMenu } from './services/contextMenuGuard'
import './styles/theme.css'
import './App.css'

// 想法4：全局禁用 WebView 原生右键菜单（输入区保留粘贴）——详见 services/contextMenuGuard.ts
disableBrowserContextMenu()

// E2E 模式（?e2e=1）：先装内存 FS harness 再挂载应用（index.html 为 module 脚本，顶层 await 可用）
if (new URLSearchParams(window.location.search).has('e2e')) {
  const { installE2eHarness } = await import('./test/e2eHarness')
  await installE2eHarness()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
