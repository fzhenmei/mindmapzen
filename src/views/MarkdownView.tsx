// src/views/MarkdownView.tsx —— Markdown 视图浮层（2026-09 画布三态 M1）：只读文档视图，
// 数据源 = 内存树完整序列化（serialize 全量口径，不带 copySettings 剪裁——查看态要完整
// 文档，剪裁是复制出口的口径）。挂载即序列化 + data_change 订阅重算（Markdown 态开着时
// AI 面板可继续改图，显示不得陈旧）。浮层协议同 KanbanView：引擎画布不卸载（防 0×0
// resize 污染 + 保 undo 栈），原生 <dialog open> 非模态，z-[9] 低于砚栏 z-10（承重阶梯，
// 详见 KanbanView 头注释，同款适用）。Esc 回导图（!defaultPrevented 守卫同看板：吞掉
// Radix 已消费的 Esc）。大纲沿用案头 previewOutline/outlineWidth 偏好（M2 FileDetail
// 退役后此态是唯一消费方）。
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { engineTreeToZen, serialize } from '../services/mdTree'
import { collectMdImageSrcs, buildImageMetaFromSrcs } from '../services/imageAssets'
import { mdOutline } from '../services/mdOutline'
import { copyWechatHtmlFromMd } from '../services/wechatCopy'
import { showToast } from '../services/toast'
import type { WriteHtmlClipboard } from '../services/clipboard'
import type { MindMapHandle } from '../types/engine'
import type { LinkRegistry } from '../editor/linkRegistry'
import MarkdownPreview from '../components/MarkdownPreview'
import OutlinePanel from '../components/OutlinePanel'
import { IconCopy } from '../components/icons'
import { useOutlineAutoWidth } from '../hooks/useOutlineAutoWidth'

/** 大纲默认宽（px）＝案头 FileDetail 原值（M2 退役后此处唯一事实源） */
const DEFAULT_OUTLINE_PX = 224

export interface MarkdownViewProps {
  mmRef: RefObject<MindMapHandle | null>
  /** 连线净化注册表：serialize 的 linksByUid 来源（双链标记注入） */
  registry: LinkRegistry
  /** 富文本剪贴板端口（公众号格式 HTML，text/html）：App 注入（e2e web 模式记录到
   *  __zenE2e 桩），同 LibraryView 案头入口惯例——组件不得直取 Tauri 生产端口 */
  writeHtmlClipboard: WriteHtmlClipboard
  /** 大纲实际显隐上报（EditorView 转 ZenBar 大纲钮的 pressed 信号） */
  onOutlineVisibleChange(v: boolean): void
  onClose(): void
}

export default function MarkdownView({ mmRef, registry, writeHtmlClipboard, onOutlineVisibleChange, onClose }: Readonly<MarkdownViewProps>) {
  const { t } = useTranslation()
  const [md, setMd] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [copyBusy, setCopyBusy] = useState(false) // 公众号复制在途（防连点）
  const [imgMap, setImgMap] = useState<ReadonlyMap<string, string>>(new Map())
  const rootRef = useRef<HTMLDialogElement>(null)
  const wide = useOutlineAutoWidth(rootRef)

  // 大纲偏好（FileDetail 同款：auto 跟宽 / on / off；拖拽暂存宽 + 松手落盘）
  const outlinePref = useAppStore((s) => s.previewOutline)
  const outlineStored = useAppStore((s) => s.outlineWidth)
  const [outlineDragPx, setOutlineDragPx] = useState<number | null>(null)
  const outlinePx = outlineDragPx ?? outlineStored
  const outlineVisible = outlinePref === 'on' || (outlinePref === 'auto' && wide)

  // 显隐上报（effect 驱动，勿在渲染期调父回调）
  useEffect(() => {
    onOutlineVisibleChange(outlineVisible)
  }, [outlineVisible, onOutlineVisibleChange])

  /** 全量重算：内存树 → ZenNode → md（同步）。序列化可能抛错（Word 粘贴毒节点家族：
   *  换行/列表层正文断言）——出错误占位 + console 线索，不留无声空白 */
  const refresh = useCallback(() => {
    const mm = mmRef.current
    if (mm === null) return
    try {
      setMd(serialize(engineTreeToZen(mm.getData()).tree, registry.byUid, { display: true }))
      setFailed(false)
    } catch (e) {
      console.error('Markdown 视图序列化失败', e)
      setFailed(true)
    }
  }, [mmRef, registry])

  // 订阅：挂载即首算 + data_change 重算，卸载退订（refresh 引用恒定）
  useEffect(() => {
    const mm = mmRef.current
    refresh()
    mm?.on('data_change', refresh)
    return () => {
      mm?.off('data_change', refresh)
    }
  }, [mmRef, refresh])

  // 夺 body 焦点（tabIndex=-1）：引擎画布快捷键自此失活（KanbanView 同款）
  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  // 插图解析（异步，随 md 变化重收）：失败宽容空表 + console 线索（图挂了不出错误占位，
  // 正文照常渲染，img 原样占位——FileDetail 同口径）
  useEffect(() => {
    if (md === null) return
    let cancelled = false
    void (async () => {
      const { adapter, workspaceDir } = useAppStore.getState()
      if (workspaceDir === null) return
      try {
        const srcs = collectMdImageSrcs(md)
        const meta = await buildImageMetaFromSrcs(adapter, workspaceDir, srcs)
        if (!cancelled) setImgMap(new Map([...meta].map(([k, v]) => [k, v.dataUrl])))
      } catch (e) {
        console.error('Markdown 视图插图解析失败', e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [md])

  const headings = useMemo(() => (md !== null ? mdOutline(md) : []), [md])

  /** 复制为公众号格式：喂当前显示形态 md（内存树序列化，含未保存修改——所见即所
   *  复制；与案头右键同链，仅数据源不同）。失败走轻提示 + console 双出口（编辑器
   *  路由无 error 横幅渲染，toast 是编辑器侧显式出口惯例——篮子分拣同款） */
  const handleCopyWechat = useCallback(() => {
    if (md === null || copyBusy) return
    setCopyBusy(true)
    const { adapter, workspaceDir } = useAppStore.getState()
    void copyWechatHtmlFromMd(adapter, workspaceDir, md, writeHtmlClipboard)
      .then(() => showToast(t('editor.markdown.copiedToast')))
      .catch((e: unknown) => {
        console.error('复制为公众号格式失败', e)
        showToast(t('editor.markdown.copyWechatFailed', { reason: String(e) }))
      })
      .finally(() => setCopyBusy(false))
  }, [md, copyBusy, writeHtmlClipboard, t])

  return (
    <dialog
      ref={rootRef}
      open
      tabIndex={-1}
      aria-label={t('editor.markdown.viewName')}
      data-testid="markdown-view"
      className="absolute inset-0 z-[9] m-0 flex h-full max-h-none w-full max-w-none flex-col border-0 bg-background p-0 text-foreground outline-none"
      onKeyDown={(e) => {
        // Esc 守卫同看板（承重结构勿删）：Radix DismissableLayer 在 capture 阶段
        // preventDefault 的 Esc 不误关（详情见 KanbanView 同段注释）
        if (e.key === 'Escape' && !e.defaultPrevented) onClose()
      }}
    >
      {failed ? (
        <div data-testid="markdown-view-error" className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
          <p className="text-base font-medium text-foreground">{t('editor.markdown.renderFailTitle')}</p>
          <p>{t('editor.markdown.renderFailBody')}</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* 预览区外套 relative：复制钮浮于预览区右上角——大纲面板显示时天然让位
              到面板左侧，不遮挡其条目（按钮属预览区，不属整视图） */}
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            {md !== null && <MarkdownPreview text={md} imgMap={imgMap} />}
            <button
              type="button"
              data-testid="btn-copy-wechat"
              disabled={copyBusy || md === null}
              onClick={handleCopyWechat}
              className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg bg-card px-3 py-1.5 text-sm text-foreground shadow-lg hover:bg-accent disabled:pointer-events-none disabled:opacity-60"
            >
              <IconCopy />
              {t('editor.markdown.copyWechat')}
            </button>
          </div>
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
        </div>
      )}
    </dialog>
  )
}
