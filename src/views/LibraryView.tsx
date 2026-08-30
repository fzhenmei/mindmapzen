import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { deleteMap, renameMap } from '../services/workspace'
import { commitImport } from '../services/importMap'
import { createDir, moveMap, readDirTree, type DirNode } from '../services/desk'
import { parse } from '../services/mdTree'
import { describeIgnoredType } from '../services/ignoredType'
import NameDialog from '../components/NameDialog'
import SettingsDialog from '../components/SettingsDialog'
import ThemeToggle from '../components/ThemeToggle'
import WelcomeScreen from '../components/WelcomeScreen'
import DirectoryTree, { type TreeFile } from '../components/DirectoryTree'
import MoveMapDialog from '../components/MoveMapDialog'
import PreviewPane from '../components/PreviewPane'
import { IconFolder, IconImport, IconPencil, IconPlus, IconTrash, IconSettings } from '../components/icons'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '../components/ui/dialog'
import { Button } from '../components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip'
import { cn } from '../lib/utils'
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

/** 命令栏图标钮（spec §3 案头命令栏 48px / 钮 32px 等距 8px）：与 ui/button icon 尺寸同规；
 *  ThemeToggle 命令栏内同款（其文件内另持一份，皮肤演进随 ui/button 收敛） */
const ICON_BTN =
  'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** 卡片浮动操作钮（悬停显现，26px 与旧皮肤同尺寸） */
const CARD_ACTION_BTN =
  'inline-flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-md bg-card text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-primary'

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
          <div
            className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground"
            data-testid="library-empty"
          >
            <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
              <rect x="8" y="8" width="32" height="32" rx="4" fill="var(--destructive)" />
              <path
                d="M17 25l5 5 10-12"
                stroke="var(--background)"
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
          <div
            className="flex flex-1 items-center justify-center text-sm text-muted-foreground"
            data-testid="dir-empty-state"
          >
            这一层还没有导图
          </div>
        )
      return (
        <div className="grid flex-1 min-w-0 grid-cols-[repeat(auto-fill,minmax(240px,1fr))] content-start gap-2.5 overflow-y-auto px-1 pb-6 pt-1">
          {visibleMaps.map((m) => (
            <div key={m.mdPath} className="map-card group relative">
              <button
                type="button"
                data-testid="map-item"
                className={cn(
                  'flex w-full cursor-pointer flex-col items-start gap-1.5 rounded-lg border bg-card p-4 text-left shadow-sm transition-[border-color,transform] duration-150 hover:-translate-y-px hover:border-primary',
                  // selected：语义状态钩子（E2E toHaveClass 断言），视觉由 utility 承担
                  selectedMap === m.mdPath ? 'selected border-primary bg-secondary' : 'border-border',
                )}
                onClick={() => setSelectedMap(m.mdPath)}
                onDoubleClick={() => void store.openMap(m.mdPath)}
                title={`选中「${m.name}」（双击打开）`}
              >
                <span className="max-w-full truncate text-sm font-medium text-foreground">{m.name}</span>
                <span
                  className="rounded-md bg-secondary px-1.5 py-0.5 font-file text-[11px] text-primary"
                  aria-hidden="true"
                >
                  .md
                </span>
                {/* 「全部」视图显示所在层小字，帮助定位目录归属 */}
                {selectedDir === '' && (
                  <span
                    className="max-w-full truncate font-file text-[11px] text-muted-foreground"
                    data-testid="map-reldir"
                  >
                    {m.relDir === '' ? '根' : m.relDir}
                  </span>
                )}
                <span className="font-file text-xs text-muted-foreground" aria-hidden="true">
                  {new Date(m.modifiedAt).toLocaleString('zh-CN')}
                </span>
              </button>
              <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                <button
                  type="button"
                  data-testid="btn-move"
                  title="移动到目录"
                  className={CARD_ACTION_BTN}
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
                  className={CARD_ACTION_BTN}
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
                  className={CARD_ACTION_BTN}
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
      <div className="flex min-h-0 flex-1 gap-3 p-4">
        <button
          type="button"
          data-testid="dir-panel-toggle"
          className="w-5 shrink-0 self-stretch rounded-md border border-border bg-card font-file text-sm leading-none text-muted-foreground transition-colors duration-150 hover:border-primary hover:text-primary"
          aria-label={dirCollapsed ? '展开目录' : '折叠目录'}
          title={dirCollapsed ? '展开目录' : '折叠目录'}
          onClick={() => setDirCollapsed(!dirCollapsed)}
        >
          {dirCollapsed ? '›' : '‹'}
        </button>
        {/* 左树独立于卡片空态存在：空工作区也可先建目录组织结构；树含导图文件行（M5d）。
            案头三区（M12b）：树 240px（行高由 DirectoryTree 的 h-8 提供） */}
        {!dirCollapsed && (
          <aside className="w-60 shrink-0 overflow-y-auto pr-2" data-testid="dir-panel">
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

  /** 命令栏图标钮（M12b）：设置/导入/新建三枚同构——ui/tooltip 悬浮提示 + aria-label 语义名
   *  （title 退役防双提示），testid 逐枚保留（E2E 兼容） */
  const headerBtn = (label: string, testid: string, Icon: typeof IconSettings, onClick: () => void) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" data-testid={testid} className={ICON_BTN} aria-label={label} onClick={onClick}>
          <Icon />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )

  return (
    <div className="library flex h-full flex-col bg-background">
      {/* 官方 Tooltip 需 Provider 祖先（Radix 硬约束）：视图根一次包齐 */}
      <TooltipProvider>
      {/* 命令栏（M12b spec §3 案头三区）：48px 通栏，左面包屑（印章+工作区名）/ 右图标钮
          32px 等距 8px（设置/导入/新建/主题）；无工作区的开屏态隐藏 */}
      {workspaceDir && (
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
          <div className="flex min-w-0 items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
              <rect x="8" y="8" width="32" height="32" rx="4" fill="var(--destructive)" />
              <path
                d="M17 25l5 5 10-12"
                stroke="var(--background)"
                strokeWidth="3.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <h1 className="truncate text-sm font-semibold tracking-wide text-foreground">{workspaceName}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerBtn('设置', 'btn-settings', IconSettings, () => setDialog('settings'))}
            {headerBtn('导入 .md', 'btn-import', IconImport, () => void startImport())}
            {headerBtn('新建导图', 'btn-new', IconPlus, () => setDialog('new'))}
            {/* 主题三态切换（命令栏常驻；编辑器右下角挂载见 M4 Task 4） */}
            <ThemeToggle />
          </div>
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
      {/* 对话框互斥约定（ui Dialog）：本视图至多同时一个对话框——dialog（新建/重命名/删除/移动/新建目录）
          与 importPreview 互不并存：Radix Dialog 为 modal（遮罩挡背景 + 滚动锁定），两条入口天然互斥 */}
      {dialog === 'delete' && target && (
        <Dialog open onOpenChange={(o) => { if (!o) closeDialog() }}>
          <DialogContent aria-label={`删除「${target.name}」？`} className="w-90 gap-3 p-5">
            <DialogTitle>{`删除「${target.name}」？`}</DialogTitle>
            <p className="text-sm">将移入回收站（.md 与 .zen.json 一起删除）。</p>
            <DialogFooter>
              <Button variant="secondary" size="sm" onClick={closeDialog}>
                取消
              </Button>
              <Button
                variant="destructive"
                size="sm"
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
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {dialog === 'move' && target && (
        <MoveMapDialog
          mapName={target.name}
          tree={tree}
          fromRel={target.relDir}
          onCancel={() => {
            // 取消也重读左树：对话框内联新建的目录已真实落盘，不能只留在对话框暂存列表
            // （Esc 经 ui Dialog onOpenChange(false) 同走 onCancel，语义一致）
            closeDialog()
            void reloadTree()
          }}
          onMove={(toRel) => void moveTarget(toRel)}
        />
      )}
      {importPreview && (
        <Dialog open onOpenChange={(o) => { if (!o) setImportPreview(null) }}>
          <DialogContent data-testid="import-preview" aria-label={`导入「${importPreview.name}」`} className="w-90 gap-3 p-5">
            <DialogTitle>{`导入「${importPreview.name}」`}</DialogTitle>
            <p className="text-sm">{importPreview.blocks.length} 个内容块未映射，这些内容不会出现在导图中：</p>
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              {importPreview.blocks.map((b) => (
                <li key={`${b.type}:${b.excerpt}`}>
                  {describeIgnoredType(b.type)}：{b.excerpt}
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button variant="secondary" size="sm" data-testid="import-cancel" onClick={() => setImportPreview(null)}>
                取消
              </Button>
              <Button size="sm" data-testid="import-confirm" onClick={() => void confirmImport()}>
                导入
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      </TooltipProvider>
    </div>
  )
}
