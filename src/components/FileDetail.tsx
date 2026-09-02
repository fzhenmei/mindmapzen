import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { buildImageMetaFromSrcs } from '../services/imageAssets'
import { extractImageMarker } from '../services/imageMarkers'
import type { MapInfo } from '../types/files'
import MarkdownPreview from './MarkdownPreview'

interface Props {
  /** 当前选中的导图（预览数据源） */
  info: MapInfo
}

type DetailState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'text'; text: string }

/** 案头文件详情态预览面板（容器合并改版）：原 Card 骨架已拆——卡头（标题/六枚
 *  动作钮）上移 LibraryView 主容器页首，卡脚元信息并入页首标题 tooltip，本组件
 *  只剩「读文件 + 插图解析 + markdown 渲染 + loading/error 兜底」。file-detail
 *  testid 挂预览容器（兼容既有 E2E/vitest）。bg-muted 下陷底铺满主区，贴
 *  SidebarInset 圆角边（inset 骨架 overflow-hidden 承接裁切） */
export default function FileDetail({ info }: Readonly<Props>) {
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

  return (
    <div data-testid="file-detail" className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted">
      {state.kind === 'text' ? (
        <MarkdownPreview text={state.text} imgMap={imgMap} />
      ) : (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          {state.kind === 'loading' ? '…' : '无法预览'}
        </div>
      )}
    </div>
  )
}
