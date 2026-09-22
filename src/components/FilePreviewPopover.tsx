// src/components/FilePreviewPopover.tsx —— 案头悬浮预览小窗（2026-09 画布三态 M2）：
// FileDetail 详情态退役后的轻量承接——单击文件行浮现于右区右上角（不锚定文件行：
// 侧栏可滚动，动态锚定复杂且易遮左树），双击照旧开画布（导图态起步，交互在树行）。
// 读取管线迁自 FileDetail（真实 md + 插图 dataURL + 失败兜底），轻量无大纲——大纲
// 唯一入口在画布 Markdown 态（spec §4.2）。关窗三路：Esc（非输入域守卫——案头搜索
// 框的 Esc 属搜索框）/ document mousedown 落浮窗外 / 头部关闭钮；选中其他文件由
// 宿主换 info 重读（内容切换非叠加）。不透明实底（可视性教训红线）。
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { buildImageMetaFromSrcs, collectMdImageSrcs } from '../services/imageAssets'
import { mdBodyUnwrapForDisplay } from '../services/mdTree'
import { toNativePath } from '../services/nativePath'
import type { MapInfo } from '../types/files'
import MarkdownPreview from './MarkdownPreview'
import { IconWinClose } from './icons'

export interface FilePreviewPopoverProps {
  info: MapInfo
  onClose(): void
}

type DetailState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'text'; text: string }

export default function FilePreviewPopover({ info, onClose }: Readonly<FilePreviewPopoverProps>) {
  const { t } = useTranslation()
  const [state, setState] = useState<DetailState>({ kind: 'loading' })
  const [imgMap, setImgMap] = useState<ReadonlyMap<string, string>>(new Map())
  const rootRef = useRef<HTMLDialogElement>(null)

  // 读取与插图解析（迁自 FileDetail:51-74，口径不变：主读取失败出 error 占位；
  // 插图失败宽容空表——图挂了不出错误占位，img 原样占位）
  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    setImgMap(new Map())
    void (async () => {
      try {
        const { adapter, workspaceDir } = useAppStore.getState()
        // 显示形态剥正文包装层(2026-09-22 防炸配套):贴来的标题按标题预览,不是引用
        const text = mdBodyUnwrapForDisplay(await adapter.readTextFile(info.mdPath))
        if (cancelled) return
        setState({ kind: 'text', text })
        if (workspaceDir === null) return
        const srcs = collectMdImageSrcs(text)
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

  // 关窗①：mousedown 落浮窗外。左树文件行豁免（spec §4.1 真实事件序，2026-09 评审
  // 修复）：文件行真实点击 = mousedown→click，若此处先关（清选中），随后的 click 里
  // toggle 落在 null 上必重开——「再点同一文件关窗」在真机失效。豁免后关窗语义交给
  // 随后的 click：同文件 = selectFile toggle 关、异文件 = 内容切换
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (e.target instanceof Element && e.target.closest('[data-tree-file-row]') !== null) return
      const root = rootRef.current
      if (root !== null && e.target instanceof Node && !root.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  // 关窗②：Esc 非输入域（守卫同编辑器快捷键族——案头搜索框的 Esc 不被截获）。
  // !defaultPrevented 承重守卫勿删（同 KanbanView/MarkdownView 先例）：Radix
  // DismissableLayer（右键菜单等）在 ownerDocument capture 阶段消费 Escape 时调原生
  // preventDefault()，事件仍冒泡到本 window 监听——浮窗与 Radix 浮层同开按 Esc 只关其一，
  // 已被消费的 Esc 不在此误关
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const tgt = e.target
      if (tgt instanceof Element && tgt.closest('input, textarea, [contenteditable="true"]')) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /** 三态体（Sonar S3358 拆分，语义零变化）：主读取失败 → 错误占位（说明 + 路径）；
   *  成功 → 正文预览；读取中 → 省略占位 */
  const renderBody = () => {
    if (state.kind === 'error')
      return (
        <div data-testid="file-preview-error" className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
          <p className="text-base font-medium text-foreground">{t('library.fileDetail.previewFailedTitle')}</p>
          <p>{t('library.fileDetail.previewFailedBody')}</p>
          <p className="break-all text-xs">{toNativePath(info.mdPath)}</p>
        </div>
      )
    if (state.kind === 'text') return <MarkdownPreview text={state.text} imgMap={imgMap} />
    return <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">…</div>
  }

  return (
    // 右区右上角：挂 main（宿主已加 relative）；w-120=480px / max-h-[70vh]（spec §4.2）。
    // z-20 高于内容与 ThemeFab（右下角，不冲突），低于 App 级 Radix portal 对话框。
    // 原生 <dialog open> 非模态（S6819，同 KanbanView/MarkdownView 先例）：不抢焦点、
    // 不触发原生 cancel；UA 默认样式须压平——m-0/p-0/max-w-none 杀边距与自适应宽，
    // text-foreground 杀 UA color:canvastext（头部 h3 无显式色类，显式主题与系统偏好
    // 相反时对比度才不出错，对齐先例）；left-auto 必加（UA 设 left:0，与 top-2 right-2
    // over-constrained，LTR 下 left 胜出会把浮窗钉到左缘；先例全屏 inset-0 无此问题，
    // 本例右上角定位必须杀 left）
    <dialog
      ref={rootRef}
      open
      tabIndex={-1}
      data-testid="file-preview-popover"
      className="absolute top-2 right-2 left-auto z-20 m-0 flex max-h-[70vh] w-120 max-w-none flex-col overflow-hidden rounded-lg border bg-card p-0 text-foreground shadow-lg outline-none"
      aria-label={`${info.name}.md`}
    >
      <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium" title={`${info.name}.md`}>{info.name}.md</h3>
        <button
          type="button"
          data-testid="btn-preview-close"
          aria-label={t('library.fileDetail.closePreview')}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={onClose}
        >
          <IconWinClose size={14} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{renderBody()}</div>
    </dialog>
  )
}
