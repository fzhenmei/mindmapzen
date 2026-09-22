// src/hooks/useNodeSearch.ts —— 节点搜索状态源（2026-09）：浮层开合 + 打开时拍全树候选
// 快照（flattenNodeHits 含收起隐藏子树——收起的节点也能搜到）+ 跳转组合。
// pick 定位链两段：locate 是宿主的 EditorView.locateNode（切回导图态 + expandToUid 展开
// 收起祖先 + centerNodeOnRender 居中，看板回导图同源）；激活高亮用 execOnRenderNode
// 寻址落 SET_NODE_ACTIVE（渲染树 miss 时等重渲有限重试——收起分支首跳不丢；该命令在
// AI 回合锁白名单，回合中亦可「只读观光」定位，同看板语义）。浮层跳转后保持
//（连续 Enter 跳下一处），Esc 关——关合语义在 NodeSearchDialog/radix。
import { useCallback, useState, type RefObject } from 'react'
import { execOnRenderNode } from '../services/statusOps'
import { flattenNodeHits, type NodeHit } from '../services/nodeSearch'
import type { MindMapHandle } from '../types/engine'

interface Params {
  mmRef: RefObject<MindMapHandle | null>
  /** 跳转定位（EditorView.locateNode：切回导图态 + 展开收起祖先 + 居中） */
  locate(uid: string): void
}

export function useNodeSearch({ mmRef, locate }: Readonly<Params>) {
  const [open, setOpen] = useState(false)
  const [hits, setHits] = useState<NodeHit[]>([])

  /** 呼出（Ctrl+F / 砚栏搜索钮）：打开即拍当前全树快照——浮层存续期的编辑不进列表
   *  （重开重拍，简单可预期）；引擎未就绪拍空列表出空态，不崩 */
  const openSearch = useCallback((): void => {
    setHits(flattenNodeHits(mmRef.current?.renderer?.renderTree))
    setOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mmRef 是 ref 恒稳；locate 为视图级闭包（每渲染重建 pick 已取最新）
  }, [])

  const close = useCallback((): void => setOpen(false), [])

  /** 跳转（Enter/点击条目）：定位 + 激活高亮 */
  const pick = useCallback((uid: string): void => {
    locate(uid)
    const mm = mmRef.current
    if (mm !== null) {
      execOnRenderNode(mm, uid, '搜索定位高亮', (node) => mm.execCommand('SET_NODE_ACTIVE', node, true))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mmRef/locate 见 openSearch 注
  }, [locate])

  return { open, hits, openSearch, close, pick }
}
