import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { deleteMap, renameMap } from '../services/workspace'
import { commitImport } from '../services/importMap'
import { createDir, moveMap, readDirTree, type DirNode } from '../services/desk'
import { parse } from '../services/mdTree'
import { describeIgnoredType } from '../services/ignoredType'
import NameDialog from '../components/NameDialog'
import ZenDialog from '../components/ZenDialog'
import ZenTooltip from '../components/ZenTooltip'
import SettingsDialog from '../components/SettingsDialog'
import ThemeToggle from '../components/ThemeToggle'
import WelcomeScreen from '../components/WelcomeScreen'
import DirectoryTree, { type TreeFile } from '../components/DirectoryTree'
import MoveMapDialog from '../components/MoveMapDialog'
import PreviewPane from '../components/PreviewPane'
import { IconFolder, IconImport, IconPencil, IconPlus, IconTrash, IconSettings } from '../components/icons'
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

/** 案头（导图列表页，M5d 三区）：图标工具栏 + 左目录树（含文件行）+ 中卡片网格 + 右大纲预览；
 *  交互语义：卡片/树文件单击=选中并预览，双击或预览「打开」=进纸面；卡片按 selectedDir 精确过滤 */
export default function LibraryView({ pickDirectory, pickMdFile }: Readonly<Props>) {
  const { workspaceDir, maps, error, selectedDir } = useAppStore()
  const store = useAppStore.getState()
  const [dialog, setDialog] = useState<'new' | 'rename' | 'delete' | 'move' | 'newdir' | 'settings' | null>(null)
  // 重命名/删除/移动对话框当前操作的导图（由所在卡片的按钮选定，而非 maps[0]）
  const [target, setTarget] = useState<MapInfo | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  // 案头左树（目录结构在 workspaceDir 变化与目录增删后重读）
  const [tree, setTree] = useState<DirNode[]>([])
  const [dirCollapsed, setDirCollapsed] = useState(false)
  // 新建目录的父目录（DirectoryTree onCreateDir 传入；''=工作区根）
  const [dirParent, setDirParent] = useState('')
  // 选中导图（M5d 交互变更：单击卡片/树文件=选中并预览，双击/预览「打开」=进纸面）
  const [selectedMap, setSelectedMap] = useState<string | null>(null)

  /** 重读左树：从 store 取实时 adapter/工作区；工作区切换（effect）与移动取消（onCancel）共用。
   *  useCallback 固定身份（体仅引用稳定的 setTree 与模块导入，无反应式依赖，无陈旧闭包） */
  const reloadTree = useCallback(async () => {
    const { adapter, workspaceDir: ws } = useAppStore.getState()
    if (!ws) return
    setTree(await readDirTree(adapter, ws))
  }, [])

  useEffect(() => {
    void reloadTree()
  }, [workspaceDir, reloadTree])

  const closeDialog = () => {
    setDialog(null)
    setTarget(null)
  }

  /** 选中态失效清理（M5d 审查修复）：重命名/删除/移动/切换工作区后，选中图 mdPath 失联则清空
   *  （否则预览指向已不存在的文件、卡片高亮悬空）。须在 maps 已刷新后调用 */
  const pruneSelectedMap = () => {
    setSelectedMap((cur) =>
      cur !== null && useAppStore.getState().maps.some((m) => m.mdPath === cur) ? cur : null,
    )
  }

  const chooseWorkspace = async () => {
    try {
      const dir = await pickDirectory()
      if (dir) {
        await store.setWorkspace(dir)
        pruneSelectedMap()
      }
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
      pruneSelectedMap()
      store.setError(null)
    } catch (e) {
      store.setError('移动失败：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  // 卡片过滤在渲染层派生（store.maps 恒为工作区全量）：选中目录精确匹配，「全部」不过滤
  const visibleMaps = selectedDir === '' ? maps : maps.filter((m) => m.relDir === selectedDir)

  // 树/预览的文件清单与选中态（M5d）：文件行按 name+relDir 寻址（md 路径由 maps 反查）
  const files: TreeFile[] = maps.map((m) => ({ name: m.name, relDir: m.relDir }))
  const selectedInfo = maps.find((m) => m.mdPath === selectedMap) ?? null
  const mdPathOf = (f: TreeFile): string | undefined =>
    maps.find((m) => m.name === f.name && m.relDir === f.relDir)?.mdPath
  const selectFile = (f: TreeFile) => {
    const p = mdPathOf(f)
    if (p !== undefined) setSelectedMap(p)
  }
  const openFile = (f: TreeFile) => {
    const p = mdPathOf(f)
    if (p !== undefined) void store.openMap(p)
  }
  // 树根显示工作区名（tooltip 全路径承担原页首路径职能）；开屏态（无工作区）不进树，占位空串
  // （尾部 `/\\` 收敛用「首字符 + 零或多次」展开式，规避 Sonar S8786 回溯警告）
  const workspaceName = workspaceDir?.replace(/[\\/][\\/]*$/, '').split(/[\\/]/).pop() ?? ''

  const renderBody = () => {
    // 无工作区 → 开屏页（M5d spec §2）：替代旧 hint；页首栏在此态隐藏
    if (!workspaceDir) return <WelcomeScreen onCreateWorkspace={() => void chooseWorkspace()} />
    // 右侧内容三级态：工作区空 → 全局空态；选中层空 → 层空态；否则过滤后的卡片网格
    const renderRight = () => {
      if (maps.length === 0)
        return (
          <div className="library-empty" data-testid="library-empty">
            <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
              <rect x="8" y="8" width="32" height="32" rx="4" fill="var(--color-brand)" />
              <path
                d="M17 25l5 5 10-12"
                stroke="var(--color-background)"
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
                className={selectedMap === m.mdPath ? 'map-card-main selected' : 'map-card-main'}
                onClick={() => setSelectedMap(m.mdPath)}
                onDoubleClick={() => void store.openMap(m.mdPath)}
                title={`选中「${m.name}」（双击打开）`}
              >
                <span className="map-name">{m.name}</span>
                <span className="badge-md" aria-hidden="true">
                  .md
                </span>
                {/* 「全部」视图显示所在层小字，帮助定位目录归属 */}
                {selectedDir === '' && (
                  <span className="map-reldir" data-testid="map-reldir">
                    {m.relDir === '' ? '根' : m.relDir}
                  </span>
                )}
                <span className="map-time" aria-hidden="true">
                  {new Date(m.modifiedAt).toLocaleString('zh-CN')}
                </span>
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
        {/* 左树独立于卡片空态存在：空工作区也可先建目录组织结构；树含导图文件行（M5d） */}
        {!dirCollapsed && (
          <aside className="dir-panel" data-testid="dir-panel">
            <DirectoryTree
              tree={tree}
              files={files}
              rootLabel={workspaceName}
              rootTooltip={workspaceDir}
              selected={selectedDir}
              selectedFile={selectedInfo === null ? null : { name: selectedInfo.name, relDir: selectedInfo.relDir }}
              onSelect={(rel) => store.setSelectedDir(rel)}
              onSelectFile={selectFile}
              onOpenFile={openFile}
              onCreateDir={(rel) => {
                setDirParent(rel)
                setDialog('newdir')
              }}
            />
          </aside>
        )}
        {renderRight()}
        {/* 右列大纲预览（M5d）：选中即预览，「打开」进纸面 */}
        <PreviewPane mdPath={selectedMap} />
      </div>
    )
  }

  return (
    <div className="library">
      {/* 工具栏区（M5d spec §3，无工作区的开屏态隐藏）：左印章+品牌名 / 右设置+导入+新建(纯图标)+主题 */}
      {workspaceDir && (
        <header className="library-header">
          <div className="desk-brand">
            <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
              <rect x="8" y="8" width="32" height="32" rx="4" fill="var(--color-brand)" />
              <path
                d="M17 25l5 5 10-12"
                stroke="var(--color-background)"
                strokeWidth="3.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <h1>Mind Map Zen</h1>
          </div>
          {/* 设置入口（M5b Task 4 内容，M5d 改齿轮图标）：复制行为两开关。
              M5c 接 ZenTooltip（title 退役防双提示，aria-label 保留语义名） */}
          <ZenTooltip label="设置">
            <button
              type="button"
              data-testid="btn-settings"
              className="icon-btn"
              aria-label="设置"
              onClick={() => setDialog('settings')}
            >
              <IconSettings />
            </button>
          </ZenTooltip>
          {/* 导入/新建（v0.7.0 验收纯图标化）：图标 + ZenTooltip 悬浮提示（testid 不变，E2E 兼容） */}
          <ZenTooltip label="导入 .md">
            <button
              type="button"
              data-testid="btn-import"
              className="icon-btn"
              aria-label="导入 .md"
              onClick={() => void startImport()}
            >
              <IconImport />
            </button>
          </ZenTooltip>
          <ZenTooltip label="新建导图">
            <button
              type="button"
              data-testid="btn-new"
              className="icon-btn"
              aria-label="新建导图"
              onClick={() => setDialog('new')}
            >
              <IconPlus />
            </button>
          </ZenTooltip>
          {/* 主题三态切换（页首常驻；编辑器右下角挂载见 M4 Task 4） */}
          <ThemeToggle />
        </header>
      )}
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
      {/* 设置对话框（M5b Task 4 + M5d 更换工作区 + v0.7.0 退出工作区）：与其他对话框共用 dialog 互斥状态；
          更换工作区先关对话框再走 pickDirectory 流（同开屏「创建工作区」）；退出工作区清 store 落
          workspaceDir:null 回开屏页（renderBody 无工作区分支渲染 WelcomeScreen） */}
      {dialog === 'settings' && (
        <SettingsDialog
          onClose={() => setDialog(null)}
          onChangeWorkspace={() => {
            setDialog(null)
            void chooseWorkspace()
          }}
          onExitWorkspace={() => {
            setDialog(null)
            void store.exitWorkspace()
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
              await renameMap(store.adapter, workspaceDir!, target.relDir, target.name, name)
              await store.refreshMaps()
              pruneSelectedMap()
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
          与 importPreview 互不并存：Radix Dialog 为 modal（遮罩挡背景 + 滚动锁定），两条入口天然互斥 */}
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
                    await deleteMap(store.adapter, workspaceDir!, target.relDir, target.name)
                    await store.refreshMaps()
                    pruneSelectedMap()
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
