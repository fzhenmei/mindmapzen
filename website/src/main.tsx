import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// OFL 开源字体自托管(与主项目一致:不引微软授权系统字体,不依赖 Google CDN)
import '@fontsource-variable/noto-sans-sc'
import '@fontsource-variable/jetbrains-mono'
import './styles/theme.css'
import './app.css'

// 官网无手动主题切换:始终跟随系统。index.html 内联脚本已防首帧闪烁,
// 这里续订运行中的系统主题变更
const colorScheme = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => {
  document.documentElement.dataset.theme = colorScheme.matches ? 'dark' : 'light'
}
applyTheme()
colorScheme.addEventListener('change', applyTheme)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
