// src/services/captureWindow.ts —— 唤起捕获小窗（spec §5.4）：懒创建 + 隐藏复用——
// 首次触发 new WebviewWindow（同 bundle，label 分派到 captureWindow/boot），
// 之后 show + setFocus。创建/唤起失败显式出口（console + toast），不静默
import { i18n } from '../i18n'
import { showToast } from './toast'
import { CAPTURE_WINDOW_LABEL } from '../captureWindow/detect'

export async function showCaptureWindow(): Promise<void> {
  if (!('__TAURI_INTERNALS__' in window)) return // jsdom / e2e web 模式无窗口
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
    const existing = await WebviewWindow.getByLabel(CAPTURE_WINDOW_LABEL)
    if (existing !== null) {
      // 唤起场景常为本应用无焦点（快捷键呼出），常规 setFocus 跨 IPC 后被 Windows 前台锁
      // 拒——窗口可见但键盘进不去（2026-09-23 报障），走宿主的 AttachThreadInput 前台化
      // 通道；失败回退常规 show+setFocus（保持窗口至少可见）
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('force_foreground_window', { label: CAPTURE_WINDOW_LABEL })
      } catch (e) {
        console.error('捕获小窗前台化失败，回退常规显示', e)
        await existing.show()
        await existing.setFocus()
      }
      return
    }
    const w = new WebviewWindow(CAPTURE_WINDOW_LABEL, {
      url: 'index.html',
      title: i18n.t('basket.capture.title'),
      width: 480,
      // 内容自然高 ~170（p-5×2 + 标题 + rows=3 输入框 + hint，均为显式像素值）+
      // error 态 24（一段 text-xs + gap）：280 会恒留 ~110px 底部空白（2026-09-23 报障）
      height: 194,
      decorations: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      center: true,
      // 防首唤白闪（2026-09-23 报障，主窗防闪变同款思路）：隐身创建，待小窗内配置
      // 落定 + 首帧绘制完成后由 CaptureWindowApp 的 showSelf 自显——WebView2 白底不上屏
      visible: false,
    })
    w.once('tauri://error', (e) => {
      console.error('捕获小窗创建失败', e)
      showToast(i18n.t('basket.errors.windowCreateFailed'))
    })
  } catch (e) {
    console.error('捕获小窗唤起失败', e)
    showToast(i18n.t('basket.errors.windowCreateFailed'))
  }
}
