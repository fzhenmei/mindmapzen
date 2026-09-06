import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { IS_EN, L } from './content'
// OFL 开源字体自托管(与主项目一致:不引微软授权系统字体,不依赖 Google CDN)
import '@fontsource-variable/noto-sans-sc'
import '@fontsource-variable/jetbrains-mono'
import './styles/theme.css'
import './app.css'

// 语言随构建模式选定(vite build --mode en 出英文版):
// 运行时同步 html 头(标题/描述/lang),index.html 内置的是中文兜底
document.title = L.html.title
document
  .querySelector('meta[name="description"]')
  ?.setAttribute('content', L.html.description)
document.documentElement.lang = IS_EN ? 'en' : 'zh-CN'

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
