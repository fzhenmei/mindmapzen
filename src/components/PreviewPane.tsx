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

interface Props {
  /** 当前选中导图的 md 路径（null = 未选择） */
  mdPath: string | null
}

/** 大纲预览区（M5d spec §3 案头右列）：卡片或树文件单击选中后显示导图大纲树。
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
        <div key={key} className="preview-row" style={{ paddingLeft: depth * 14 }}>
          <span className="preview-text">{stripMarkers(node.text)}</span>
          {node.note !== undefined && node.note !== '' && (
            <span className="preview-note" title="有备注">
              ✎
            </span>
          )}
        </div>,
      )
      node.children.forEach((c, i) => walk(c, depth + 1, `${key}/${i}`))
    }
    walk(state.tree, 0, '0')
  }

  return (
    <aside className="preview-panel" data-testid="preview-pane">
      {state.kind === 'tree' ? (
        <div className="preview-outline" data-testid="preview-outline">
          {rows}
        </div>
      ) : (
        <p className="preview-hint">
          {state.kind === 'empty' ? '选择导图预览' : state.kind === 'loading' ? '…' : '无法预览'}
        </p>
      )}
      {mdPath !== null && (
        <button
          type="button"
          data-testid="btn-preview-open"
          className="btn-primary"
          onClick={() => void useAppStore.getState().openMap(mdPath)}
        >
          打开
        </button>
      )}
    </aside>
  )
}
