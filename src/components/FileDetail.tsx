import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { buildImageMetaFromSrcs } from '../services/imageAssets'
import { toNativePath } from '../services/nativePath'
import { extractImageMarker } from '../services/imageMarkers'
import { mdOutline } from '../services/mdOutline'
import type { MapInfo } from '../types/files'
import MarkdownPreview from './MarkdownPreview'
import OutlinePanel from './OutlinePanel'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import { IconOutline } from './icons'

interface Props {
  /** 当前选中的导图（预览数据源） */
  info: MapInfo
}

type DetailState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'text'; text: string }

/** 大纲响应式阈值（auto 偏好）：详情区宽 ≥ 此值默认显示大纲。观察详情区整体而非
 *  正文剩余宽——大纲显隐不反馈进判定，避免「显示→变窄→隐藏→变宽」震荡 */
const OUTLINE_WIDE_MIN = 900
/** 大纲默认宽（px）＝原 w-56（14rem） */
const DEFAULT_OUTLINE_PX = 224

/** 案头文件详情态预览面板（容器合并改版）：原 Card 骨架已拆——卡头（标题/六枚
 *  动作钮）上移 LibraryView 主容器页首，卡脚元信息并入页首标题 tooltip，本组件
 *  只剩「读文件 + 插图解析 + markdown 渲染 + loading/error 兜底 + 大纲栏」。file-detail
 *  testid 挂预览容器（兼容既有 E2E/vitest）。bg-muted 下陷底铺满主区，贴
 *  SidebarInset 圆角边（inset 骨架 overflow-hidden 承接裁切） */
export default function FileDetail({ info }: Readonly<Props>) {
  const { t } = useTranslation()
  const [state, setState] = useState<DetailState>({ kind: 'loading' })
  // 插图解析表（M19）：md 行级收集 ![alt](src) → 字节转 dataURL（预览渲染用；
  // webview 解析不了工作区相对路径）。失败宽容空表（img 原样渲染为占位）
  const [imgMap, setImgMap] = useState<ReadonlyMap<string, string>>(new Map())
  // 大纲三态偏好（2026-09）：auto 跟随详情区宽，显式 on/off 覆盖（开关钮写入，跨会话记忆）
  const outlinePref = useAppStore((s) => s.previewOutline)
  const setOutlinePref = useAppStore((s) => s.setPreviewOutline)
  // 大纲宽（2026-09 分区拖拽）：拖拽会话临时宽（每帧内存态）；松手/双击提交 store 持久化
  const outlineStored = useAppStore((s) => s.outlineWidth)
  const [outlineDragPx, setOutlineDragPx] = useState<number | null>(null)
  const outlinePx = outlineDragPx ?? outlineStored
  const [wide, setWide] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    setImgMap(new Map())
    void (async () => {
      try {
        const { adapter, workspaceDir } = useAppStore.getState()
        const text = await adapter.readTextFile(info.mdPath)
        if (cancelled) return
        setState({ kind: 'text', text })
        if (workspaceDir === null) return
        const srcs = new Set(
          text
            .split('\n')
            .map((l) => extractImageMarker(l)?.src)
            .filter((s): s is string => s !== undefined),
        )
        const meta = await buildImageMetaFromSrcs(adapter, workspaceDir, srcs)
        if (!cancelled) setImgMap(new Map([...meta].map(([k, v]) => [k, v.dataUrl])))
      } catch {
        if (!cancelled) setState({ kind: 'error' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [info.mdPath])

  // 详情区宽判定：布局期先读 offsetWidth 定初值（免宽屏首帧闪隐），ResizeObserver
  // 跟踪后续（侧栏折叠/窗口缩放实时联动；观察详情区整体，见 OUTLINE_WIDE_MIN 注释）
  useLayoutEffect(() => {
    const el = rootRef.current
    if (el === null) return
    const apply = (w: number): void => setWide(w >= OUTLINE_WIDE_MIN)
    apply(el.offsetWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) apply(e.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const outlineVisible = outlinePref === 'on' || (outlinePref === 'auto' && wide)
  const headings = useMemo(() => (state.kind === 'text' ? mdOutline(state.text) : []), [state])

  /** 非正文占位（loading/error 分离，2026-09 友好化）：读取失败给说明与路径——
   *  预览不阻塞详情区，点左侧其他文件/目录即离开 */
  const placeholder =
    state.kind === 'error' ? (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <p className="text-base font-medium text-foreground">{t('library.fileDetail.previewFailedTitle')}</p>
        <p>{t('library.fileDetail.previewFailedBody')}</p>
        <p className="break-all text-xs">{toNativePath(info.mdPath)}</p>
      </div>
    ) : (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">…</div>
    )

  return (
    <div
      ref={rootRef}
      data-testid="file-detail"
      className="relative flex min-h-0 min-w-0 flex-1 bg-muted"
    >
      {state.kind === 'text' ? (
        <>
          <MarkdownPreview text={state.text} imgMap={imgMap} />
          {outlineVisible && (
            <OutlinePanel
              headings={headings}
              width={outlinePx ?? DEFAULT_OUTLINE_PX}
              onResize={setOutlineDragPx}
              onCommit={(w) => {
                setOutlineDragPx(null)
                void useAppStore.getState().setOutlineWidth(w)
              }}
              onReset={() => {
                setOutlineDragPx(null)
                void useAppStore.getState().setOutlineWidth(null)
              }}
            />
          )}
        </>
      ) : (
        placeholder
      )}
      {/* 大纲开关钮（常驻右上，不透明底防与滚动正文混叠）；首次点击即从 auto 转显式偏好。
          自带 TooltipProvider（同 ThemeFab——FileDetail 不在 SidebarProvider 上下文内） */}
      {state.kind === 'text' && (
        <div className="absolute right-2 top-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid="btn-outline-toggle"
                  aria-label={outlineVisible ? t('library.fileDetail.hideOutline') : t('library.fileDetail.showOutline')}
                  className="bg-background shadow-xs"
                  onClick={() => void setOutlinePref(outlineVisible ? 'off' : 'on')}
                >
                  <IconOutline />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{outlineVisible ? t('library.fileDetail.hideOutline') : t('library.fileDetail.showOutline')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </div>
  )
}
