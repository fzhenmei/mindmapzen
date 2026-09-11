/// <reference types="vite/client" />

/** 构建期版本信息（2026-09 关于页）：vite define 注入（vite.config.ts，值源
 *  package.json / git rev-parse），dev/build/单测三态同源 */
// AI transport 注入点（e2e/单测塞 fake，生产 undefined 走 Tauri；见 services/ai/client.ts）
declare global {
  const __APP_VERSION__: string
  const __GIT_COMMIT__: string

  interface Window {
    __AI_TRANSPORT_FACTORY__?: () => import('./services/ai/client').AiTransport
  }
}
export {}
