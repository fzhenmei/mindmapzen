import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initI18n } from './i18n'
import { resolveUiLang, systemUiLanguage } from './i18n/resolve'
import { disableBrowserContextMenu } from './services/contextMenuGuard'
import { isE2eMode } from './services/e2eMode'
import { enableSlimScrollbarHover } from './services/slimScrollbarHover'
// OFL 开源字体（内嵌分发，替代系统微软字体：发布合规，详见 theme.css 字体双声道注释）
import '@fontsource-variable/noto-sans-sc'
import '@fontsource-variable/jetbrains-mono'
import './styles/theme.css'
import './App.css'

// 想法4：全局禁用 WebView 原生右键菜单（输入区保留粘贴）——详见 services/contextMenuGuard.ts
disableBrowserContextMenu()
// 细滚动条悬停显隐（2026-09）：详见 services/slimScrollbarHover.ts（Chromium 不重绘
// 滚动条 :hover 态，以 .sb-hot class 切换实现"进入滚动区才显示滑块"）
enableSlimScrollbarHover()

// i18n 预热(2026-09 i18n):渲染前以系统语言同步 init——启动屏即正确语言;
// store init 读到配置后再校正显式偏好(同语言时 changeLanguage 空操作)
initI18n(resolveUiLang('auto', systemUiLanguage()))

// E2E 模式（?e2e=1）：先装内存 FS harness 再挂载应用（index.html 为 module 脚本，顶层 await 可用）
if (isE2eMode()) {
  const { installE2eHarness } = await import('./test/e2eHarness')
  await installE2eHarness()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
