import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { formatFileSize } from '../services/fileSize'
import { buildImageMetaFromSrcs } from '../services/imageAssets'
import { extractImageMarker } from '../services/imageMarkers'
import type { MapInfo } from '../types/files'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card'
import { IconArrowLeft, IconFolder, IconOpen, IconPencil, IconTrash } from './icons'
import type { MapAction } from './FileExplorer'
import MarkdownPreview from './MarkdownPreview'

interface Props {
  /** 当前选中的导图（信息条数据源） */
  info: MapInfo
  /** 返回目录视图（回到该图所在目录的资源管理器态） */
  onBack(): void
  /** 悬停操作（M16 详情态补全，与资源管理器 tile 同构）：移动/重命名/删除，对话框流在 LibraryView */
  onAction(a: MapAction, m: MapInfo): void
}

type DetailState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'text'; text: string }

/** 案头文件详情态（M15 → 官方 Card 解剖）：CardHeader = 标题（CardTitle）+ 按钮组
 *  （CardAction 官方右上动作位），仅一行、上下距压至 py-2（卡根 py-0 抵官方 py-6，
 *  [.border-b]:pb-6 压至 pb-2）；CardContent = markdown 渲染区；元信息（目录/大小/
 *  创建/修改）不重要，下沉 CardFooter 低调呈示（muted 小字，卡脚 bg-card 与 muted
 *  内容区自然分界）。分节（验收）：CardHeader 加 border-b 分割，内容区 bg-muted 下陷
 *  底与卡头/卡脚（bg-card）区分。滚动区 edge-to-edge：CardContent 以 -mx-6 抵消官方
 *  px-6 卡内距（官方文档 `-mx-(--card-spacing)` 技巧的现行等价物——卡内距即 px-6，
 *  --card-spacing 变量尚未落进官方源码），滚动条与 muted 底贴卡边；Card 根压 py-0 +
 *  overflow-hidden，首尾距由卡头/卡脚各自的 py-2 承担。读取失败时卡头仍完整（元数据
 *  来自 store），预览区显示「无法预览」——打开按钮兜底 */
export default function FileDetail({ info, onBack, onAction }: Readonly<Props>) {
  const [state, setState] = useState<DetailState>({ kind: 'loading' })
  // 插图解析表（M19）：md 行级收集 ![alt](src) → 字节转 dataURL（预览渲染用；
  // webview 解析不了工作区相对路径）。失败宽容空表（img 原样渲染为占位）
  const [imgMap, setImgMap] = useState<ReadonlyMap<string, string>>(new Map())

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

  const dt = (ms: number) => new Date(ms).toLocaleString('zh-CN')

  return (
    // file-detail testid 兼作视觉冒烟回归锁（borderColor 必须等于 --border，防 currentColor 复发）；
    // gap-0 压掉官方节间 gap-6（验收：底线与 muted 内容区之间的白色间隙去掉）；
    // py-0 抵官方卡根 py-6（上下首尾距改由卡头/卡脚自管，布局紧凑）；
    // overflow-hidden 让 muted 内容区不戳出底部圆角
    <Card data-testid="file-detail" className="flex min-h-0 min-w-0 flex-1 gap-0 overflow-hidden py-0">
      {/* border-b 分割线；py-2 紧凑上下距（官方 [.border-b]:pb-6 条件类压至 pb-2），
          gap-0 压官方行间 gap-2（描述行已移卡脚，空 grid 行不再漏高） */}
      <CardHeader className="gap-0 border-b py-2 [.border-b]:pb-2">
        <CardTitle className="truncate font-file text-base" title={`${info.name}.md`}>
          {info.name}.md
        </CardTitle>
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
            {/* 详情态就地操作（M16 补全，testid 与资源管理器 tile 同名——两态互斥渲染不冲突） */}
            {(
              [
                ['btn-move', '移动到目录', IconFolder, 'move'],
                ['btn-rename', '重命名', IconPencil, 'rename'],
                ['btn-delete', '删除', IconTrash, 'delete'],
              ] as const
            ).map(([testid, label, Icon, action]) => (
              <Tooltip key={testid}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    data-testid={testid}
                    aria-label={label}
                    onClick={() => onAction(action, info)}
                  >
                    <Icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            ))}
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
      {/* bg-muted 下陷底与卡头/卡脚区分；-mx-6 edge-to-edge 使 muted 底铺满卡宽、贴卡边 */}
      <CardContent className="-mx-6 flex min-h-0 flex-1 flex-col bg-muted">
        {state.kind === 'text' ? (
          <MarkdownPreview text={state.text} imgMap={imgMap} />
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
            {state.kind === 'loading' ? '…' : '无法预览'}
          </div>
        )}
      </CardContent>
      {/* 元信息下沉卡脚：不重要 → muted 小字低调呈示（title 悬停看完整时间） */}
      <CardFooter className="gap-x-3 py-2 font-file text-[11px] text-muted-foreground">
        <span>{info.relDir === '' ? '根' : info.relDir}</span>
        <span data-testid="detail-size">{formatFileSize(info.size)}</span>
        <span title={`创建 ${dt(info.createdAt)}`}>创建 {dt(info.createdAt)}</span>
        <span title={`修改 ${dt(info.modifiedAt)}`}>修改 {dt(info.modifiedAt)}</span>
      </CardFooter>
    </Card>
  )
}
