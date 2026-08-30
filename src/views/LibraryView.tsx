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
import AppLogo from '../components/AppLogo'
import DirectoryTree, { type TreeFile } from '../components/DirectoryTree'
import MoveMapDialog from '../components/MoveMapDialog'
import FileExplorer, { type MapAction } from '../components/FileExplorer'
import FileDetail from '../components/FileDetail'
import { IconImport, IconPlus, IconSettings } from '../components/icons'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '../components/ui/dialog'
import { Button } from '../components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip'
import { Separator } from '../components/ui/separator'
import {
  Sidebar,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '../components/ui/sidebar'
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

/** 案头（M15 文件化三态）：SidebarProvider + inset 骨架；主区三态——
 *  idle（进案头未选任何 → 空态引导）/ 目录态（FileExplorer 资源管理器大图标网格）/
 *  详情态（FileDetail 摘要条 + markdown 预览）。交互语义：树/文件夹 tile 单击=选目录，
 *  文件 tile/树文件行单击=选中进详情，双击=进纸面；悬停操作钮（移动/重命名/删除）沿旧口径 */
export default function LibraryView({ pickDirectory, pickMdFile }: Readonly<Props>) {
  const { workspaceDir, maps, error, selectedDir } = useAppStore()
  const store = useAppStore.getState()
  const [dialog, setDialog] = useState<'new' | 'rename' | 'delete' | 'move' | 'newdir' | 'settings' | null>(null)
  // 重命名/删除/移动对话框当前操作的导图（由所在 tile 的按钮选定，而非 maps[0]）
  const [target, setTarget] = useState<MapInfo | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  // 案头左树（目录结构在 workspaceDir 变化与目录增删后重读）
  const [tree, setTree] = useState<DirNode[]>([])
  // 新建目录的父目录（''=工作区根）
  const [dirParent, setDirParent] = useState('')
  // 选中导图（单击 tile/树文件行=选中进详情，双击=进纸面）
  const [selectedMap, setSelectedMap] = useState<string | null>(null)
  // 三态初始位（M15）：进案头未选任何 → 空态引导；点目录/文件即离开 idle
  const [idle, setIdle] = useState(true)

  /** 重读左树：从 store 取实时 adapter/工作区；工作区切换（effect）与移动取消（onCancel）共用。
   *  useCallback 固定身份（体仅引用稳定的 setTree 与模块导入，无反应式依赖，无陈旧闭包） */
  const reloadTree = useCallback(async () => {
    const { adapter, workspaceDir: ws } = useAppStore.getState()
    if (!ws) return
    setTree(await readDirTree(adapter, ws))
  }, [])

  useEffect(() => {
    void reloadTree()
    // 工作区切换回到三态初始位（新工作区未选任何）
    setIdle(true)
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

  // 目录层导图（store.maps 恒为工作区全量）：资源管理器按当前层精确过滤
  const visibleMaps = maps.filter((m) => m.relDir === selectedDir)

  // 树/预览的文件清单与选中态（M5d）：文件行按 name+relDir 寻址（md 路径由 maps 反查）
  const files: TreeFile[] = maps.map((m) => ({ name: m.name, relDir: m.relDir }))
  const selectedInfo = maps.find((m) => m.mdPath === selectedMap) ?? null
  const mdPathOf = (f: TreeFile): string | undefined =>
    maps.find((m) => m.name === f.name && m.relDir === f.relDir)?.mdPath
  const selectFile = (f: TreeFile) => {
    const p = mdPathOf(f)
    if (p !== undefined) {
      setSelectedMap(p)
      setIdle(false)
    }
  }
  const openFile = (f: TreeFile) => {
    const p = mdPathOf(f)
    if (p !== undefined) void store.openMap(p)
  }
  // 树根显示工作区名（title 承担原页首路径职能）；开屏态（无工作区）不进树，占位空串
  const workspaceName = workspaceDir?.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''

  /** 右侧内容（M15 三态）：工作区空 → 全局空态；详情态（选中文件）→ FileDetail；
   *  idle（未选任何）→ 空态引导；目录态 → FileExplorer（文件夹 + 导图大图标 tile）。
   *  map-item/选中/双击/悬停操作语义全沿旧口径，testid 不变 */
  const renderRight = () => {
    if (maps.length === 0)
      return (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center text-muted-foreground"
          data-testid="library-empty"
        >
          <AppLogo size={48} />
          <p className="text-sm">空白的纸。新建一张导图，让想法落成 .md。</p>
          <Button size="sm" data-testid="library-empty-new" onClick={() => setDialog('new')}>
            新建导图
          </Button>
        </div>
      )
    if (selectedInfo !== null)
      return (
        <FileDetail
          info={selectedInfo}
          onBack={() => {
            // 返回目录视图：清文件选中即回落到 selectedDir 的资源管理器态
            setSelectedMap(null)
            setIdle(false)
          }}
        />
      )
    if (idle)
      return (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center text-muted-foreground"
          data-testid="desk-idle"
        >
          <p className="text-sm">从左侧选择目录或导图，或新建一张</p>
          <Button size="sm" data-testid="desk-idle-new" onClick={() => setDialog('new')}>
            新建导图
          </Button>
        </div>
      )
    return (
      <FileExplorer
        dirRel={selectedDir}
        tree={tree}
        maps={visibleMaps}
        onSelectDir={(rel) => {
          setIdle(false)
          store.setSelectedDir(rel)
        }}
        onSelectMap={(m) => {
          setSelectedMap(m.mdPath)
          setIdle(false)
        }}
        onOpenMap={(m) => void store.openMap(m.mdPath)}
        onAction={(a: MapAction, m) => {
          setTarget(m)
          setDialog(a)
        }}
      />
    )
  }

  /** 页首动作钮（官方 header 模式）：ui Button ghost sm + ui/tooltip 悬浮提示 +
   *  aria-label 语义名（title 退役防双提示），testid 逐枚保留（E2E 兼容） */
  const headerBtn = (label: string, testid: string, Icon: typeof IconSettings, onClick: () => void) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="sm" data-testid={testid} aria-label={label} onClick={onClick}>
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )

  const createDirTitle =
    selectedDir === '' ? '在工作区根下新建目录' : `在「${selectedDir}」下新建目录`

  // 无工作区 → 开屏页（M5d spec §2）：替代旧 hint；骨架（侧栏/页首）在此态不渲染
  if (!workspaceDir)
    return (
      <div className="library flex h-full flex-col bg-background">
        {error && <div className="error-banner">{error}</div>}
        <WelcomeScreen onCreateWorkspace={() => void chooseWorkspace()} />
      </div>
    )

  return (
    <div className="library flex h-full flex-col bg-background">
      <SidebarProvider className="min-h-0 flex-1">
        {/* variant=inset（M14b 区块化）：官方机器承担分区——侧栏去 border-r 改留悬浮呼吸位，
            wrapper 自动换 bg-sidebar 色场，SidebarInset 自动成 rounded-xl shadow-sm 白色浮层。
            分区靠「色场 vs 圆角浮层」，不靠线条 */}
        <Sidebar variant="inset" data-testid="dir-panel">
          {/* 侧栏头：朱砂方印 + 品名（spec §4：印标 + Mind Map Zen） */}
          <SidebarHeader>
            <div className="flex items-center gap-2 px-2">
              <AppLogo size={16} className="shrink-0" />
              <span className="truncate text-sm font-semibold text-sidebar-foreground">Mind Map Zen</span>
            </div>
          </SidebarHeader>
          {/* 侧栏内容 = 左树（DirectoryTree 内部即 SidebarContent/Group/Menu 官方骨架）；
              空工作区也可先建目录组织结构；树含导图文件行（M5d） */}
          <DirectoryTree
            tree={tree}
            files={files}
            rootLabel={workspaceName}
            rootTooltip={workspaceDir}
            selected={idle ? null : selectedDir}
            selectedFile={selectedInfo === null ? null : { name: selectedInfo.name, relDir: selectedInfo.relDir }}
            onSelect={(rel) => {
              setSelectedMap(null)
              setIdle(false)
              store.setSelectedDir(rel)
            }}
            onSelectFile={selectFile}
            onOpenFile={openFile}
          />
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  data-testid="dir-create"
                  tooltip={createDirTitle}
                  onClick={() => {
                    setDirParent(selectedDir)
                    setDialog('newdir')
                  }}
                >
                  <IconPlus />
                  <span>新建目录</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          {/* 页首（官方 SiteHeader 模式）：折叠钮 | 分隔 | 面包屑 … 动作钮 + 主题。
              无 border-b（M15 用户点名）：inset 圆角浮层已承担分区，页首与主区之间无线条 */}
          <header className="flex h-16 shrink-0 items-center gap-2 px-4">
            <SidebarTrigger data-testid="dir-panel-toggle" />
            <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
            <h1 className="truncate text-sm font-semibold tracking-wide text-foreground">{workspaceName}</h1>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              {headerBtn('设置', 'btn-settings', IconSettings, () => setDialog('settings'))}
              {headerBtn('导入 .md', 'btn-import', IconImport, () => void startImport())}
              {headerBtn('新建导图', 'btn-new', IconPlus, () => setDialog('new'))}
              {/* 主题三态切换（页首常驻；编辑器右下角挂载见 M4 Task 4） */}
              <ThemeToggle />
            </div>
          </header>
          {error && <div className="error-banner">{error}</div>}
          {/* 主区（官方 p-6）：M15 三态（idle 空态引导 / 目录态资源管理器 / 详情态摘要+md 预览） */}
          <main className="flex min-h-0 flex-1 p-6">{renderRight()}</main>
        </SidebarInset>
      </SidebarProvider>

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
          workspaceDir:null 回开屏页（无工作区分支渲染 WelcomeScreen） */}
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
          onCancel={() => setDialog(null)}
          onConfirm={(name) => void confirmCreateDir(name)}
        />
      )}
      {/* 对话框互斥约定（ui Dialog）：本视图至多同时一个对话框——dialog（新建/重命名/删除/移动/新建目录）
          与 importPreview 互不并存：Radix Dialog 为 modal（遮罩挡背景 + 滚动锁定），两条入口天然互斥 */}
      {dialog === 'delete' && target && (
        <Dialog open onOpenChange={(o) => { if (!o) closeDialog() }}>
          <DialogContent aria-label={`删除「${target.name}」？`}>
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
          <DialogContent data-testid="import-preview" aria-label={`导入「${importPreview.name}」`}>
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
    </div>
  )
}
