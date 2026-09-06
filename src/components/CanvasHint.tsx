import { useTranslation } from 'react-i18next'
import type { EngineNode } from '../types/engine'
import { countTree } from '../hooks/useMapStats'

interface Props {
  /** 打开时解析的初始树（EditorView state，打开即定） */
  tree: EngineNode | null
  /** 引擎计数（data_change 快照重数，初值 0 待首次事件） */
  nodeCount: number
}

/** 空图引导（2026-09 UI 评审 P2-2，自 EditorView 拆出——行数护栏）：初始树仅根节点时
 *  画布左上角轻提示建节点快捷键——在需要处教学、每张空图都在，不依赖漫游引导（一次性，
 *  其 10 步未覆盖键盘建节点）。双条件防误显：初始树计数（tree，打开即定）排除大图
 *  （nodeCount 初值 0 的窗口期不误显）；nodeCount 令加出第 2 个节点即隐去（删回单节点
 *  复现，教学再触发可接受）。pointer-events-none 不挡画布交互 */
export default function CanvasHint({ tree, nodeCount }: Readonly<Props>) {
  const { t } = useTranslation()
  if (tree === null || countTree(tree) > 1 || nodeCount > 1) return null
  return (
    <p
      data-testid="canvas-hint"
      className="pointer-events-none absolute top-4 left-4 z-[5] text-xs text-muted-foreground"
    >
      {t('editor.canvas.emptyHint')}
    </p>
  )
}
