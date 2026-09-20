// src/services/appClose.ts —— 关窗语义裁决（spec §5.1）：快速捕获开启时主窗关闭 = 隐藏
// （驻留后台承接全局快捷键）；真退出（exitRequested，托盘「退出」置位）时销毁主窗——
// 捕获窗销毁无条件（getByLabel 得 null 自然跳过）：spec §5.1 关闭=全部还原 / Ruling
// T6-1 僵尸进程缺口——未启用时捕获窗若在（如刚关开关的隐藏存活）也一并销毁
import { useAppStore } from '../store/appStore'
import { CAPTURE_WINDOW_LABEL } from '../captureWindow/detect'

export async function closeOrHideMainWindow(): Promise<void> {
  if (!('__TAURI_INTERNALS__' in window)) return // jsdom / e2e web 模式无窗口
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
    const { quickCaptureEnabled, exitRequested } = useAppStore.getState()
    if (quickCaptureEnabled && !exitRequested) {
      await getCurrentWindow().hide()
      return
    }
    const capture = await WebviewWindow.getByLabel(CAPTURE_WINDOW_LABEL)
    if (capture !== null) await capture.destroy()
    await getCurrentWindow().destroy()
  } catch (e) {
    console.error('窗口关闭/隐藏失败', e)
  }
}
