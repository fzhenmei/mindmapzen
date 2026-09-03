// src/components/tour/TourOverlay.tsx —— 漫游引导遮罩（spec §5）：box-shadow 巨影挖洞 +
// 气泡卡；步进编排（before 钩子/越末步 finish）在此，store 只持状态（见 spec 实现细化）。
// z-40：高于视图与砚栏（z-10），低于 Dialog（z-50）——从设置页重看时先关对话框再显形
import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { TOUR_STEPS } from './tourSteps'
import { Button } from '../ui/button'

/** 气泡定位（spec §5）：优先目标下方，视口不够放上方；水平钳制视口内。返回 fixed 坐标 */
function popoverPos(rect: DOMRect): { top: number; left: number } {
  const PO_W = 320 // w-80
  const PO_H = 220 // 估算高（标题+正文+按钮行）
  const below = rect.bottom + 12
  const top = below + PO_H > window.innerHeight ? Math.max(rect.top - PO_H - 12, 12) : below
  const left = Math.min(Math.max(rect.left, 16), Math.max(window.innerWidth - PO_W - 16, 16))
  return { top, left }
}

export default function TourOverlay() {
  const { tourActive, tourStep, route } = useAppStore()
  const [rect, setRect] = useState<DOMRect | null>(null)

  const step = TOUR_STEPS[tourStep] ?? TOUR_STEPS[0]
  const viewMatch = step.view === route

  // 锚点定位 + resize 重算（spec §5）：view/步号变化或窗口变化时重测
  useEffect(() => {
    if (!tourActive || !viewMatch || step.target === null) {
      setRect(null)
      return
    }
    const el = document.querySelector(`[data-testid="${step.target}"]`)
    if (el === null) {
      setRect(null) // 降级居中卡（spec §4.3）
      return
    }
    const measure = () => setRect(el.getBoundingClientRect())
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [tourActive, tourStep, viewMatch, step.target, route])

  // 键盘：→ / ← 步进，Esc 跳过（spec §5）
  useEffect(() => {
    if (!tourActive) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void useAppStore.getState().finishTour()
      else if (e.key === 'ArrowRight') void goNext()
      else if (e.key === 'ArrowLeft') goBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // 不给依赖数组：每渲染重挂，闭包永远读最新 goNext/goBack（内部全走 getState()，无陈旧闭包风险）
  })

  /** 推进（spec §4.2 引擎）：下一步有 before 先 await（可能切视图/route），再步进；越末步 finish。
   *  before 失败（磁盘异常等）吞掉仍步进（spec §9：不阻断引导）——此时 route 未切、
   *  锚点不存在，该步自然走 rect=null 的居中卡降级，跳过/上一步按钮仍可用，不断链 */
  const goNext = async () => {
    const cur = useAppStore.getState().tourStep
    const next = TOUR_STEPS[cur + 1]
    if (next === undefined) {
      await useAppStore.getState().finishTour()
      return
    }
    if (next.before) await next.before().catch(() => {})
    useAppStore.getState().setTourStep(cur + 1)
  }
  const goBack = () => {
    const cur = useAppStore.getState().tourStep
    if (cur > 0) useAppStore.getState().setTourStep(cur - 1)
  }

  if (!tourActive) return null
  const last = tourStep >= TOUR_STEPS.length - 1
  const pos = rect !== null ? popoverPos(rect) : null
  return (
    <div data-testid="tour-overlay" className="fixed inset-0 z-40">
      {/* 高亮框（有锚点且定位成功才渲染）：巨影即遮罩，全屏拦截底层交互 */}
      {rect !== null && pos !== null && (
        <div
          data-testid="tour-highlight"
          className="pointer-events-auto absolute rounded-md border-2 border-primary shadow-[0_0_0_9999px] shadow-foreground/50"
          style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      {(rect === null || pos === null) && <div className="absolute inset-0 bg-foreground/50" />}
      {/* 气泡卡：锚点步贴目标；无锚点/降级步视口居中 */}
      <div
        data-testid="tour-popover"
        className="absolute w-80 rounded-lg border bg-card p-4 text-card-foreground shadow-lg"
        style={
          pos !== null
            ? { top: pos.top, left: pos.left }
            : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
        }
      >
        <p className="text-sm font-semibold">{step.title}</p>
        <p className="mt-1.5 text-sm text-muted-foreground">{step.body}</p>
        <div className="mt-3 flex items-center gap-2">
          <span data-testid="tour-step-indicator" className="mr-auto text-xs text-muted-foreground">
            {tourStep + 1} / {TOUR_STEPS.length}
          </span>
          <Button variant="ghost" size="sm" data-testid="tour-skip" onClick={() => void useAppStore.getState().finishTour()}>
            跳过
          </Button>
          {tourStep > 0 && (
            <Button variant="secondary" size="sm" data-testid="tour-prev" onClick={goBack}>
              上一步
            </Button>
          )}
          <Button size="sm" data-testid="tour-next" onClick={() => void goNext()}>
            {last ? '完成' : '下一步'}
          </Button>
        </div>
      </div>
    </div>
  )
}
