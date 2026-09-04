import { ChevronRight, Search } from 'lucide-react'
import { useState, type JSX } from 'react'
import { filterTree, type DirNode } from '../services/desk'
import type { MapAction } from './DetailActions'
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
import { Input } from './ui/input'
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
import { IconFile, IconFolder, IconOpen, IconPencil, IconPlus, IconTrash } from './icons'

/** 树中导图文件行（M5d）：由 store maps 派生（name 不含扩展名；relDir 相对工作区，''=根） */
export interface TreeFile { name: string; relDir: string }

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
  /** 目录行右键「在此新建导图」（rel = 目标目录相对路径，''=根） */
  onCreateMapIn(rel: string): void
  /** 目录行右键「新建子目录」（rel = 父目录相对路径，''=根） */
  onCreateDirIn(rel: string): void
}

/** 案头左树（M15 官方 collapsible 文件树，仿 shadcn "A sidebar with a collapsible
 *  file tree"）：目录行 = Collapsible + ChevronRight 官方旋入动画，子目录与文件行进
 *  SidebarMenuSub（官方缩进导轨），任意深度递归。交互分工：行面单击 = 选中，行尾
 *  箭头 = 折叠/展开（CollapsibleTrigger 独立按钮，行面不承担折叠——选中与折叠解耦，
 *  点已展开目录不会误收起子树）。全部 defaultOpen（进案头即全树展开，延续旧行为）；
 *  空目录无死箭头（普通行）。
 *  右键菜单（2026-09 资源管理器惯例）：文件行 = 打开/移动/重命名/删除（ctx-* testid，
 *  与详情页首同名钮以 ctx- 前缀区分避严格模式撞名）；目录行与树根 = 在此新建导图/
 *  新建子目录。右键即选中（VSCode 惯例）——文件行切预览、目录行切选中态。
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
  onCreateMapIn,
  onCreateDirIn,
}: Readonly<Props>) {
  // 侧栏搜索（v2.5）：占位原 SidebarHeader（logo 上移 TitleBar 后空出的位）。
  //  过滤在 desk.filterTree（纯函数）；搜索态强制全树展开（defaultOpen 非受控只在
  //  首挂生效，折叠中的目录里有命中文件时靠受控 open 展开），清空即复原
  const [query, setQuery] = useState('')
  const q = query.trim()
  const searching = q !== ''
  const filtered = searching ? filterTree(tree, files, q) : { tree, files }

  const isFileSelected = (f: TreeFile) =>
    selectedFile !== null && selectedFile.name === f.name && selectedFile.relDir === f.relDir

  /** 文件行右键菜单（对话框流在 LibraryView；条目 ctx-* testid 与详情页首同名钮区分） */
  const fileMenu = (f: TreeFile) => (
    <ContextMenuContent data-testid={`ctx-menu-file-${f.name}`} aria-label={`「${f.name}」操作`}>
      <ContextMenuItem data-testid="ctx-btn-open" onClick={() => onOpenFile(f)}>
        <IconOpen />打开
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem data-testid="ctx-btn-move" onClick={() => onFileAction('move', f)}>
        <IconFolder />移动到目录
      </ContextMenuItem>
      <ContextMenuItem data-testid="ctx-btn-rename" onClick={() => onFileAction('rename', f)}>
        <IconPencil />重命名
      </ContextMenuItem>
      <ContextMenuItem data-testid="ctx-btn-delete" variant="destructive" onClick={() => onFileAction('delete', f)}>
        <IconTrash />删除
      </ContextMenuItem>
    </ContextMenuContent>
  )

  /** 目录行右键菜单（rel = 目标目录；''=根）：新建导图于此 / 新建子目录 */
  const dirMenu = (rel: string) => (
    <ContextMenuContent aria-label="目录操作">
      <ContextMenuItem data-testid="ctx-btn-new-map" onClick={() => onCreateMapIn(rel)}>
        <IconPlus />在此新建导图
      </ContextMenuItem>
      <ContextMenuItem data-testid="ctx-btn-new-dir" onClick={() => onCreateDirIn(rel)}>
        <IconFolder />新建子目录
      </ContextMenuItem>
    </ContextMenuContent>
  )

  /** 文件行（叶子）：SidebarMenuSubButton asChild → button（等宽文件声道）。
   *  行面包 ContextMenu（右键开菜单，右键即选中切预览——VSCode 惯例） */
  const renderFile = (f: TreeFile, key: string) => (
    <SidebarMenuSubItem key={key}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <SidebarMenuSubButton
            asChild
            isActive={isFileSelected(f)}
            data-testid={`file-node-${f.name}`}
            title={`${f.name}.md`}
          >
            <button
              type="button"
              className="font-file text-xs"
              onClick={() => onSelectFile(f)}
              onDoubleClick={() => onOpenFile(f)}
              onContextMenu={() => onSelectFile(f)}
            >
              <IconFile />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
            </button>
          </SidebarMenuSubButton>
        </ContextMenuTrigger>
        {fileMenu(f)}
      </ContextMenu>
    </SidebarMenuSubItem>
  )

  const renderFiles = (relDir: string) =>
    filtered.files.filter((f) => f.relDir === relDir).map((f) => renderFile(f, `file:${relDir}/${f.name}`))

  /** 目录行：有子（目录或文件）→ Collapsible（箭头折叠 + 行面选中）；无子 → 普通行。
   *  行面均包 ContextMenu（右键开菜单，右键即选中目录） */
  const renderDir = (n: DirNode, key: string): JSX.Element => {
    const childFiles = renderFiles(n.path)
    const hasChildren = n.children.length > 0 || childFiles.length > 0
    if (!hasChildren)
      return (
        <SidebarMenuSubItem key={key}>
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <SidebarMenuSubButton
                asChild
                isActive={selected === n.path}
                data-testid={`dir-node-${n.name}`}
                title={n.path}
              >
                <button
                  type="button"
                  className="font-file text-xs"
                  onClick={() => onSelect(n.path)}
                  onContextMenu={() => onSelect(n.path)}
                >
                  <IconFolder />
                  <span className="min-w-0 flex-1 truncate">{n.name}</span>
                </button>
              </SidebarMenuSubButton>
            </ContextMenuTrigger>
            {dirMenu(n.path)}
          </ContextMenu>
        </SidebarMenuSubItem>
      )
    return (
      <Collapsible key={key} asChild defaultOpen open={searching ? true : undefined} className="group/collapsible">
        <SidebarMenuSubItem>
          <div className="relative">
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <SidebarMenuSubButton
                  asChild
                  isActive={selected === n.path}
                  data-testid={`dir-node-${n.name}`}
                  title={n.path}
                >
                  <button
                    type="button"
                    className="pr-7 font-file text-xs"
                    onClick={() => onSelect(n.path)}
                    onContextMenu={() => onSelect(n.path)}
                  >
                    <IconFolder />
                    <span className="min-w-0 flex-1 truncate">{n.name}</span>
                  </button>
                </SidebarMenuSubButton>
              </ContextMenuTrigger>
              {dirMenu(n.path)}
            </ContextMenu>
            {/* 折叠扳机（行尾箭头，SidebarMenuAction 位）：与行面选中解耦的独立按钮 */}
            <CollapsibleTrigger asChild>
              <button
                type="button"
                aria-label={`折叠「${n.name}」`}
                className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <ChevronRight className="size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
              </button>
            </CollapsibleTrigger>
          </div>
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
          容器内随树滚、滚动条还从搜索框顶起延伸）；pb-5 = 原 pb-3(12px)+容器内
          gap-2(8px)，gap 随移出消失由 pb 补足，与「目录」组保持 28px 原间距 */}
      <SidebarHeader className="pt-0 pb-5">
        <div className="relative px-2">
          <Search className="pointer-events-none absolute top-1/2 left-[calc(0.5rem+0.4375rem)] size-3.5 -translate-y-1/2 text-sidebar-foreground/50" />
          <Input
            data-testid="dir-search"
            aria-label="搜索工作区文件"
            placeholder="搜索工作区文件…"
            value={query}
            className="h-8 pl-7 text-xs"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }}
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>目录</SidebarGroupLabel>
        <SidebarMenu>
          {/* 树根 = 工作区：本身即最外层 Collapsible（点箭头收起全树），行面选中根视图；
                  右键同目录菜单（在此新建导图/新建目录，rel=''=根） */}
          <Collapsible asChild defaultOpen open={searching ? true : undefined} className="group/collapsible">
            <SidebarMenuItem>
              <div className="relative">
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <SidebarMenuButton
                      asChild
                      data-testid="dir-node-all"
                      isActive={selected === ''}
                      className="pr-7 font-file text-xs"
                    >
                      <button
                        type="button"
                        title={rootTooltip}
                        onClick={() => onSelect('')}
                        onContextMenu={() => onSelect('')}
                      >
                        <span className="min-w-0 flex-1 truncate">{rootLabel}</span>
                      </button>
                    </SidebarMenuButton>
                  </ContextMenuTrigger>
                  {dirMenu('')}
                </ContextMenu>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    aria-label="折叠全部"
                    className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  >
                    <ChevronRight className="size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {searching && filtered.tree.length === 0 && filtered.files.length === 0 ? (
                    <p data-testid="dir-search-empty" className="px-2 py-1 text-xs text-muted-foreground">
                      没有匹配的文件
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
