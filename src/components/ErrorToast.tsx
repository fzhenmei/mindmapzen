// src/components/ErrorToast.tsx —— 全局错误浮层（App shell 常驻，2026-09-24 修正闭环）：
// error 单一事实源在 appStore（各 setError 出口不变），此处只订阅渲染——三态（案头/编辑器/
// 开屏）统一出口，替代案头 LibraryView 原流内横幅（不可关闭、编辑器内不可见的盲区一并修复）。
// 粘住不自动消失：被拦截离开（保存失败守卫）时用户需要看到原因与修正指引；X 显式关闭。
// 视觉同 zen-banner/ToastHost 浮层语言（.error-toast：实底 destructive color-mix + 阴影 +
// copy-in 淡入，浮层必不透明）；「定位」钮仅编辑器内且错误带问题节点 uid 时出现（errorLocate
// 显示依据；点击 requestErrorLocate 递增 locatePulse → EditorView 消费即清复用 locateNode）。
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { useAppStore } from '../store/appStore'

export default function ErrorToast() {
  const { t } = useTranslation()
  const error = useAppStore((s) => s.error)
  const errorLocate = useAppStore((s) => s.errorLocate)
  const route = useAppStore((s) => s.route)
  if (error === null) return null
  // 案头/开屏无画布可定位（编辑器已卸载无人消费 effect），只文不钮
  const canLocate = errorLocate !== null && route === 'editor'
  return (
    <div data-testid="error-toast" role="alert" className="error-toast">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{error}</span>
        <button
          type="button"
          data-testid="error-close"
          aria-label={t('errors.dismiss')}
          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => useAppStore.getState().setError(null)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {canLocate && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{t('errors.fixLocateHint')}</span>
          <button
            type="button"
            data-testid="error-locate"
            className="shrink-0 text-primary underline-offset-2 hover:underline"
            onClick={() => useAppStore.getState().requestErrorLocate()}
          >
            {t('errors.locateBtn')}
          </button>
        </div>
      )}
    </div>
  )
}
