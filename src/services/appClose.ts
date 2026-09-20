// src/services/appClose.ts —— 关窗语义裁决（spec §5.1）：快速捕获开启时主窗关闭 = 隐藏
// （驻留后台承接全局快捷键）；真退出（exitRequested，托盘「退出」置位）时销毁主窗——
// 捕获窗若在（隐藏也算在）必须一并销毁，否则进程驻留成僵尸（M2 plan R3）
import { useAppStore } from '../store/appStore'
import { CAPTURE_WINDOW_LABEL } from '../captureWindow/detect'

export async function closeOrHideMainWindow(): Promise<void> {
  if (!('__TAURI_INTERNALS__' in window)) return // jsdom / e2e web 模式无窗口
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const { quickCaptureEnabled, exitRequested } = useAppStore.getState()
    if (quickCaptureEnabled && !exitRequested) {
      await getCurrentWindow().hide()
      return
    }
    if (quickCaptureEnabled) {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
      const capture = await WebviewWindow.getByLabel(CAPTURE_WINDOW_LABEL)
      if (capture !== null) await capture.destroy()
    }
    await getCurrentWindow().destroy()
  } catch (e) {
    console.error('窗口关闭/隐藏失败', e)
  }
}
