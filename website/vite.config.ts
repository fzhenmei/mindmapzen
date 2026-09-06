import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { en } from './src/content/en'
import { zh } from './src/content/zh'

// 官网独立构建:与主项目同栈(Vite + React + Tailwind v4),不进主项目构建链。
// 端口避开主项目 5173,允许两边 dev 并行。
// 双语双份构建(2026-09 i18n):默认中文出 dist/;`vite build --mode en` 出 dist/en/
// (base /en/、不清空中文产物)。html 头(lang/title/description/hreflang)按 mode 注入。
function localeHtml(mode: string): Plugin {
  const isEn = mode === 'en'
  const head = isEn ? en.html : zh.html
  return {
    name: 'locale-html',
    transformIndexHtml(html) {
      return html
        .replace('%HTML_LANG%', isEn ? 'en' : 'zh-CN')
        .replace('%TITLE%', head.title)
        .replace('%DESCRIPTION%', head.description)
        .replace(
          '%HREFLANG%',
          '<link rel="alternate" hreflang="zh-CN" href="/" />\n    <link rel="alternate" hreflang="en" href="/en/" />',
        )
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), localeHtml(mode)],
  server: { port: 5174 },
  base: mode === 'en' ? '/en/' : '/',
  build: { outDir: mode === 'en' ? 'dist/en' : 'dist', emptyOutDir: mode !== 'en' },
}))
