// src/components/WorkbenchCard.tsx —— 工作台跨图任务卡（spec §4）：看板卡视觉口径
// 同源（KanbanCard 风格），新增来源图徽标；只读——无拖拽无菜单，单击即跳转。
import type { WorkTask } from '../services/workbench'

interface Props {
  task: WorkTask
  onOpen(task: WorkTask): void
}

export default function WorkbenchCard({ task, onOpen }: Readonly<Props>) {
  const path = task.dirRel === '' ? task.path.join(' / ') : [task.dirRel, ...task.path].join(' / ')
  return (
    <button
      type="button"
      data-testid="workbench-card"
      className="w-full rounded-md border bg-card px-3 py-2 text-left text-sm shadow-sm transition-colors hover:bg-muted"
      onClick={() => onOpen(task)}
    >
      <span className="mb-1 inline-block rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{task.mapName}</span>
      <span className="block truncate font-medium">{task.text}</span>
      {path !== '' && <span className="block truncate text-xs text-muted-foreground">{path}</span>}
      {task.childCount > 0 && <span className="text-xs text-muted-foreground">+{task.childCount}</span>}
    </button>
  )
}
