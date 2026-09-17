import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { readDirTree, type DirNode } from '../services/desk'
import { sortLocale } from '../i18n/resolve'
import { useLibraryDialogs, type PickedImport } from '../hooks/useLibraryDialogs'
import { useTreeMoves } from '../hooks/useTreeMoves'
import { useSidebarResize } from '../hooks/useSidebarResize'
import type { WriteClipboard, WriteHtmlClipboard } from '../services/clipboard'
import { copyAsWechatHtml } from '../services/wechatCopy'
import LibraryDialogs from '../components/LibraryDialogs'
import WelcomePane from '../components/WelcomePane'
import DeskOverview from '../components/DeskOverview'
import { ThemeFab } from '../components/ThemeToggle'
import WelcomeScreen from '../components/WelcomeScreen'
import CloneDialog, { type CloneRequest } from '../components/CloneDialog'
import { cloneWorkspace, repoNameFromUrl } from '../services/gitClone'
import { joinPath } from '../services/workspace'
import AppLogo from '../components/AppLogo'
import DirectoryTree, { type TreeFile } from '../components/DirectoryTree'
import FilePreviewPopover from '../components/FilePreviewPopover'
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
  /** 富文本剪贴板写入端口（2026-09 公众号复制）：text/html 形态，注入模式同上 */
  writeHtmlClipboard: WriteHtmlClipboard
}

/** 案头（2026-09 画布三态 M2 主区单态）：SidebarProvider + inset 骨架；主区收敛
 *  单态——工作区空 → 全局空态，其余（idle/选中目录/选中文件）→ 欢迎页。详情态
 *  （FileDetail + 页首动作组）退役：树文件行单击 = 右区右上悬浮预览
 *  （FilePreviewPopover，spec §4.2），双击 = 进纸面；文件操作（星标/打开/移动/
 *  重命名/删除/复制路径/公众号复制）收敛左树（行尾收藏钮 + 右键菜单）。树目录行
 *  单击 = 选中目录（主区仍欢迎页） */
export default function LibraryView({ pickDirectory, pickImportFile, writeClipboard, writeHtmlClipboard }: Readonly<Props>) {
  const { t, i18n } = useTranslation()
  const { workspaceDir, maps, error, selectedDir, favorites, librarySort } = useAppStore()
  const recentOpened = useAppStore((s) => s.recentOpened)
  // App 级对话框开合（设置/历史）：作浮窗挂载门——开着时卸载浮窗，防一次 Esc 双关
  const appDialog = useAppStore((s) => s.appDialog)
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
   *  （否则预览指向已不存在的文件、卡片高亮悬空）。须在 maps 已刷新后调用。
   *  useCallback 固定身份（体仅引用稳定的 setSelectedMap 与模块导入，无反应式依赖，
   *  同 reloadTree 先例）——下方兜底 effect 依赖它，身份恒定不引入多余触发 */
  const pruneSelectedMap = useCallback(() => {
    setSelectedMap((cur) =>
      cur !== null && useAppStore.getState().maps.some((m) => m.mdPath === cur) ? cur : null,
    )
  }, [])

  // 工作区切换后的选中失效清理（2026-09 导航系统）：设置迁 AppDialogs 后更换工作区
  // 不再经过本视图 deps——按 workspaceDir 变化兜底清选中，防旧工作区文件残留详情态。
  // maps 进依赖闭合时序窗：setWorkspace 先置 workspaceDir 后 await refreshMaps，仅依赖
  // workspaceDir 时 effect 在旧清单上判定（失联不可见 → 不剪），maps 落地后再补剪一次
  // 才真正闭合（prune 幂等——刷新/增删后的常规 maps 更新对有效选中是 no-op）；
  // 挂载时触发为 no-op（选中本就是 null）
  useEffect(() => {
    pruneSelectedMap()
  }, [workspaceDir, maps, pruneSelectedMap])

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

  /** 「从 Git 库打开」对话框开合（开屏态专属入口） */
  const [cloneOpen, setCloneOpen] = useState(false)
  /** 克隆确认：前置目录存在检查（防 git 因目标非空报错后误回收用户既有目录）→
   *  服务层克隆 + 注册 zen-origin → 成功设为工作区。失败抛错给对话框就地显示
   *  （NewMapDialog 同契约）；半成品目录走 adapter.remove（Tauri=回收站） */
  const cloneFromGit = async (req: CloneRequest) => {
    const { gitClone, gitRun, adapter } = useAppStore.getState()
    if (gitClone === null || gitRun === null) throw new Error(t('errors.gitNotEnabled'))
    const name = repoNameFromUrl(req.url)
    if (name === '') throw new Error(t('errors.git.clone.nameUnparsable'))
    const target = joinPath(req.parentDir, name)
    if (await adapter.exists(target)) throw new Error(t('errors.git.clone.dirExists', { path: target }))
    const r = await cloneWorkspace(req.parentDir, req.url, req.username, req.password, gitClone, gitRun)
    if (!r.ok) {
      // 克隆已确认目标原不存在，此刻残留即半成品——回收安全；回收失败不淹没克隆报错，留痕即可
      if (r.dir !== '' && (await adapter.exists(r.dir))) {
        await adapter.remove(r.dir).catch((e) => console.warn('克隆半成品回收失败（不影响报错）:', e))
      }
      throw new Error(r.error)
    }
    await store.setWorkspace(r.dir)
    setCloneOpen(false)
    pruneSelectedMap()
  }

  /** 树移动收口（2026-09 拖拽 + 对话框流共用 useTreeMoves）：刷新 = maps 重扫 + 左树
   *  重读 + 预览 prune；同目录/守卫拒绝等语义见 hook 与 desk 服务注释 */
  const { moveFile, moveDir } = useTreeMoves(async () => {
    await store.refreshMaps()
    await reloadTree()
    pruneSelectedMap()
  })

  // 对话框集群（2026-09 行数护栏拆分）：状态机与业务确认在 useLibraryDialogs，渲染在
  // LibraryDialogs；视图仅注入联动依赖（选中清理/左树重读/树移动/目录删除回落）
  const dlg = useLibraryDialogs({
    pickImportFile,
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
  /** 关闭悬浮预览：清选中回落欢迎页（树高亮随 selectedInfo 派生同步清） */
  const closePreview = useCallback(() => setSelectedMap(null), [])
  const selectFile = (f: TreeFile) => {
    const p = mdPathOf(f)
    if (p !== undefined) {
      // 再点同一文件：浮窗开→关、关→开（spec §4.1 关窗路径之一；其余关窗路在浮窗组件内）
      setSelectedMap((cur) => (cur === p ? null : p))
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

  /** 右侧内容（2026-09 画布三态 M2 单态）：工作区空 → 全局空态；其余（idle/选中
   *  目录/选中文件）→ 欢迎页——文件预览由悬浮浮窗承担（挂载见 main 内）。主区不再
   *  承担文件列表——文件浏览与导航全在左树 */
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
    // 欢迎页（v2.5 纵轴轮）：独立组件 WelcomePane（品牌头 + 居中双按钮 + 行列表）；
    // overview 槽位挂案头总览（2026-09 画布三态 M3：工作台并入，页首 btn-workbench 已退役）
    return (
      <WelcomePane
        recent={recent}
        overview={<DeskOverview />}
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
        <WelcomeScreen
          onCreateWorkspace={() => void chooseWorkspace()}
          onCloneFromGit={() => setCloneOpen(true)}
        />
        {cloneOpen && (
          <CloneDialog
            pickDirectory={pickDirectory}
            onConfirm={cloneFromGit}
            onCancel={() => setCloneOpen(false)}
          />
        )}
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
              // 右键菜单操作：TreeFile 按 name+relDir 反查 MapInfo（对话框流统一入口）
              const m = maps.find((x) => x.name === f.name && x.relDir === f.relDir)
              if (m !== undefined) dlg.openMapAction(a, m)
            }}
            onCopyPath={(f) => {
              // 复制路径（管线迁自原页首 DetailActions）：TreeFile 反查 mdPath 后写剪贴板端口
              const m = maps.find((x) => x.name === f.name && x.relDir === f.relDir)
              if (m !== undefined) void writeClipboard(m.mdPath)
            }}
            onCopyWechat={(f) => {
              // 公众号格式复制（管线迁自原页首 DetailActions）：TreeFile 反查 mdPath，
              // 全链失败（读盘/渲染/剪贴板）走 error 横幅显式出口，成功静默（与复制路径惯例一致）
              const m = maps.find((x) => x.name === f.name && x.relDir === f.relDir)
              if (m === undefined) return
              void copyAsWechatHtml(
                useAppStore.getState().adapter,
                workspaceDir,
                m.mdPath,
                writeHtmlClipboard,
              ).catch((e: unknown) =>
                store.setError(t('library.fileDetail.copyWechatFailed', { reason: String(e) })),
              )
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
                    onClick={() => useAppStore.getState().openAppDialog('settings')}
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
              线色走 --border 令牌，夜航令牌已调亮非黑）。2026-09 画布三态 M2 详情态退役：
              标题恒工作区名（@container 容器查询与页首动作组随 DetailActions 一并退役），
              仅余新建/导入常驻钮（折叠钮在侧栏底栏/左缘浮签，主题钮挂右下 theme-fab）。
              无固定高（零固定）——内部控件全 h-8 档撑出行高 32px+1px 线，与侧栏搜索框
              （32px）同高对齐 */}
          <header className="flex shrink-0 items-center gap-2 border-b px-4">
            <h1 className="truncate text-sm font-semibold tracking-wide text-foreground">{workspaceName}</h1>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              {/* 动作钮顺序（2026-09）：新建在前、导入在后，与欢迎页居中双钮同序；
                  设置已移入侧栏底栏（居隐藏面板钮左侧）。工作台钮退役（2026-09 画布
                  三态 M3）：案头总览并入欢迎页 overview 槽位，入口随钮删除 */}
              {iconBtn(t('library.library.newMap'), 'btn-new', IconPlus, () => dlg.openNewMap(''))}
              {iconBtn(t('library.library.importMd'), 'btn-import', IconImport, () => void dlg.startImport())}
            </div>
          </header>
          {error && <div className="error-banner">{error}</div>}
          {/* 主区（官方 p-6）：单态（欢迎页/空态）；relative 供悬浮预览浮窗 absolute 锚定 */}
          <main className="relative flex min-h-0 flex-1 p-6">
            {renderRight()}
            {/* 悬浮预览（2026-09 画布三态 M2）：单击文件行浮现右区右上，双击照旧开纸面；
                详情态（FileDetail/页首动作钮）退役，主区收敛欢迎页单态。appDialog 挂载门
                （Task 1 评审 Esc 双关核对）：App 级对话框开着时卸载浮窗——一次 Esc 只关
                对话框（浮窗 keydown 监听随卸载移除），双关结构性消除 */}
            {selectedInfo !== null && appDialog === null && (
              <FilePreviewPopover info={selectedInfo} onClose={closePreview} />
            )}
          </main>
          {/* 右下主题钮（2026-09 三态统一）：SidebarInset 自身 relative，锚点即圆角浮层右下角 */}
          <ThemeFab />
        </SidebarInset>
      </SidebarProvider>

      {/* 对话框集群（2026-09 行数护栏拆分）：状态机与业务确认在 useLibraryDialogs，
          渲染在 LibraryDialogs——七框互斥约定与注释见该容器（设置/历史已迁 AppDialogs） */}
      <LibraryDialogs api={dlg} maps={maps} tree={tree} />
    </div>
  )
}
