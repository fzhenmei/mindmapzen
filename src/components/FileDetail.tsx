import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { formatFileSize } from '../services/fileSize'
import type { MapInfo } from '../types/files'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { IconArrowLeft, IconOpen } from './icons'
import MarkdownPreview from './MarkdownPreview'

interface Props {
  /** 当前选中的导图（信息条数据源） */
  info: MapInfo
  /** 返回目录视图（回到该图所在目录的资源管理器态） */
  onBack(): void
}

type DetailState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'text'; text: string }

/** 案头文件详情态（M15）：上层摘要条（名称/所在层/创建/修改/大小 + 返回/打开），
 *  下层真实 markdown 预览（MarkdownPreview 渲染，原文即所存 .md）。读取失败时
 *  摘要条仍完整（元数据来自 store），预览区显示「无法预览」——打开按钮兜底 */
export default function FileDetail({ info, onBack }: Readonly<Props>) {
  const [state, setState] = useState<DetailState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    void (async () => {
      try {
        const text = await useAppStore.getState().adapter.readTextFile(info.mdPath)
        if (!cancelled) setState({ kind: 'text', text })
      } catch {
        if (!cancelled) setState({ kind: 'error' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [info.mdPath])

  const dt = (ms: number) => new Date(ms).toLocaleString('zh-CN')

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="file-detail">
      {/* 摘要条：文件事实一屏可读（等宽文件声道）；底无线——上下层分区由预览区
          的 md 内容自身承担，摘要条用留白收尾 */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 px-6 pt-4 pb-2">
        <span className="font-file text-sm font-semibold" title={`${info.name}.md`}>
          {info.name}.md
        </span>
        <span className="font-file text-xs text-muted-foreground">
          {info.relDir === '' ? '根' : info.relDir}
        </span>
        <span className="font-file text-xs text-muted-foreground" data-testid="detail-size">
          {formatFileSize(info.size)}
        </span>
        <span className="font-file text-xs text-muted-foreground" title={`创建 ${dt(info.createdAt)}`}>
          创建 {dt(info.createdAt)}
        </span>
        <span className="font-file text-xs text-muted-foreground" title={`修改 ${dt(info.modifiedAt)}`}>
          修改 {dt(info.modifiedAt)}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {/* 图标钮（M15 验收）：ghost 返回 / 实底打开（主动作），Tooltip 承担文字语义 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                data-testid="btn-detail-back"
                aria-label="返回目录"
                onClick={onBack}
              >
                <IconArrowLeft />
              </Button>
            </TooltipTrigger>
            <TooltipContent>返回目录</TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                data-testid="btn-detail-open"
                aria-label="打开导图"
                onClick={() => void useAppStore.getState().openMap(info.mdPath)}
              >
                <IconOpen />
              </Button>
            </TooltipTrigger>
            <TooltipContent>打开导图</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {/* 预览区：md 内容自渲染；包裹边框线（M15 验收）+ 白卡面与摘要条分层。
          flex flex-col 使内层 md-preview 的 flex-1 生效（否则内容自然高度撑破
          overflow-hidden 被裁，滚动条无从出现——验收：大文件看不全的根因）。
          testid 为视觉冒烟回归锁（borderColor 必须等于 --border，防 currentColor 复发） */}
      <div
        data-testid="detail-preview-frame"
        className="mx-6 mb-6 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card"
      >
        {state.kind === 'text' ? (
          <MarkdownPreview text={state.text} />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            {state.kind === 'loading' ? '…' : '无法预览'}
          </div>
        )}
      </div>
    </div>
  )
}
