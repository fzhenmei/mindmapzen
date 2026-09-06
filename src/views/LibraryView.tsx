import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { readDirTree, type DirNode } from '../services/desk'
import { sortLocale } from '../i18n/resolve'
import { useLibraryDialogs, type PickedImport } from '../hooks/useLibraryDialogs'
import { useTreeMoves } from '../hooks/useTreeMoves'
import { useSidebarResize } from '../hooks/useSidebarResize'
import type { WriteClipboard } from '../services/clipboard'
import LibraryDialogs from '../components/LibraryDialogs'
import WelcomePane from '../components/WelcomePane'
import { ThemeFab } from '../components/ThemeToggle'
import WelcomeScreen from '../components/WelcomeScreen'
import AppLogo from '../components/AppLogo'
import DirectoryTree, { type TreeFile } from '../components/DirectoryTree'
import FileDetail from '../components/FileDetail'
import DetailActions, { detailMeta, detailTitle } from '../components/DetailActions'
import { IconImport, IconPlus, IconSettings } from '../components/icons'
import { HideSidebarAction, ShowSidebarTab, SIDEBAR_ICON_BTN } from '../components/SidebarToggles'
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

// 导入源载荷随对话框集群迁 useLibraryDialogs（2026-09 行数护栏拆分）；
// 此处 re-export 保 App/e2eHarness 的既有引用稳定
export type { PickedImport } from '../hooks/useLibraryDialogs'

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
  const { t, i18n } = useTranslation()
  const { workspaceDir, maps, error, selectedDir, favorites, librarySort } = useAppStore()
  const recentOpened = useAppStore((s) => s.recentOpened)
  // 最近打开清单 → 导图信息（已删/移出工作区的宽容剔除，最多 8 条）
  const recent = recentOpened
    .map((p) => maps.find((m) => m.mdPath === p) ?? null)
    .filter((m): m is MapInfo => m !== null)
    .slice(0, 8)
  const store = useAppStore.getState()
  // 案头左树（目录结构在 workspaceDir 变化与目录增删后重读）
  const [tree, setTree] = useState<DirNode[]>([])
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
      store.setError(t('errors.setWorkspaceFailed', { reason: String(e) }))
    }
  }

  /** 树移动收口（2026-09 拖拽 + 对话框流共用 useTreeMoves）：刷新 = maps 重扫 + 左树
   *  重读 + 预览 prune；同目录/守卫拒绝等语义见 hook 与 desk 服务注释 */
  const { moveFile, moveDir } = useTreeMoves(async () => {
    await store.refreshMaps()
    await reloadTree()
    pruneSelectedMap()
  })

  // 对话框集群（2026-09 行数护栏拆分）：状态机与业务确认在 useLibraryDialogs，渲染在
  // LibraryDialogs；视图仅注入联动依赖（选中清理/左树重读/工作区选择/树移动/目录删除回落）
  const dlg = useLibraryDialogs({
    pickImportFile,
    chooseWorkspace,
    reloadTree,
    pruneSelectedMap,
    onDirRemoved: (rel) => {
      // 选中目录在被删子树内（含本身）→ 回根视图；文件选中已由 prune 清
      const cur = useAppStore.getState().selectedDir
      if (cur === rel || cur.startsWith(rel + '/')) {
        store.setSelectedDir('')
        setSelectedMap(null)
        setIdle(true)
      }
    },
    moveFile,
  })

  // 树/预览的文件清单与选中态（M5d）：文件行按 name+relDir 寻址（md 路径由 maps 反查）。
  //  排序（2026-09 收藏与排序）：modified 沿用 listMaps 序（新→旧，零成本原序）；name 与
  //  目录行同 localeCompare 口径（中文拼音序/英文字母序，随界面语言），目录内文件行与
  //  收藏组行统一适用
  const byName = (a: TreeFile, b: TreeFile): number =>
    a.name.localeCompare(b.name, sortLocale(i18n.language === 'en' ? 'en' : 'zh-CN'))
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
          <p className="text-sm">{t('library.library.emptyHint')}</p>
          <Button size="sm" data-testid="library-empty-new" onClick={() => dlg.openNewMap('')}>
            {t('library.library.newMap')}
          </Button>
        </div>
      )
    // 详情态（容器合并）：动作钮/标题在页首（见 header），主区只剩预览面板
    if (selectedInfo !== null) return <FileDetail info={selectedInfo} />
    // 欢迎页（v2.5 纵轴轮）：独立组件 WelcomePane（品牌头 + 居中双按钮 + 行列表）
    return (
      <WelcomePane
        recent={recent}
        onNew={() => dlg.openNewMap('')}
        onImport={() => void dlg.startImport()}
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
              if (m !== undefined) dlg.openMapAction(a, m)
            }}
            onCreateMapIn={dlg.openNewMap}
            onCreateDirIn={dlg.openNewDir}
            onDeleteDir={dlg.openDeleteDir}
            onMoveFile={(f, toRel) => { void moveFile(f.name, f.relDir, toRel) }}
            onMoveDir={(fromRel, toRel) => { void moveDir(fromRel, toRel) }}
          />
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                {/* 底栏弹性行（2026-09）：新建目录占满余宽，右端成对图标钮 = 设置 +
                    收起面板（设置自页首移入，居隐藏钮左侧）；两钮同款侧栏令牌样式
                    （SIDEBAR_ICON_BTN），收起钮见 SidebarToggles */}
                <div className="flex items-center gap-1">
                  <SidebarMenuButton
                    data-testid="dir-create"
                    tooltip={selectedDir === '' ? t('library.library.newDirTooltip') : t('library.library.newDirTooltipIn', { dir: selectedDir })}
                    className="w-auto min-w-0 flex-1"
                    onClick={() => dlg.openNewDir(selectedDir)}
                  >
                    <IconPlus />
                    <span>{t('library.library.newDir')}</span>
                  </SidebarMenuButton>
                  <button
                    type="button"
                    data-testid="btn-settings"
                    aria-label={t('library.library.settings')}
                    title={t('library.library.settings')}
                    className={SIDEBAR_ICON_BTN}
                    onClick={() => dlg.openDialog('settings')}
                  >
                    <IconSettings />
                  </button>
                  <HideSidebarAction />
                </div>
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
                    dlg.openMapAction(a, m)
                  }}
                  onCopyPath={(p) => void writeClipboard(p)}
                  onOpen={(m) => void store.openMap(m.mdPath)}
                />
              )}
              {/* 动作钮顺序（2026-09）：新建在前、导入在后，与欢迎页居中双钮同序；
                  设置已移入侧栏底栏（居隐藏面板钮左侧） */}
              {iconBtn(t('library.library.newMap'), 'btn-new', IconPlus, () => dlg.openNewMap(''))}
              {iconBtn(t('library.library.importMd'), 'btn-import', IconImport, () => void dlg.startImport())}
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

      {/* 对话框集群（2026-09 行数护栏拆分）：状态机与业务确认在 useLibraryDialogs，
          渲染在 LibraryDialogs——九框互斥约定与注释见该容器 */}
      <LibraryDialogs api={dlg} maps={maps} tree={tree} />
    </div>
  )
}
