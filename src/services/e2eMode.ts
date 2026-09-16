// src/services/e2eMode.ts —— E2E 模式判定（main.tsx 挂 harness 与 appStore 启动落点共用）
/** ?e2e=1（Playwright web 模式）：SPA 运行期 URL 不变，重复调用结果恒定 */
export const isE2eMode = (): boolean =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('e2e')
