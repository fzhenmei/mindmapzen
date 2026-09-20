// src/captureWindow/detect.ts —— 早期窗口身份识别（无需异步 Tauri import）：
// Tauri v2 注入的 __TAURI_INTERNALS__.metadata.currentWindow.label 同步可读；
// 浏览器 / vitest / e2e web 模式无此对象 → null（恒走主应用）
export const CAPTURE_WINDOW_LABEL = 'quick-capture'

export function detectWindowLabel(): string | null {
  const internals = (
    window as unknown as { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } }
  ).__TAURI_INTERNALS__
  return internals?.metadata?.currentWindow?.label ?? null
}
