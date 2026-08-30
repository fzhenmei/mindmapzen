import { useEffect, useState, type ReactNode } from 'react'
import { useAppStore } from '../store/appStore'
import { parse } from '../services/mdTree'
import { stripMarkers } from '../services/linkMarkers'
import type { ZenNode } from '../types/tree'

/** 预览状态：未选择 / 载入中 / 读取或解析失败 / 大纲就绪 */
type PreviewState =
  | { kind: 'empty' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'tree'; tree: ZenNode }

/** 未就绪提示文案（查表替代嵌套三元，Sonar S3358；tree 态不渲染提示） */
const HINTS: Record<PreviewState['kind'], string> = {
  empty: '选择导图预览',
  loading: '…',
  error: '无法预览',
  tree: '',
}

interface Props {
  /** 当前选中导图的 md 路径（null = 未选择） */
  mdPath: string | null
}

/** 大纲预览区（M5d spec §3 案头右列 → M12b「档案卡」）：卡片或树文件单击选中后显示导图大纲。
 *  M12b 案头三区：280px 固定卡片（rounded-lg 边框 + surface 底），等宽头（文件名）+ 等宽大纲。
 *  数据源 adapter.readTextFile + parse（不做引擎实例）；节点文本按连线净化规则隐藏 [[..]]
 *  （与画布显示层同口径，复用 stripMarkers）；有备注行尾 ✎ 角标、层级缩进 14px、等宽字。
 *  读取/解析失败显示「无法预览」，底部「打开」按钮仍可用（双击手势差异的兜底） */
export default function PreviewPane({ mdPath }: Readonly<Props>) {
  const [state, setState] = useState<PreviewState>({ kind: 'empty' })

  useEffect(() => {
    if (mdPath === null) {
      setState({ kind: 'empty' })
      return
    }
    let cancelled = false
    setState({ kind: 'loading' })
    void (async () => {
      try {
        const md = await useAppStore.getState().adapter.readTextFile(mdPath)
        if (cancelled) return
        const r = parse(md)
        setState(r.ok ? { kind: 'tree', tree: r.tree } : { kind: 'error' })
      } catch {
        if (!cancelled) setState({ kind: 'error' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mdPath])

  /** 展平渲染（每行绝对缩进 depth×14px，不做嵌套 DOM——缩进即层级） */
  const rows: ReactNode[] = []
  if (state.kind === 'tree') {
    const walk = (node: ZenNode, depth: number, key: string) => {
      rows.push(
        <div
          key={key}
          className="preview-row flex items-baseline gap-1 overflow-hidden text-muted-foreground"
          style={{ paddingLeft: depth * 14 }}
        >
          <span className="min-w-0 flex-1 truncate">{stripMarkers(node.text)}</span>
          {node.note !== undefined && node.note !== '' && (
            <span className="shrink-0 text-primary" title="有备注">
              ✎
            </span>
          )}
        </div>,
      )
      node.children.forEach((c, i) => walk(c, depth + 1, `${key}/${i}`))
    }
    walk(state.tree, 0, '0')
  }

  // 档案卡等宽头：md 路径取基名去扩展（与卡片名同口径，纯展示派生，无数据流变更）
  const fileName = mdPath?.split(/[\\/]/).pop()?.replace(/\.md$/, '')
  const hint = HINTS[state.kind]

  return (
    <aside
      className="flex w-[280px] shrink-0 flex-col gap-3 rounded-lg border border-border bg-card p-3"
      data-testid="preview-pane"
    >
      {fileName !== undefined && (
        <div className="truncate font-file text-xs text-muted-foreground" title={fileName}>
          {fileName}
        </div>
      )}
      {state.kind === 'tree' ? (
        <div
          className="min-h-0 flex-1 overflow-y-auto font-file text-xs leading-6"
          data-testid="preview-outline"
        >
          {rows}
        </div>
      ) : (
        <p className="pt-2 text-xs text-muted-foreground">{hint}</p>
      )}
      {mdPath !== null && (
        <button
          type="button"
          data-testid="btn-preview-open"
          className="inline-flex h-8 w-full shrink-0 cursor-pointer items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90"
          onClick={() => void useAppStore.getState().openMap(mdPath)}
        >
          打开
        </button>
      )}
    </aside>
  )
}
