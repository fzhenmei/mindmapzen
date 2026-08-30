import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { formatFileSize } from '../services/fileSize'
import type { MapInfo } from '../types/files'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
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

/** 案头文件详情态（M15 → 官方 Card 解剖）：CardHeader = 标题（CardTitle）+ 元信息
 *  （CardDescription）+ 按钮组（CardAction 官方右上动作位）；CardContent = markdown
 *  渲染区。滚动区 edge-to-edge：CardContent 以 -mx-6 抵消官方 px-6 卡内距（官方文档
 *  `-mx-(--card-spacing)` 技巧的现行等价物——卡内距即 px-6，--card-spacing 变量尚未
 *  落进官方源码），滚动条贴卡边；Card 根压 pb-0 让内容区延到卡底（垂直同口径，
 *  尾距由 MarkdownPreview 自带 pb-6 承担）。读取失败时卡头仍完整（元数据来自 store），
 *  预览区显示「无法预览」——打开按钮兜底 */
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
    // file-detail testid 兼作视觉冒烟回归锁（borderColor 必须等于 --border，防 currentColor 复发）
    <Card data-testid="file-detail" className="flex min-h-0 min-w-0 flex-1 pb-0">
      <CardHeader>
        <CardTitle className="truncate font-file text-base" title={`${info.name}.md`}>
          {info.name}.md
        </CardTitle>
        <CardDescription className="flex flex-wrap gap-x-3 font-file text-xs">
          <span>{info.relDir === '' ? '根' : info.relDir}</span>
          <span data-testid="detail-size">{formatFileSize(info.size)}</span>
          <span title={`创建 ${dt(info.createdAt)}`}>创建 {dt(info.createdAt)}</span>
          <span title={`修改 ${dt(info.modifiedAt)}`}>修改 {dt(info.modifiedAt)}</span>
        </CardDescription>
        <CardAction>
          <div className="flex items-center gap-1">
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
        </CardAction>
      </CardHeader>
      <CardContent className="-mx-6 flex min-h-0 flex-1 flex-col">
        {state.kind === 'text' ? (
          <MarkdownPreview text={state.text} />
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
            {state.kind === 'loading' ? '…' : '无法预览'}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
