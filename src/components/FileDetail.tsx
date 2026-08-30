import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { formatFileSize } from '../services/fileSize'
import type { MapInfo } from '../types/files'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 pt-4 pb-2">
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
          <Button type="button" variant="ghost" size="sm" data-testid="btn-detail-back" onClick={onBack}>
            返回目录
          </Button>
          <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
          <Button
            type="button"
            size="sm"
            data-testid="btn-detail-open"
            onClick={() => void useAppStore.getState().openMap(info.mdPath)}
          >
            打开
          </Button>
        </div>
      </div>
      {/* 预览区：md 内容自渲染；muted 顶面区块与摘要条分层（一沉一浮） */}
      <div className="mx-6 mb-6 min-h-0 flex-1 overflow-hidden rounded-lg bg-card">
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
