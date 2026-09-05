import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { deleteMap, joinPath, renameMap, resolveDir } from '../services/workspace'
import { commitImport } from '../services/importMap'
import { createDir, deleteDir, dirDeleteSummary, readDirTree, type DirNode } from '../services/desk'
import { useTreeMoves } from '../hooks/useTreeMoves'
import { useSidebarResize } from '../hooks/useSidebarResize'
import { parse } from '../services/mdTree'
import { parseXmind } from '../services/xmindImport'
import type { WriteClipboard } from '../services/clipboard'
import NameDialog from '../components/NameDialog'
import SettingsDialog from '../components/SettingsDialog'
import HistoryDialog from '../components/HistoryDialog'
import WelcomePane from '../components/WelcomePane'
import { ThemeFab } from '../components/ThemeToggle'
import WelcomeScreen from '../components/WelcomeScreen'
import AppLogo from '../components/AppLogo'
import DirectoryTree, { type TreeFile } from '../components/DirectoryTree'
import MoveMapDialog from '../components/MoveMapDialog'
import NewMapDialog from '../components/NewMapDialog'
import DeleteConfirmDialog from '../components/DeleteConfirmDialog'
import ImportPreviewDialog, { type ImportPreview } from '../components/ImportPreviewDialog'
import FileDetail from '../components/FileDetail'
import DetailActions, { detailMeta, detailTitle } from '../components/DetailActions'
import { IconImport, IconPlus, IconSettings } from '../components/icons'
import { HideSidebarAction, ShowSidebarTab } from '../components/SidebarToggles'
import { Button } from '../components/ui/button'
import { iconBtn } from '../components/ui/icon-button'
import {
  Sidebar,
  SidebarFooter,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '../components/ui/sidebar'
import type { MapInfo } from '../types/files'
import type { IgnoredBlock, ZenNode } from '../types/tree'

/** 导入源统一载荷（M21：md 文本 / xmind 字节双流，一个对话框入口按 kind 分流；
 *  可辨识联合——分支内 text/bytes 精确收窄） */
export type PickedImport =
  | { name: string; kind: 'md'; text: string }
  | { name: string; kind: 'xmind'; bytes: Uint8Array }

interface Props {
  pickDirectory: () => Promise<string | null>
  /** 选择外部导入源（.md 文本 / .xmind 字节）：生产为 Tauri 对话框单选 + adapter 读取，测试注入桩；取消返回 null */
  pickImportFile: () => Promise<PickedImport | null>
  /** 剪贴板写入端口（2026-09 复制路径）：生产为 Tauri 插件实现，测试注入内存实现（同 EditorView prop 模式） */
  writeClipboard: WriteClipboard
}

/** 案头（2026-09 主区纯预览化）：SidebarProvider + inset 骨架；主区两态——
 *  未选文件（idle/选中目录）→ 欢迎页；详情态（容器合并改版：页首即详情卡头——
 *  md 标题 + 动作钮上移，主区即预览面板）。主区只承担 markdown 预览，文件浏览与
 *  导航全部由左树承担（目录下直列文件行）；文件操作（移动/重命名/删除）收敛到
 *  详情页首动作钮。交互语义：树目录行单击=选中目录（主区欢迎页），树文件行
 *  单击=选中进详情，双击=进纸面 */
export default function LibraryView({ pickDirectory, pickImportFile, writeClipboard }: Readonly<Props>) {
  const { workspaceDir, maps, error, selectedDir, favorites, librarySort } = useAppStore()
  const recentOpened = useAppStore((s) => s.recentOpened)
  // 最近打开清单 → 导图信息（已删/移出工作区的宽容剔除，最多 8 条）
  const recent = recentOpened
    .map((p) => maps.find((m) => m.mdPath === p) ?? null)
    .filter((m): m is MapInfo => m !== null)
    .slice(0, 8)
  const store = useAppStore.getState()
  const [dialog, setDialog] = useState<'new' | 'rename' | 'delete' | 'deletedir' | 'move' | 'newdir' | 'settings' | 'history' | null>(null)
  // 重命名/删除/移动对话框当前操作的导图（由所在 tile 的按钮选定，而非 maps[0]）
  const [target, setTarget] = useState<MapInfo | null>(null)
  // 删除目录对话框当前操作的目标（2026-09 树右键）：rel 相对工作区，name 末段显示名
  const [dirTarget, setDirTarget] = useState<{ rel: string; name: string } | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  // 案头左树（目录结构在 workspaceDir 变化与目录增删后重读）
  const [tree, setTree] = useState<DirNode[]>([])
  // 新建目录的父目录（''=工作区根）
  const [dirParent, setDirParent] = useState('')
  // 新建导图目标目录（2026-09 树右键「在此新建导图」）：''=工作区根；页首/欢迎页/空态入口一律归零
  const [newMapDir, setNewMapDir] = useState('')
  // 选中导图（单击 tile/树文件行=选中进详情，双击=进纸面）
  const [selectedMap, setSelectedMap] = useState<string | null>(null)
  // 进案头未选任何（true）：左树无激活行；点目录/文件后置 false（主区两态化后 idle 仅剩树激活行显示职责）
  const [idle, setIdle] = useState(true)
  const sidebarResize = useSidebarResize()

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

  // 顶部条取色令牌（v2.5）：案头视口顶部是 sidebar 色场，挂载即声明（TitleBar 换底色）
  useEffect(() => useAppStore.setState({ titlebarBg: '--sidebar' }), [])

  const closeDialog = () => {
    setDialog(null)
    setTarget(null)
    setDirTarget(null)
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

  /** 导入（.md / .xmind）：复制入库（内容按规范序列化另存，不移动原文件）；
   *  有未映射内容先预览确认（md 解析忽略块 / xmind 游离主题等摘要，同一通道） */
  const startImport = async () => {
    if (!workspaceDir) return
    try {
      const picked = await pickImportFile()
      if (picked === null) return
      // 统一产出 { tree, blocks }：md 走 parse；xmind 走 ZIP 解析（M21）
      let tree: ZenNode
      let blocks: IgnoredBlock[]
      if (picked.kind === 'md') {
        const r = parse(picked.text)
        if (!r.ok) {
          store.setError('导入失败：' + r.error)
          return
        }
        tree = r.tree
        blocks = r.ignoredBlocks
      } else {
        const r = parseXmind(picked.bytes)
        tree = r.tree
        blocks = r.warnings
      }
      if (blocks.length > 0) {
        setImportPreview({ name: picked.name, tree, blocks })
        return
      }
      const info = await commitImport(store.adapter, workspaceDir, picked.name, tree, store.preferredLayout)
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

  /** 新建目录（desk.createDir 递归，'/' 分隔逐段校验）成功后重读左树。
   *  M16 抛错语义：错误抛给 NameDialog 框内显示，成功路径才关框 */
  const confirmCreateDir = async (name: string) => {
    if (!workspaceDir) return
    await createDir(store.adapter, workspaceDir, dirParent === '' ? name : `${dirParent}/${name}`)
    setTree(await readDirTree(store.adapter, workspaceDir))
    setDialog(null)
  }

  /** 树移动收口（2026-09 拖拽 + 对话框流共用 useTreeMoves）：刷新 = maps 重扫 + 左树
   *  重读 + 预览 prune；同目录/守卫拒绝等语义见 hook 与 desk 服务注释 */
  const { moveFile, moveDir } = useTreeMoves(async () => {
    await store.refreshMaps()
    await reloadTree()
    pruneSelectedMap()
  })
  const moveTarget = (toRel: string) => {
    const t = target
    if (t === null) return
    closeDialog()
    void moveFile(t.name, t.relDir, toRel)
  }

  // 树/预览的文件清单与选中态（M5d）：文件行按 name+relDir 寻址（md 路径由 maps 反查）。
  //  排序（2026-09 收藏与排序）：modified 沿用 listMaps 序（新→旧，零成本原序）；name 与
  //  目录行同 localeCompare 口径（zh-Hans-CN 拼音序），目录内文件行与收藏组行统一适用
  const byName = (a: TreeFile, b: TreeFile): number => a.name.localeCompare(b.name, 'zh-Hans-CN')
  const files: TreeFile[] = maps.map((m) => ({ name: m.name, relDir: m.relDir }))
  // 收藏行清单（2026-09 收藏置顶）：自 maps 过滤派生——失联项（文件被删/换工作区）自动
  //  剔除，切回工作区即恢复；modified 序天然继承 maps（新→旧）
  const favMdPaths = new Set(favorites)
  const favoriteFiles: TreeFile[] = maps.filter((m) => favMdPaths.has(m.mdPath)).map((m) => ({ name: m.name, relDir: m.relDir }))
  if (librarySort === 'name') {
    files.sort(byName)
    favoriteFiles.sort(byName)
  }
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
  /** 打开新建导图对话框（rel = 目标目录；三个常驻入口传 ''，树右键传所在目录） */
  const openNewMap = (rel: string) => {
    setNewMapDir(rel)
    setDialog('new')
  }
  const openFile = (f: TreeFile) => {
    const p = mdPathOf(f)
    if (p !== undefined) void store.openMap(p)
  }
  /** 收藏切换（2026-09 收藏置顶）：TreeFile 反查 mdPath 后交 store（含持久化） */
  const toggleFavorite = (f: TreeFile) => {
    const p = mdPathOf(f)
    if (p !== undefined) void store.toggleFavorite(p)
  }
  // 树根显示工作区名（title 承担原页首路径职能）；开屏态（无工作区）不进树，占位空串。
  // 尾部分隔符收敛用字符串修剪（anchored class 正则无 ^ 锚最坏 O(n²)，Sonar S8786）
  const trimSeparators = (p: string): string => {
    let s = p
    while (s.endsWith('/') || s.endsWith('\\')) s = s.slice(0, -1)
    return s
  }
  const workspaceName = workspaceDir ? trimSeparators(workspaceDir).split(/[\\/]/).pop() ?? '' : ''

  /** 右侧内容（2026-09 两态）：工作区空 → 全局空态；详情态（选中文件）→ FileDetail
   *  （容器合并：动作钮/标题在页首，主区即预览面板）；其余（idle/选中目录）→ 欢迎页。
   *  主区不再承担文件列表——文件浏览与导航全在左树 */
  const renderRight = () => {
    if (maps.length === 0)
      return (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center text-muted-foreground"
          data-testid="library-empty"
        >
          <AppLogo size={48} />
          <p className="text-sm">空白的纸。新建一张导图，让想法落成 .md。</p>
          <Button size="sm" data-testid="library-empty-new" onClick={() => openNewMap('')}>
            新建导图
          </Button>
        </div>
      )
    // 详情态（容器合并）：动作钮/标题在页首（见 header），主区只剩预览面板
    if (selectedInfo !== null) return <FileDetail info={selectedInfo} />
    // 欢迎页（v2.5 纵轴轮）：独立组件 WelcomePane（品牌头 + 居中双按钮 + 行列表）
    return (
      <WelcomePane
        recent={recent}
        onNew={() => openNewMap('')}
        onImport={() => void startImport()}
        onOpen={(m) => void store.openMap(m.mdPath)}
      />
    )
  }

  // 无工作区 → 开屏页（M5d spec §2）：替代旧 hint；骨架（侧栏/页首）在此态不渲染
  if (!workspaceDir)
    return (
      <div className="library relative flex h-full flex-col bg-background">
        {error && <div className="error-banner">{error}</div>}
        <WelcomeScreen onCreateWorkspace={() => void chooseWorkspace()} />
        {/* 右下主题钮（2026-09 三态统一）：开屏无 SidebarInset 浮层，锚定视口级 .library */}
        <ThemeFab />
      </div>
    )

  return (
    <div className="library flex h-full flex-col bg-background">
      {/* --sidebar-width 覆盖（2026-09 分区拖拽，详见 useSidebarResize） */}
      <SidebarProvider className="min-h-0 flex-1" style={sidebarResize.style}>
        {/* variant=inset（M14b 区块化）：官方机器承担分区——侧栏去 border-r 改留悬浮呼吸位，
            wrapper 自动换 bg-sidebar 色场，SidebarInset 自动成 rounded-xl shadow-sm 白色浮层。
            分区靠「色场 vs 圆角浮层」，不靠线条。
            className 落在官方 fixed 容器上（cn 合并，tw-merge 顶掉 inset-y-0/h-svh）：
            官方假设侧栏顶层贴视口，本项目上方有 h-8 TitleBar——top-8 让侧栏从标题栏底
            锚定，SidebarHeader 内搜索框方能与 SidebarInset 浮层上边框齐平（top-8 与
            TitleBar 的 h-8 联动） */}
        <Sidebar variant="inset" data-testid="dir-panel" className="top-8 bottom-0 h-auto">
          {/* 侧栏头（v2.5 上移）：朱砂方印 + 品名移入全局 TitleBar（自定义标题栏左侧），
              此处不再重复展示 */}
          {/* 侧栏内容 = 左树（DirectoryTree 内部即 SidebarContent/Group/Menu 官方骨架）；
              空工作区也可先建目录组织结构；树含导图文件行（M5d） */}
          <DirectoryTree
            tree={tree}
            files={files}
            rootLabel={workspaceName}
            rootTooltip={workspaceDir}
            selected={idle ? null : selectedDir}
            selectedFile={selectedInfo === null ? null : { name: selectedInfo.name, relDir: selectedInfo.relDir }}
            favorites={favoriteFiles}
            onToggleFavorite={toggleFavorite}
            sort={librarySort}
            onSortChange={(s) => void store.setLibrarySort(s)}
            onSelect={(rel) => {
              setSelectedMap(null)
              setIdle(false)
              store.setSelectedDir(rel)
            }}
            onSelectFile={selectFile}
            onOpenFile={openFile}
            onFileAction={(a, f) => {
              // 右键菜单操作：TreeFile 按 name+relDir 反查 MapInfo（对话框流与详情页首同源）
              const m = maps.find((x) => x.name === f.name && x.relDir === f.relDir)
              if (m !== undefined) {
                setTarget(m)
                setDialog(a)
              }
            }}
            onCreateMapIn={openNewMap}
            onCreateDirIn={(rel) => {
              setDirParent(rel)
              setDialog('newdir')
            }}
            onDeleteDir={(rel) => {
              const segs = rel.split('/')
              setDirTarget({ rel, name: segs.at(-1) ?? rel })
              setDialog('deletedir')
            }}
            onMoveFile={(f, toRel) => { void moveFile(f.name, f.relDir, toRel) }}
            onMoveDir={(fromRel, toRel) => { void moveDir(fromRel, toRel) }}
          />
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  data-testid="dir-create"
                  tooltip={selectedDir === '' ? '在工作区根下新建目录' : `在「${selectedDir}」下新建目录`}
                  onClick={() => {
                    setDirParent(selectedDir)
                    setDialog('newdir')
                  }}
                >
                  <IconPlus />
                  <span>新建目录</span>
                </SidebarMenuButton>
                {/* 收起本面板（2026-09 重定位）：官方 SidebarMenuAction 槽位居于行右侧，
                    钮在面板内、所指即自身；唤回入口见 ShowSidebarTab（折叠态左缘浮签） */}
                <HideSidebarAction />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
          {sidebarResize.resizer}
        </Sidebar>
        {/* 唤回签（2026-09 重定位）：面板滑出后浮于视口左缘，fixed 定位不参与 flex 布局 */}
        <ShowSidebarTab />
        <SidebarInset>
          {/* 页首（官方 SiteHeader 模式，border-b 恢复——M15 验收：要的是柔和线不是没有线；
              线色走 --border 令牌，夜航令牌已调亮非黑）：标题 … 动作钮（折叠钮 2026-09
              重定位移出页首——可见态在侧栏底栏、隐藏态在左缘浮签，见 SidebarToggles；
              主题钮 2026-09 移出页首，与纸面统一挂右下角 theme-fab，见下方 main 后）。
              容器合并改版：@container 承担详情动作收纳（页首宽 = SidebarInset 宽，随窗体/
              侧栏折叠变化，容器查询比视口断点更准）；详情态标题换 md 文件名（truncate 截断
              加 …），元信息并入 title 悬停。无固定高（零固定）——内部控件全 h-8 档撑出
              行高 32px+1px 线，与侧栏搜索框（32px）同高对齐 */}
          <header className="@container flex shrink-0 items-center gap-2 border-b px-4">
            <h1
              className="truncate text-sm font-semibold tracking-wide text-foreground"
              title={selectedInfo === null ? undefined : `${detailTitle(selectedInfo)}\n${detailMeta(selectedInfo)}`}
            >
              {selectedInfo === null ? workspaceName : detailTitle(selectedInfo)}
            </h1>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              {selectedInfo !== null && (
                <DetailActions
                  info={selectedInfo}
                  favorite={favMdPaths.has(selectedInfo.mdPath)}
                  onToggleFavorite={() => void store.toggleFavorite(selectedInfo.mdPath)}
                  onBack={() => {
                    // 关闭预览：清文件选中即回落欢迎页
                    setSelectedMap(null)
                  }}
                  onAction={(a, m) => {
                    // 与资源管理器 tile 悬停操作同流（对话框在 LibraryView 统一管理）
                    setTarget(m)
                    setDialog(a)
                  }}
                  onCopyPath={(p) => void writeClipboard(p)}
                  onOpen={(m) => void store.openMap(m.mdPath)}
                />
              )}
              {iconBtn('设置', 'btn-settings', IconSettings, () => setDialog('settings'))}
              {iconBtn('导入 .md', 'btn-import', IconImport, () => void startImport())}
              {iconBtn('新建导图', 'btn-new', IconPlus, () => openNewMap(''))}
            </div>
          </header>
          {error && <div className="error-banner">{error}</div>}
          {/* 主区（官方 p-6）：两态（欢迎页 / 详情态预览面板）；详情态 p-0——容器
              合并后预览区 edge-to-edge 铺满 SidebarInset（bg-muted 贴圆角边） */}
          <main className={selectedInfo !== null ? 'flex min-h-0 flex-1 p-0' : 'flex min-h-0 flex-1 p-6'}>
            {renderRight()}
          </main>
          {/* 右下主题钮（2026-09 三态统一）：SidebarInset 自身 relative，锚点即圆角浮层右下角 */}
          <ThemeFab />
        </SidebarInset>
      </SidebarProvider>

      {/* 新建导图（M16 换 NewMapDialog）：名称 + 模板选择；四个入口（页首 btn-new/
          空态 library-empty-new/欢迎页 desk-idle-new/树目录行右键 ctx-btn-new-map）
          共用本对话框——右键入口带目标目录（标题示目录、落盘建在彼处） */}
      {dialog === 'new' && (
        <NewMapDialog
          inDirLabel={newMapDir === '' ? undefined : newMapDir}
          onCancel={() => setDialog(null)}
          onConfirm={async (name, templateContent) => {
            await store.createAndOpen(name, templateContent, newMapDir)
            setDialog(null)
          }}
        />
      )}
      {/* 设置对话框（M5b Task 4 + M5d 更换工作区 + v0.7.0 退出工作区）：与其他对话框共用 dialog 互斥状态；
          更换工作区先关对话框再走 pickDirectory 流（同开屏「创建工作区」）；退出工作区清 store 落
          workspaceDir:null 回开屏页（无工作区分支渲染 WelcomeScreen） */}
      {dialog === 'settings' && (
        <SettingsDialog
          onOpenHistory={() => setDialog('history')}
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
      {/* 版本历史/回滚（M22）：从设置页打开（Radix modal 互斥，settings 先关再开本框） */}
      {dialog === 'history' && <HistoryDialog onClose={() => setDialog(null)} />}
      {dialog === 'rename' && target && (
        <NameDialog
          title="重命名导图"
          initial={target.name}
          confirmText="重命名"
          onCancel={closeDialog}
          onConfirm={async (name) => {
            // M16 抛错语义：renameMap 失败抛给对话框框内显示，成功才关框
            await renameMap(store.adapter, workspaceDir!, target.relDir, target.name, name)
            // 收藏跟随换址（2026-09）：改名即换 mdPath，先 relocate 再刷新（星标不随改名丢失）
            await store.relocateFavorite(target.mdPath, joinPath(resolveDir(workspaceDir!, target.relDir), name.trim() + '.md'))
            await store.refreshMaps()
            pruneSelectedMap()
            closeDialog()
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
      {/* 删除目录（2026-09 树右键）：整目录进回收站——内含导图数实时取自 maps（确认框
          报数，用户知情）；删除后选中目录若在被删子树内则回根视图 */}
      {dialog === 'deletedir' && dirTarget && (
        <DeleteConfirmDialog
          title={`删除目录「${dirTarget.name}」？`}
          body={dirDeleteSummary(maps, tree, dirTarget.rel)}
          onCancel={closeDialog}
          onConfirm={() => {
            const rel = dirTarget.rel
            closeDialog()
            void (async () => {
              try {
                await deleteDir(store.adapter, workspaceDir!, rel)
                await store.refreshMaps()
                setTree(await readDirTree(store.adapter, workspaceDir!))
                pruneSelectedMap()
                // 选中目录在被删子树内（含本身）→ 回根视图；文件选中已由 prune 清
                const cur = useAppStore.getState().selectedDir
                if (cur === rel || cur.startsWith(rel + '/')) {
                  store.setSelectedDir('')
                  setSelectedMap(null)
                  setIdle(true)
                }
                store.setError(null)
              } catch (e) {
                store.setError('删除目录失败：' + (e instanceof Error ? e.message : String(e)))
              }
            })()
          }}
        />
      )}
      {/* 对话框互斥约定（ui Dialog）：本视图至多同时一个对话框——dialog（新建/重命名/删除/移动/新建目录）
          与 importPreview 互不并存：Radix Dialog 为 modal（遮罩挡背景 + 滚动锁定），两条入口天然互斥 */}
      {dialog === 'delete' && target && (
        <DeleteConfirmDialog
          title={`删除「${target.name}」？`}
          body="将移入回收站（.md 与 .zen.json 一起删除）。"
          onCancel={closeDialog}
          onConfirm={async () => {
            closeDialog()
            try {
              await deleteMap(store.adapter, workspaceDir!, target.relDir, target.name)
              await store.refreshMaps()
              pruneSelectedMap()
            } catch (e) {
              store.setError('删除失败：' + String(e))
            }
          }}
        />
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
        <ImportPreviewDialog
          preview={importPreview}
          onCancel={() => setImportPreview(null)}
          onConfirm={() => void confirmImport()}
        />
      )}
    </div>
  )
}
