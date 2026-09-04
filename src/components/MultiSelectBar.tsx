// src/components/MultiSelectBar.tsx —— 多选浮条（2026-09 圈选批量操作）：圈选/Ctrl 多选超过一个
// 节点时出现，显示已选计数 + 删除按钮（REMOVE_NODE 删全部激活节点及子树，可 Ctrl+Z 撤销，
// 免确认）。定位于砚栏正上方（砚栏 bottom-3 h-10 → 本条 bottom-[68px]），z-8 与节点浮动条同级、
// 低于砚栏 z-10。纯展示组件：计数/显隐状态在 useActiveSelection.activeCount 与父级，不单测
// （E2E 覆盖，同 NodeActions 惯例）。
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { IconTrash } from './icons'

interface Props {
  /** 当前激活（选中）节点数（父级保证 > 1 才渲染本组件） */
  count: number
  /** 删除全部所选节点（含子树）；引擎 REMOVE_NODE 无参即删 activeNodeList，一条撤销记录 */
  onDelete(): void
}

export default function MultiSelectBar({ count, onDelete }: Readonly<Props>) {
  return (
    <div
      data-testid="multi-select-bar"
      className="absolute bottom-[68px] left-1/2 z-[8] flex -translate-x-1/2 items-center gap-0.5 rounded-lg bg-card py-1 pl-2.5 pr-1 shadow-md"
    >
      <span className="whitespace-nowrap px-1 text-sm text-muted-foreground">已选 {count} 个节点</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="multi-select-delete"
            aria-label={`删除所选 ${count} 个节点`}
            onClick={onDelete}
          >
            <IconTrash />
            删除
          </Button>
        </TooltipTrigger>
        <TooltipContent>删除所选节点及子树（Del 同效，Ctrl+Z 可撤销）</TooltipContent>
      </Tooltip>
    </div>
  )
}
