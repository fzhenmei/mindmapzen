import { useState } from 'react'
import { createDir, type DirNode } from '../services/desk'
import { useAppStore } from '../store/appStore'
import { cn } from '../lib/utils'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'

interface Props {
  /** 待移动导图名（标题展示用） */
  mapName: string
  /** 工作区目录树（desk.readDirTree 产出） */
  tree: DirNode[]
  /** 导图当前所在目录（''=根）：作为移动目标被禁用（同目录无移动语义，服务层亦有守卫） */
  fromRel?: string
  onMove: (toRel: string) => void
  onCancel: () => void
}

/** 内嵌目录树行（M12b Task 5 换肤）：与案头左树（DirectoryTree ROW）同规格——
 *  32px 行高、等宽文件声道、青松悬停/选中；禁用项为当前所在层（灰且不可点） */
const TREE_ROW =
  'flex h-8 w-full cursor-pointer items-center overflow-hidden whitespace-nowrap rounded-md text-left font-file text-xs transition-colors duration-150 hover:bg-secondary hover:text-primary disabled:pointer-events-none disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-foreground'
const TREE_ROW_ACTIVE = 'bg-secondary text-primary'

/** 移动导图对话框（M12b Task 5 切 ui/dialog）：ui Dialog 外壳 + 目录树单选 + 新目录内联创建。
 *  树节点复用 `dir-node-<name>` testid（与案头左树同名，测试需 within(move-dialog) 圈定），
 *  根目录目标为 `dir-node-root`；新建目录 `move-newdir-input`/`move-newdir-add`——建在工作区根下，
 *  建成即自动选中（随后 move-confirm 可直接移入，外层会 reloadTree 纳入正式树） */
export default function MoveMapDialog({ mapName, tree, fromRel = '', onMove, onCancel }: Readonly<Props>) {
  const [selected, setSelected] = useState<string | null>(null)
  // 对话框内联建出的目录（建在工作区根下），暂存为可选项；移动后外层 reloadTree 由 props.tree 接管
  const [extraDirs, setExtraDirs] = useState<DirNode[]>([])
  const [newDirName, setNewDirName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const addNewDir = async () => {
    const name = newDirName.trim()
    if (name === '') return
    const { adapter, workspaceDir } = useAppStore.getState()
    try {
      await createDir(adapter, workspaceDir!, name)
      setExtraDirs((prev) => (prev.some((d) => d.path === name) ? prev : [...prev, { name, path: name, children: [] }]))
      setSelected(name)
      setNewDirName('')
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const renderNodes = (nodes: DirNode[], depth: number) =>
    nodes.map((n) => (
      <div key={n.path}>
        <button
          type="button"
          data-testid={`dir-node-${n.name}`}
          className={cn(TREE_ROW, selected === n.path && TREE_ROW_ACTIVE)}
          style={{ paddingLeft: 8 + depth * 14 }}
          disabled={n.path === fromRel}
          title={n.path === fromRel ? '已在当前目录' : n.path}
          onClick={() => setSelected(n.path)}
        >
          {n.name}
        </button>
        {n.children.length > 0 && renderNodes(n.children, depth + 1)}
      </div>
    ))

  const title = `移动「${mapName}」`
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent data-testid="move-dialog" aria-label={title} className="w-90 gap-3 p-5">
        <DialogTitle>{title}</DialogTitle>
        <div className="flex max-h-[40vh] flex-col gap-0.5 overflow-y-auto rounded-md border border-border p-1.5 font-file text-xs">
          <button
            type="button"
            data-testid="dir-node-root"
            className={cn(TREE_ROW, selected === '' && TREE_ROW_ACTIVE)}
            disabled={fromRel === ''}
            title={fromRel === '' ? '已在当前目录' : '移动到工作区根'}
            onClick={() => setSelected('')}
          >
            根目录
          </button>
          {renderNodes([...tree, ...extraDirs], 0)}
        </div>
        <div className="flex gap-1.5">
          <Input
            data-testid="move-newdir-input"
            className="min-w-0 flex-1"
            value={newDirName}
            placeholder="新目录名"
            onChange={(e) => setNewDirName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addNewDir()
            }}
          />
          <Button variant="secondary" size="sm" data-testid="move-newdir-add" onClick={() => void addNewDir()}>
            新建
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="secondary" size="sm" data-testid="move-cancel" onClick={onCancel}>
            取消
          </Button>
          <Button
            size="sm"
            data-testid="move-confirm"
            disabled={selected === null || selected === fromRel}
            onClick={() => onMove(selected!)}
          >
            移动
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
