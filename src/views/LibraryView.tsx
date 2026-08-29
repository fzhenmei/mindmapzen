import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { deleteMap, renameMap } from '../services/workspace'
import { commitImport } from '../services/importMap'
import { createDir, moveMap, readDirTree, type DirNode } from '../services/desk'
import { parse } from '../services/mdTree'
import { describeIgnoredType } from '../services/ignoredType'
import NameDialog from '../components/NameDialog'
import ZenDialog from '../components/ZenDialog'
import ThemeToggle from '../components/ThemeToggle'
import DirectoryTree from '../components/DirectoryTree'
import MoveMapDialog from '../components/MoveMapDialog'
import { IconFolder, IconPencil, IconTrash } from '../components/icons'
import type { MapInfo } from '../types/files'
import type { IgnoredBlock, ZenNode } from '../types/tree'

interface Props {
  pickDirectory: () => Promise<string | null>
  /** 选择外部 .md 文件：生产为 Tauri 对话框单选 + adapter 读取，测试注入桩；取消返回 null */
  pickMdFile: () => Promise<{ name: string; text: string } | null>
}

/** 导入预览挂起态：解析成功但存在忽略块，待用户确认后才入库（取消则丢弃） */
interface ImportPreview {
  name: string
  tree: ZenNode
  blocks: IgnoredBlock[]
}

/** 案头（导图列表页）：左目录树 + 右卡片网格；卡片按 selectedDir 精确过滤，「全部」视图显示所在层小字 */
export default function LibraryView({ pickDirectory, pickMdFile }: Readonly<Props>) {
  const { workspaceDir, maps, error, selectedDir } = useAppStore()
  const store = useAppStore.getState()
  const [dialog, setDialog] = useState<'new' | 'rename' | 'delete' | 'move' | 'newdir' | null>(null)
  // 重命名/删除/移动对话框当前操作的导图（由所在卡片的按钮选定，而非 maps[0]）
  const [target, setTarget] = useState<MapInfo | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  // 案头左树（目录结构在 workspaceDir 变化与目录增删后重读）
  const [tree, setTree] = useState<DirNode[]>([])
  const [dirCollapsed, setDirCollapsed] = useState(false)
  // 新建目录的父目录（DirectoryTree onCreateDir 传入；''=工作区根）
  const [dirParent, setDirParent] = useState('')

  /** 重读左树：从 store 取实时 adapter/工作区；工作区切换（effect）与移动取消（onCancel）共用 */
  const reloadTree = async () => {
    const { adapter, workspaceDir: ws } = useAppStore.getState()
    if (!ws) return
    setTree(await readDirTree(adapter, ws))
  }

  useEffect(() => {
    void reloadTree()
  }, [workspaceDir])

  const closeDialog = () => {
    setDialog(null)
    setTarget(null)
  }

  const chooseWorkspace = async () => {
    try {
      const dir = await pickDirectory()
      if (dir) await store.setWorkspace(dir)
    } catch (e) {
      store.setError('设置工作区失败：' + String(e))
    }
  }

  /** 导入 .md：复制入库（内容按规范序列化另存，不移动原文件）；有忽略块先预览确认 */
  const startImport = async () => {
    if (!workspaceDir) return
    try {
      const picked = await pickMdFile()
      if (picked === null) return
      const r = parse(picked.text)
      if (!r.ok) {
        store.setError('导入失败：' + r.error)
        return
      }
      if (r.ignoredBlocks.length > 0) {
        setImportPreview({ name: picked.name, tree: r.tree, blocks: r.ignoredBlocks })
        return
      }
      const info = await commitImport(store.adapter, workspaceDir, picked.name, r.tree, store.preferredLayout)
      await store.openMap(info.mdPath)
    } catch (e) {
      store.setError('导入失败：' + String(e))
    }
  }

  const confirmImport = async () => {
    const pending = importPreview
    if (pending === null || !workspaceDir) return
    setImportPreview(null)
    try {
      const info = await commitImport(store.adapter, workspaceDir, pending.name, pending.tree, store.preferredLayout)
      await store.openMap(info.mdPath)
    } catch (e) {
      store.setError('导入失败：' + String(e))
    }
  }

  /** 新建目录（desk.createDir 递归，'/' 分隔逐段校验）成功后重读左树 */
  const confirmCreateDir = async (name: string) => {
    if (!workspaceDir || name === '') return
    setDialog(null)
    try {
      await createDir(store.adapter, workspaceDir, dirParent === '' ? name : `${dirParent}/${name}`)
      setTree(await readDirTree(store.adapter, workspaceDir))
      store.setError(null)
    } catch (e) {
      store.setError(e instanceof Error ? e.message : String(e))
    }
  }

  /** 移动导图：两文件同移到目标层；同目录无操作（对话框已禁该项，服务层亦有守卫，此处双保险）。
   *  移动后刷新列表与左树，停留当前目录视图 */
  const moveTarget = async (toRel: string) => {
    const t = target
    if (!workspaceDir || t === null) return
    closeDialog()
    if (toRel === t.relDir) return
    try {
      await moveMap(store.adapter, workspaceDir, t.name, t.relDir, toRel)
      await store.refreshMaps()
      setTree(await readDirTree(store.adapter, workspaceDir))
      store.setError(null)
    } catch (e) {
      store.setError('移动失败：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  // 卡片过滤在渲染层派生（store.maps 恒为工作区全量）：选中目录精确匹配，「全部」不过滤
  const visibleMaps = selectedDir === '' ? maps : maps.filter((m) => m.relDir === selectedDir)

  const renderBody = () => {
    if (!workspaceDir)
      return (
        <p className="hint">请选择导图工作区：所有导图将以 .md 文件保存在该文件夹，可直接交给 AI 或其他工具使用。</p>
      )
    // 右侧内容三级态：工作区空 → 全局空态；选中层空 → 层空态；否则过滤后的卡片网格
    const renderRight = () => {
      if (maps.length === 0)
        return (
          <div className="library-empty" data-testid="library-empty">
            <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
              <rect x="8" y="8" width="32" height="32" rx="4" fill="var(--seal)" />
              <path
                d="M17 25l5 5 10-12"
                stroke="var(--paper)"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p>空白的纸。新建一张导图，让想法落成 .md。</p>
          </div>
        )
      if (visibleMaps.length === 0)
        return (
          <div className="dir-empty-state" data-testid="dir-empty-state">
            这一层还没有导图
          </div>
        )
      return (
        <div className="map-grid">
          {visibleMaps.map((m) => (
            <div key={m.mdPath} className="map-card">
              <button
                type="button"
                data-testid="map-item"
                className="map-card-main"
                onClick={() => store.openMap(m.mdPath)}
                title={`打开「${m.name}」`}
              >
                <span className="map-name">{m.name}</span>
                <span className="badge-md">.md</span>
                {/* 「全部」视图显示所在层小字，帮助定位目录归属 */}
                {selectedDir === '' && (
                  <span className="map-reldir" data-testid="map-reldir">
                    {m.relDir === '' ? '根' : m.relDir}
                  </span>
                )}
                <span className="map-time">{new Date(m.modifiedAt).toLocaleString('zh-CN')}</span>
              </button>
              <div className="map-card-actions">
                <button
                  type="button"
                  data-testid="btn-move"
                  title="移动到目录"
                  onClick={() => {
                    setTarget(m)
                    setDialog('move')
                  }}
                >
                  <IconFolder />
                </button>
                <button
                  type="button"
                  data-testid="btn-rename"
                  title="重命名"
                  onClick={() => {
                    setTarget(m)
                    setDialog('rename')
                  }}
                >
                  <IconPencil />
                </button>
                <button
                  type="button"
                  data-testid="btn-delete"
                  title="删除"
                  onClick={() => {
                    setTarget(m)
                    setDialog('delete')
                  }}
                >
                  <IconTrash />
                </button>
              </div>
            </div>
          ))}
        </div>
      )
    }
    return (
      <div className="library-body">
        <button
          type="button"
          data-testid="dir-panel-toggle"
          className="dir-panel-toggle"
          aria-label={dirCollapsed ? '展开目录' : '折叠目录'}
          title={dirCollapsed ? '展开目录' : '折叠目录'}
          onClick={() => setDirCollapsed(!dirCollapsed)}
        >
          {dirCollapsed ? '›' : '‹'}
        </button>
        {/* 左树独立于卡片空态存在：空工作区也可先建目录组织结构 */}
        {!dirCollapsed && (
          <aside className="dir-panel" data-testid="dir-panel">
            <DirectoryTree
              tree={tree}
              selected={selectedDir}
              onSelect={(rel) => store.setSelectedDir(rel)}
              onCreateDir={(rel) => {
                setDirParent(rel)
                setDialog('newdir')
              }}
            />
          </aside>
        )}
        {renderRight()}
      </div>
    )
  }

  return (
    <div className="library">
      <header className="library-header">
        <div className="desk-title">
          <h1>案头</h1>
          {workspaceDir && (
            <span className="ws-path" title={workspaceDir}>
              {workspaceDir}
            </span>
          )}
        </div>
        {/* 设置入口占位（M5b）：页首右侧后续增加设置页 */}
        <button type="button" data-testid="btn-workspace" className="link-btn" onClick={chooseWorkspace}>
          选择工作区
        </button>
        {workspaceDir && (
          <button
            type="button"
            data-testid="btn-import"
            className="btn-primary"
            onClick={() => void startImport()}
          >
            导入 .md
          </button>
        )}
        {workspaceDir && (
          <button
            type="button"
            data-testid="btn-new"
            className="btn-primary"
            onClick={() => setDialog('new')}
          >
            新建导图
          </button>
        )}
        {/* 主题三态切换（页首常驻；编辑器右下角挂载见 M4 Task 4） */}
        <ThemeToggle />
      </header>
      {error && <div className="error-banner">{error}</div>}
      {renderBody()}

      {dialog === 'new' && (
        <NameDialog
          title="新建导图"
          confirmText="创建"
          onCancel={() => setDialog(null)}
          onConfirm={async (name) => {
            setDialog(null)
            await store.createAndOpen(name)
          }}
        />
      )}
      {dialog === 'rename' && target && (
        <NameDialog
          title="重命名导图"
          initial={target.name}
          confirmText="重命名"
          onCancel={closeDialog}
          onConfirm={async (name) => {
            closeDialog()
            try {
              await renameMap(store.adapter, workspaceDir!, target.name, name)
              await store.refreshMaps()
              store.setError(null)
            } catch (e) {
              store.setError(e instanceof Error ? e.message : String(e))
            }
          }}
        />
      )}
      {dialog === 'newdir' && (
        <NameDialog
          title={dirParent === '' ? '新建目录' : `在「${dirParent}」新建目录`}
          confirmText="创建"
          onCancel={closeDialog}
          onConfirm={(name) => void confirmCreateDir(name)}
        />
      )}
      {/* 对话框互斥约定（ZenDialog）：本视图至多同时一个 ZenDialog——dialog（新建/重命名/删除/移动/新建目录）
          与 importPreview 互不并存：原生 dialog 为 modal，弹出期间背景不可点，两条入口天然互斥 */}
      {dialog === 'delete' && target && (
        <ZenDialog
          title={`删除「${target.name}」？`}
          onClose={closeDialog}
          actions={
            <>
              <button type="button" onClick={closeDialog}>
                取消
              </button>
              <button
                type="button"
                data-testid="btn-delete-confirm"
                onClick={async () => {
                  closeDialog()
                  try {
                    await deleteMap(store.adapter, workspaceDir!, target.name)
                    await store.refreshMaps()
                  } catch (e) {
                    store.setError('删除失败：' + String(e))
                  }
                }}
              >
                删除
              </button>
            </>
          }
        >
          <p>将移入回收站（.md 与 .zen.json 一起删除）。</p>
        </ZenDialog>
      )}
      {dialog === 'move' && target && (
        <MoveMapDialog
          mapName={target.name}
          tree={tree}
          fromRel={target.relDir}
          onCancel={() => {
            // 取消也重读左树：对话框内联新建的目录已真实落盘，不能只留在对话框暂存列表
            // （Esc 经 ZenDialog onClose 同走 onCancel，语义一致）
            closeDialog()
            void reloadTree()
          }}
          onMove={(toRel) => void moveTarget(toRel)}
        />
      )}
      {importPreview && (
        <ZenDialog
          testid="import-preview"
          title={`导入「${importPreview.name}」`}
          onClose={() => setImportPreview(null)}
          actions={
            <>
              <button type="button" data-testid="import-cancel" onClick={() => setImportPreview(null)}>
                取消
              </button>
              <button type="button" data-testid="import-confirm" onClick={() => void confirmImport()}>
                导入
              </button>
            </>
          }
        >
          <p>{importPreview.blocks.length} 个内容块未映射，这些内容不会出现在导图中：</p>
          <ul className="ignored-preview-list">
            {importPreview.blocks.map((b) => (
              <li key={`${b.type}:${b.excerpt}`}>
                {describeIgnoredType(b.type)}：{b.excerpt}
              </li>
            ))}
          </ul>
        </ZenDialog>
      )}
    </div>
  )
}
