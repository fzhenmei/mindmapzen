import { useState } from 'react'
import ZenDialog from './ZenDialog'
import { createDir, type DirNode } from '../services/desk'
import { useAppStore } from '../store/appStore'

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

/** 移动导图对话框：ZenDialog 外壳 + 目录树单选 + 新目录内联创建。
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
          className={selected === n.path ? 'dir-node active' : 'dir-node'}
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

  return (
    <ZenDialog
      testid="move-dialog"
      title={`移动「${mapName}」`}
      onClose={onCancel}
      actions={
        <>
          <button type="button" data-testid="move-cancel" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            data-testid="move-confirm"
            disabled={selected === null || selected === fromRel}
            onClick={() => onMove(selected!)}
          >
            移动
          </button>
        </>
      }
    >
      <div className="dir-tree move-tree">
        <button
          type="button"
          data-testid="dir-node-root"
          className={selected === '' ? 'dir-node active' : 'dir-node'}
          disabled={fromRel === ''}
          title={fromRel === '' ? '已在当前目录' : '移动到工作区根'}
          onClick={() => setSelected('')}
        >
          根目录
        </button>
        {renderNodes([...tree, ...extraDirs], 0)}
      </div>
      <div className="move-newdir">
        <input
          data-testid="move-newdir-input"
          value={newDirName}
          placeholder="新目录名"
          onChange={(e) => setNewDirName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void addNewDir()
          }}
        />
        <button type="button" data-testid="move-newdir-add" onClick={() => void addNewDir()}>
          新建
        </button>
      </div>
      {error && <p className="error-detail">{error}</p>}
    </ZenDialog>
  )
}
