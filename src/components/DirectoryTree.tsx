import { ChevronRight, Search } from 'lucide-react'
import { useRef, useState, type DragEvent, type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { basketAbsPath } from '../services/basket'
import { filterTree, isUnderDir, type DirNode } from '../services/desk'
import { joinPath, resolveDir } from '../services/workspace'
import { useAppStore } from '../store/appStore'
import type { LibrarySort } from '../types/files'
import type { MapAction } from '../hooks/useLibraryDialogs'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from './ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Input } from './ui/input'
import { Button } from './ui/button'
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from './ui/sidebar'
import { IconCopy, IconFolder, IconMarkdown, IconOpen, IconPaste, IconPencil, IconPlus, IconSort, IconStar, IconTrash } from './icons'

/** 树中导图文件行（M5d）：由 store maps 派生（name 不含扩展名；relDir 相对工作区，''=根） */
export interface TreeFile { name: string; relDir: string }

/** 拖拽载荷（2026-09 树拖拽）：dragstart 存组件 ref——组件内通信不依赖 dataTransfer
 *  读回（Playwright 合成拖拽读不回自定义 MIME，e2e 直用原生 dragAndDrop 即可测）；
 *  dataTransfer 仍写标准位（application/x-zen-tree + effectAllowed），兼容宿主惯例 */
type DragPayload = { kind: 'file'; file: TreeFile } | { kind: 'dir'; rel: string }

interface Props {
  /** 工作区目录树（desk.readDirTree 产出；根不在其中，树根行由本组件提供） */
  tree: DirNode[]
  /** 导图文件清单：目录节点展开时按 relDir 匹配渲染文件行（树成为完整文件视图） */
  files: TreeFile[]
  /** 树根显示名 = 工作区名；title 显示工作区全路径 */
  rootLabel: string
  rootTooltip: string
  /** 当前选中目录（''=工作区根；null = idle 态树无激活行，M15） */
  selected: string | null
  /** 当前选中文件（tile 或文件行单击选中）：对应文件行高亮 */
  selectedFile: TreeFile | null
  onSelect: (rel: string) => void
  /** 文件行单击：选中并预览 */
  onSelectFile: (f: TreeFile) => void
  /** 文件行双击：打开进纸面 */
  onOpenFile: (f: TreeFile) => void
  /** 文件行右键菜单操作（2026-09）：移动/重命名/删除，对话框流在 LibraryView 统一管理 */
  onFileAction(a: MapAction, f: TreeFile): void
  /** 文件行右键「复制路径」（2026-09 画布三态 M2：DetailActions 退役，操作收敛树菜单） */
  onCopyPath(f: TreeFile): void
  /** 文件行右键「复制为公众号格式」（承接同上；全链在 LibraryView，失败走 error 横幅） */
  onCopyWechat(f: TreeFile): void
  /** 目录行右键「在此新建导图」（rel = 目标目录相对路径，''=根） */
  onCreateMapIn(rel: string): void
  /** 目录行右键「新建子目录」（rel = 父目录相对路径，''=根） */
  onCreateDirIn(rel: string): void
  /** 目录行右键「删除目录」（rel = 目标目录相对路径；整目录进回收站，树根不提供） */
  onDeleteDir(rel: string): void
  /** 拖文件行落到目录行/树根（toRel=''=根）：moveMap 语义（重名自动后缀，同对话框流） */
  onMoveFile(f: TreeFile, toRel: string): void
  /** 拖目录行落到目录行/树根（toRel=''=根）：moveDir 语义（同目录无操作；目标为自身
   *  子孙或目标下重名时由服务层拒绝报错） */
  onMoveDir(fromRel: string, toRel: string): void
  /** 收藏清单（2026-09 收藏置顶）：已解析已排序的 TreeFile（视图层自 store∩maps 宽容
   *  派生）；渲染顶部收藏组（空则整组隐藏），兼作行级收藏态判据（relDir+name 寻址） */
  favorites: TreeFile[]
  /** 收藏切换（收藏组行/文件行右键）：视图层换址 mdPath 后调 store.toggleFavorite */
  onToggleFavorite(f: TreeFile): void
  /** 列表排序当前档（2026-09）：单选指示；两档作用于目录内文件行与收藏组行 */
  sort: LibrarySort
  /** 排序切换（搜索框旁排序钮下拉） */
  onSortChange(s: LibrarySort): void
}

/** 案头左树（M15 官方 collapsible 文件树，仿 shadcn "A sidebar with a collapsible
 *  file tree"）：目录行 = Collapsible + ChevronRight 官方旋入动画，子目录与文件行进
 *  SidebarMenuSub（官方缩进导轨），任意深度递归。交互分工：行面单击 = 选中，行首
 *  箭头 = 折叠/展开（2026-09 资源管理器式：CollapsibleTrigger 独立按钮居于图标左侧，
 *  与行面选中解耦——点已展开目录不会误收起子树；空目录/文件行以等宽占位对齐图标列）。
 *  全部 defaultOpen（进案头即全树展开，延续旧行为）。
 *  右键菜单（2026-09 资源管理器惯例）：文件行 = 打开/收藏/移动/重命名/删除 + 复制路径/
 *  复制为公众号格式（2026-09 画布三态 M2，DetailActions 退役承接）；目录行 = 在此
 *  新建导图/新建子目录/删除目录；树根 = 同目录行但无删除（工作区本体不删）。ctx-*
 *  testid 与详情页首同名钮区分避严格模式撞名。右键即选中（VSCode 惯例）——文件行切
 *  预览、目录行切选中态。
 *  收藏与排序（2026-09）：顶部收藏组（空则整组隐藏，行 testid fav-node-<name>）+
 *  搜索框旁排序钮（dir-sort，两档单选，目录内文件行与收藏行统一适用；目录仍按名称）。
 *  testid 沿用：目录 `dir-node-<name>`、文件 `file-node-<name>`、树根 `dir-node-all` */
export default function DirectoryTree({
  tree,
  files,
  rootLabel,
  rootTooltip,
  selected,
  selectedFile,
  onSelect,
  onSelectFile,
  onOpenFile,
  onFileAction,
  onCopyPath,
  onCopyWechat,
  onCreateMapIn,
  onCreateDirIn,
  onDeleteDir,
  onMoveFile,
  onMoveDir,
  favorites,
  onToggleFavorite,
  sort,
  onSortChange,
}: Readonly<Props>) {
  const { t } = useTranslation()
  // 侧栏搜索（v2.5）：占位原 SidebarHeader（logo 上移 TitleBar 后空出的位）。
  //  过滤在 desk.filterTree（纯函数）；搜索态强制全树展开（defaultOpen 非受控只在
  //  首挂生效，折叠中的目录里有命中文件时靠受控 open 展开），清空即复原
  const [query, setQuery] = useState('')
  const q = query.trim()
  const searching = q !== ''
  const filtered = searching ? filterTree(tree, files, q) : { tree, files }

  // 收藏（2026-09 收藏置顶）：行级判据与渲染清单同源于 favorites 单一 prop——relDir+name
  //  寻址（与文件选中态同口径）；搜索时收藏组同口径过滤（文件名包含命中）
  const fileKey = (f: TreeFile): string => `${f.relDir}/${f.name}`
  const favSet = new Set(favorites.map(fileKey))
  const favFiles = searching ? favorites.filter((f) => f.name.toLowerCase().includes(q.toLowerCase())) : favorites

  // 篮子徽章（Task 10）：篮子文件行一眼可认——行内 TreeFile 只有 name+relDir，按与 listMaps
  //  同口径（resolveDir+joinPath）反推 mdPath 后与 basketAbsPath 比对（同 EditorView isBasket
  //  的绝对路径口径）：同名不同目录不误标。读 store 不加 props——徽章纯派生，调用方零接线；
  //  两字段均可为 null（未选工作区/篮子未定），判空在前
  const workspaceDir = useAppStore((s) => s.workspaceDir)
  const basketRelPath = useAppStore((s) => s.basketRelPath)
  const basketAbs = workspaceDir !== null && basketRelPath !== null ? basketAbsPath(workspaceDir, basketRelPath) : null
  const isBasketFile = (f: TreeFile): boolean =>
    workspaceDir !== null && basketAbs !== null && joinPath(resolveDir(workspaceDir, f.relDir), `${f.name}.md`) === basketAbs

  // 拖拽态（2026-09）：drag ref 存载荷；dragging 标识被拖行（半透明）；dropTarget 高亮
  //  合法落点行。落点守卫：目录行/树根可落（isUnderDir 含自身——拖目录到自己上不高亮）；
  //  文件行不是落点。drop 后 dragend 前载荷即清，防串次拖拽
  const drag = useRef<DragPayload | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const canDrop = (toRel: string): boolean => {
    const d = drag.current
    return d !== null && (d.kind === 'file' || !isUnderDir(toRel, d.rel))
  }
  const startDrag = (p: DragPayload, key: string) => (e: DragEvent<HTMLElement>) => {
    drag.current = p
    setDragging(key)
    if (e.dataTransfer !== null) {
      e.dataTransfer.setData('application/x-zen-tree', JSON.stringify(p))
      e.dataTransfer.effectAllowed = 'move'
    }
  }
  const dragOver = (rel: string) => (e: DragEvent<HTMLElement>) => {
    if (!canDrop(rel)) return
    e.preventDefault()
    if (e.dataTransfer !== null) e.dataTransfer.dropEffect = 'move'
    setDropTarget(rel)
  }
  const dragLeave = (rel: string) => (e: DragEvent<HTMLElement>) => {
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return // 行内子元素间移动不算离开
    setDropTarget((cur) => (cur === rel ? null : cur))
  }
  const drop = (rel: string) => (e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    setDropTarget(null)
    const d = drag.current
    if (d === null || !canDrop(rel)) return // 非法落点直发 drop 亦无操作（防御）
    if (d.kind === 'file') onMoveFile(d.file, rel)
    else onMoveDir(d.rel, rel)
    drag.current = null
  }
  const endDrag = () => {
    drag.current = null
    setDragging(null)
    setDropTarget(null)
  }

  const isFileSelected = (f: TreeFile) =>
    selectedFile !== null && selectedFile.name === f.name && selectedFile.relDir === f.relDir

  /** 文件行右键菜单（对话框流在 LibraryView；条目 ctx-* testid 与详情页首同名钮区分）。
   *  2026-09 收藏：「打开」下增收藏切换（按行级收藏态换文案）。
   *  2026-09 画布三态 M2：删除后隔线补「复制路径/复制为公众号格式」（DetailActions
   *  退役承接，图标与词条沿用详情页首同名钮） */
  const fileMenu = (f: TreeFile) => (
    <ContextMenuContent data-testid={`ctx-menu-file-${f.name}`} aria-label={t('library.dirTree.fileMenuLabel', { name: f.name })}>
      <ContextMenuItem data-testid="ctx-btn-open" onClick={() => onOpenFile(f)}>
        <IconOpen />{t('common.open')}
      </ContextMenuItem>
      <ContextMenuItem data-testid="ctx-btn-favorite" onClick={() => onToggleFavorite(f)}>
        <IconStar />{favSet.has(fileKey(f)) ? t('library.unfavorite') : t('library.favorite')}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem data-testid="ctx-btn-move" onClick={() => onFileAction('move', f)}>
        <IconFolder />{t('library.moveToDir')}
      </ContextMenuItem>
      <ContextMenuItem data-testid="ctx-btn-rename" onClick={() => onFileAction('rename', f)}>
        <IconPencil />{t('common.rename')}
      </ContextMenuItem>
      <ContextMenuItem data-testid="ctx-btn-delete" variant="destructive" onClick={() => onFileAction('delete', f)}>
        <IconTrash />{t('common.delete')}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem data-testid="ctx-btn-copy-path" onClick={() => onCopyPath(f)}>
        <IconCopy />{t('library.fileDetail.copyPath')}
      </ContextMenuItem>
      <ContextMenuItem data-testid="ctx-btn-copy-wechat" onClick={() => onCopyWechat(f)}>
        <IconPaste />{t('library.fileDetail.copyWechat')}
      </ContextMenuItem>
    </ContextMenuContent>
  )

  /** 目录行右键菜单（rel = 目标目录）：新建导图于此 / 新建子目录 /（可删时）删除目录。
   *  树根（deletable=false）不提供删除——工作区本体走设置页「退出工作区」流 */
  const dirMenu = (rel: string, deletable: boolean) => (
    <ContextMenuContent aria-label={t('library.dirTree.dirMenuLabel')}>
      <ContextMenuItem data-testid="ctx-btn-new-map" onClick={() => onCreateMapIn(rel)}>
        <IconPlus />{t('library.dirTree.newMapHere')}
      </ContextMenuItem>
      <ContextMenuItem data-testid="ctx-btn-new-dir" onClick={() => onCreateDirIn(rel)}>
        <IconFolder />{t('library.dirTree.newSubdir')}
      </ContextMenuItem>
      {deletable && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem data-testid="ctx-btn-delete-dir" variant="destructive" onClick={() => onDeleteDir(rel)}>
            <IconTrash />{t('library.dirTree.deleteDir')}
          </ContextMenuItem>
        </>
      )}
    </ContextMenuContent>
  )

  /** 行首箭头槽（资源管理器式）：有子目录/文件 → 折叠扳机；否则等宽占位，图标列对齐 */
  const chevronSlot = 'flex size-5 shrink-0 items-center justify-center'

  /** 文件行（叶子）：[占位][图标][名称][收藏钮] 等宽文件声道；行面包 ContextMenu（右键
   *  开菜单，右键即选中切预览——VSCode 惯例）。可拖（draggable）不可落——文件不作落点。
   *  2026-09 收藏：行尾悬停收藏钮（fav-btn-*）——已收藏常显（状态指示兼一键取消），未
   *  收藏 hover 显示；favRow 变体（收藏组行）用主菜单骨架与星标图标、testid fav-node-*，
   *  收藏钮仅 hover 显示（行首星标已示态，钮是移除动作） */
  const renderFile = (f: TreeFile, key: string, favRow = false) => {
    const fav = favSet.has(fileKey(f))
    const Item = favRow ? SidebarMenuItem : SidebarMenuSubItem
    const Btn = favRow ? SidebarMenuButton : SidebarMenuSubButton
    return (
      <Item key={key}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className={`group/frow flex min-w-0 flex-1 items-center ${dragging === key ? 'opacity-50' : ''}`}
              data-tree-file-row
              draggable
              onDragStart={startDrag({ kind: 'file', file: f }, key)}
              onDragEnd={endDrag}
              onContextMenu={() => onSelectFile(f)}
            >
              <span aria-hidden="true" className={chevronSlot} />
              <Btn
                asChild
                isActive={isFileSelected(f)}
                data-testid={favRow ? `fav-node-${f.name}` : `file-node-${f.name}`}
                title={`${f.name}.md`}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left font-file text-xs"
                  onClick={() => onSelectFile(f)}
                  onDoubleClick={() => onOpenFile(f)}
                >
                  {favRow ? <IconStar /> : <IconMarkdown />}
                  {/* 名称 span 不 flex-1（2026-09 审查裁定）：徽章「贴名称末尾」而非右对齐——
                      与胶囊条同款观感。收缩仍由名称承担（min-w-0 + shrink 默认 1，长名照样截断），
                      徽章/图标 shrink-0 恒显，行热区随 button（flex-1）不变 */}
                  <span className="min-w-0 truncate">{f.name}</span>
                  {/* 篮子徽章（Task 10）：贴名称末尾，shrink-0 不挤压既有布局（名称收缩在前，
                      徽章恒可见），aria-hidden 纯装饰不占无障碍读序 */}
                  {isBasketFile(f) && (
                    <span data-testid="basket-badge" aria-hidden className="ml-1 shrink-0 text-[10px] opacity-70">
                      ◱
                    </span>
                  )}
                </button>
              </Btn>
              {/* 悬停收藏浮层：与行选中/双击解耦（兄弟节点不冒泡进行按钮）；钮上禁拖拽
                  （draggable=false + dragstart 阻断——不带走行拖拽语义） */}
              <button
                type="button"
                data-testid={`fav-btn-${f.name}`}
                aria-pressed={fav}
                aria-label={fav ? t('library.unfavorite') : t('library.favorite')}
                title={fav ? t('library.unfavorite') : t('library.favorite')}
                draggable={false}
                onDragStart={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onClick={() => onToggleFavorite(f)}
                className={`shrink-0 rounded-sm p-1 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 ${fav && !favRow ? 'opacity-100' : 'opacity-0 group-hover/frow:opacity-100'}`}
              >
                <IconStar size={12} />
              </button>
            </div>
          </ContextMenuTrigger>
          {fileMenu(f)}
        </ContextMenu>
      </Item>
    )
  }

  const renderFiles = (relDir: string) =>
    filtered.files.filter((f) => f.relDir === relDir).map((f) => renderFile(f, `file:${relDir}/${f.name}`))

  /** 目录行：有子（目录或文件）→ Collapsible（行首箭头折叠 + 行面选中）；无子 → 占位
   *  普通行。行面均包 ContextMenu（右键开菜单，右键即选中目录）。既可拖亦可落：
   *  拖 = moveDir（dropTarget 高亮合法落点），拖到自身/子孙不高亮不落 */
  const renderDir = (n: DirNode, key: string): JSX.Element => {
    const childFiles = renderFiles(n.path)
    const hasChildren = n.children.length > 0 || childFiles.length > 0
    if (!hasChildren)
      return (
        <SidebarMenuSubItem key={key}>
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div
                className={`flex min-w-0 flex-1 items-center rounded-sm ${dragging === key ? 'opacity-50' : ''} ${dropTarget === n.path ? 'bg-sidebar-accent' : ''}`}
                draggable
                onDragStart={startDrag({ kind: 'dir', rel: n.path }, key)}
                onDragEnd={endDrag}
                onDragOver={dragOver(n.path)}
                onDragLeave={dragLeave(n.path)}
                onDrop={drop(n.path)}
                onContextMenu={() => onSelect(n.path)}
              >
                <span aria-hidden="true" className={chevronSlot} />
                <SidebarMenuSubButton
                  asChild
                  isActive={selected === n.path}
                  data-testid={`dir-node-${n.name}`}
                  title={n.path}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left font-file text-xs"
                    onClick={() => onSelect(n.path)}
                  >
                    <IconFolder />
                    <span className="min-w-0 flex-1 truncate">{n.name}</span>
                  </button>
                </SidebarMenuSubButton>
              </div>
            </ContextMenuTrigger>
            {dirMenu(n.path, true)}
          </ContextMenu>
        </SidebarMenuSubItem>
      )
    return (
      <Collapsible key={key} asChild defaultOpen open={searching ? true : undefined} className="group/collapsible">
        <SidebarMenuSubItem>
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div
                className={`flex min-w-0 flex-1 items-center rounded-sm ${dragging === key ? 'opacity-50' : ''} ${dropTarget === n.path ? 'bg-sidebar-accent' : ''}`}
                draggable
                onDragStart={startDrag({ kind: 'dir', rel: n.path }, key)}
                onDragEnd={endDrag}
                onDragOver={dragOver(n.path)}
                onDragLeave={dragLeave(n.path)}
                onDrop={drop(n.path)}
                onContextMenu={() => onSelect(n.path)}
              >
                {/* 折叠扳机（行首箭头，资源管理器式）：与行面选中解耦的独立按钮 */}
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    aria-label={t('library.dirTree.collapseDir', { name: n.name })}
                    className={`${chevronSlot} rounded-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground`}
                  >
                    <ChevronRight className="size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </button>
                </CollapsibleTrigger>
                <SidebarMenuSubButton
                  asChild
                  isActive={selected === n.path}
                  data-testid={`dir-node-${n.name}`}
                  title={n.path}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left font-file text-xs"
                    onClick={() => onSelect(n.path)}
                  >
                    <IconFolder />
                    <span className="min-w-0 flex-1 truncate">{n.name}</span>
                  </button>
                </SidebarMenuSubButton>
              </div>
            </ContextMenuTrigger>
            {dirMenu(n.path, true)}
          </ContextMenu>
          <CollapsibleContent>
            <SidebarMenuSub>
              {n.children.map((c) => renderDir(c, `dir:${c.path}`))}
              {childFiles}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuSubItem>
      </Collapsible>
    )
  }

  return (
    <>
      {/* 搜索框（v2.5）：SidebarHeader 原是 logo+品名（上移 TitleBar），此位改常驻
          工作区文件搜索；Esc 清空复原。pt-0 顶掉默认 p-2 的顶距——搜索框贴侧栏顶，
          与右侧 SidebarInset 浮层上边框齐平（见 LibraryView Sidebar className 注释）。
          2026-09 移出 SidebarContent 滚动容器（与 SidebarFooter 同级固定——此前在
          容器内随树滚、滚动条还从搜索框顶起延伸）。
          2026-09 间距收紧：pb-1(4px)+组 py-1(4px)——搜索框→首组盒距 8px（原 28px）；
          组标签行 h-8→h-6（32px 行装 16px 字、两端各 ~8px 内部留白是视觉空隙的主源，
          见组标签处注释） */}
      <SidebarHeader className="pt-0 pb-1">
        <div className="flex items-center gap-1.5 px-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-[calc(0.5rem+0.4375rem)] size-3.5 -translate-y-1/2 text-sidebar-foreground/50" />
            <Input
              data-testid="dir-search"
              aria-label={t('library.dirTree.searchLabel')}
              placeholder={t('library.dirTree.searchPlaceholder')}
              value={query}
              className="h-8 pl-7 text-xs"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }}
            />
          </div>
          {/* 排序钮（2026-09 收藏与排序）：与搜索框同高（size-8），两档单选——modified
              即现状（listMaps 修改时间新→旧），name 与目录行同 localeCompare 口径 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                data-testid="dir-sort"
                aria-label={t('library.dirTree.sort')}
                title={t('library.dirTree.sort')}
                className="size-8 shrink-0"
              >
                <IconSort />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup value={sort} onValueChange={(v) => onSortChange(v as LibrarySort)}>
                <DropdownMenuRadioItem data-testid="sort-modified" value="modified">
                  {t('library.dirTree.sortModified')}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem data-testid="sort-name" value="name">
                  {t('library.dirTree.sortName')}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarHeader>
      {/* gap-0 + 组 py-1：组间距由组自身纵距承担（2026-09 收紧，见上注） */}
      <SidebarContent className="gap-0">
      {/* 收藏组（2026-09 收藏置顶）：跨目录聚合置顶于「目录」组之上——文件多而重要者少，
          星标文件不问所在目录一屏可达；空收藏整组隐藏。行交互与树文件行同语义（单击
          预览/双击进纸面/右键菜单），行本身可拖（拖到目录=移动，载荷同为 TreeFile）。
          组标签即折叠扳机（官方 collapsible group 模式）；搜索时强制展开（与目录树同
          口径——收藏命中不被折叠态藏住） */}
      {favFiles.length > 0 && (
        <SidebarGroup className="px-2 py-1">
          <Collapsible defaultOpen open={searching ? true : undefined} className="group/favcollapsible">
            {/* h-6（2026-09 收紧）：标签行 32→24px。h-8 行装 16px 字、两端各 ~8px 内部
                留白——盒间距 12px 时视觉空隙实为 27px；类须落在本组件（经 cn/tw-merge
                顶掉基类 h-8），落 asChild 子按钮会被 Slot 简单拼接、CSS 序让 h-8 反杀 */}
            <SidebarGroupLabel asChild className="h-6">
              <CollapsibleTrigger data-testid="fav-toggle" aria-label={t('library.dirTree.favoritesToggle')}>
                {t('library.dirTree.favorites')}
                <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/favcollapsible:rotate-90" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarMenu>
                {favFiles.map((f) => renderFile(f, `fav:${fileKey(f)}`, true))}
              </SidebarMenu>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>
      )}
      <SidebarGroup className="px-2 py-1">
        <SidebarGroupLabel className="h-6">{t('library.dirTree.directories')}</SidebarGroupLabel>
        <SidebarMenu>
          {/* 树根 = 工作区：本身即最外层 Collapsible（点行首箭头收起全树），行面选中根视图；
                  右键同目录菜单但无删除（工作区本体不删，rel=''=根）。拖拽只作落点不可拖
                  （moveDir 守卫亦拒绝移动根），拖文件/目录到根 = 上提回工作区顶层 */}
          <Collapsible asChild defaultOpen open={searching ? true : undefined} className="group/collapsible">
            <SidebarMenuItem>
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div
                    className={`flex min-w-0 flex-1 items-center rounded-sm ${dropTarget === '' ? 'bg-sidebar-accent' : ''}`}
                    onDragOver={dragOver('')}
                    onDragLeave={dragLeave('')}
                    onDrop={drop('')}
                    onContextMenu={() => onSelect('')}
                  >
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        aria-label={t('library.dirTree.collapseAll')}
                        className={`${chevronSlot} rounded-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground`}
                      >
                        <ChevronRight className="size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </button>
                    </CollapsibleTrigger>
                    <SidebarMenuButton
                      asChild
                      data-testid="dir-node-all"
                      isActive={selected === ''}
                      className="min-w-0 flex-1 text-left font-file text-xs"
                    >
                      <button
                        type="button"
                        title={rootTooltip}
                        onClick={() => onSelect('')}
                      >
                        <span className="min-w-0 flex-1 truncate">{rootLabel}</span>
                      </button>
                    </SidebarMenuButton>
                  </div>
                </ContextMenuTrigger>
                {dirMenu('', false)}
              </ContextMenu>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {searching && filtered.tree.length === 0 && filtered.files.length === 0 ? (
                    <p data-testid="dir-search-empty" className="px-2 py-1 text-xs text-muted-foreground">
                      {t('library.dirTree.searchEmpty')}
                    </p>
                  ) : (
                    <>
                      {filtered.tree.map((n) => renderDir(n, `dir:${n.path}`))}
                      {renderFiles('')}
                    </>
                  )}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        </SidebarMenu>
      </SidebarGroup>
      </SidebarContent>
    </>
  )
}
