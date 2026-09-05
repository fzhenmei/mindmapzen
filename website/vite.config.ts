import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 官网独立构建:与主项目同栈(Vite + React + Tailwind v4),不进主项目构建链。
// 端口避开主项目 5173,允许两边 dev 并行
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5174 },
})
