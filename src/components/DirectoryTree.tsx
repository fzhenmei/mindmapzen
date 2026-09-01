import { ChevronRight, Search } from 'lucide-react'
import { useState, type JSX } from 'react'
import { filterTree, type DirNode } from '../services/desk'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible'
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
import { IconFile, IconFolder } from './icons'

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
}

/** 案头左树（M15 官方 collapsible 文件树，仿 shadcn "A sidebar with a collapsible
 *  file tree"）：目录行 = Collapsible + ChevronRight 官方旋入动画，子目录与文件行进
 *  SidebarMenuSub（官方缩进导轨），任意深度递归。交互分工：行面单击 = 选中（右侧切
 *  资源管理器视图），行尾箭头 = 折叠/展开（CollapsibleTrigger 独立按钮，行面不承担
 *  折叠——选中与折叠解耦，点已展开目录不会误收起子树）。全部 defaultOpen（进案头即
 *  全树展开，延续旧行为）；空目录无死箭头（普通行）。
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

  /** 文件行（叶子）：SidebarMenuSubButton asChild → button（等宽文件声道） */
  const renderFile = (f: TreeFile, key: string) => (
    <SidebarMenuSubItem key={key}>
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
        >
          <IconFile />
          <span className="min-w-0 flex-1 truncate">{f.name}</span>
        </button>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  )

  const renderFiles = (relDir: string) =>
    filtered.files.filter((f) => f.relDir === relDir).map((f) => renderFile(f, `file:${relDir}/${f.name}`))

  /** 目录行：有子（目录或文件）→ Collapsible（箭头折叠 + 行面选中）；无子 → 普通行 */
  const renderDir = (n: DirNode, key: string): JSX.Element => {
    const childFiles = renderFiles(n.path)
    const hasChildren = n.children.length > 0 || childFiles.length > 0
    if (!hasChildren)
      return (
        <SidebarMenuSubItem key={key}>
          <SidebarMenuSubButton
            asChild
            isActive={selected === n.path}
            data-testid={`dir-node-${n.name}`}
            title={n.path}
          >
            <button type="button" className="font-file text-xs" onClick={() => onSelect(n.path)}>
              <IconFolder />
              <span className="min-w-0 flex-1 truncate">{n.name}</span>
            </button>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      )
    return (
      <Collapsible key={key} asChild defaultOpen open={searching ? true : undefined} className="group/collapsible">
        <SidebarMenuSubItem>
          <div className="relative">
            <SidebarMenuSubButton
              asChild
              isActive={selected === n.path}
              data-testid={`dir-node-${n.name}`}
              title={n.path}
            >
              <button type="button" className="pr-7 font-file text-xs" onClick={() => onSelect(n.path)}>
                <IconFolder />
                <span className="min-w-0 flex-1 truncate">{n.name}</span>
              </button>
            </SidebarMenuSubButton>
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
    <SidebarContent>
      {/* 搜索框（v2.5）：SidebarHeader 原是 logo+品名（上移 TitleBar），此位改常驻
          工作区文件搜索；Esc 清空复原 */}
      <SidebarHeader>
        <div className="relative px-2 pb-1">
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
      <SidebarGroup>
        <SidebarGroupLabel>目录</SidebarGroupLabel>
        <SidebarMenu>
          {/* 树根 = 工作区：本身即最外层 Collapsible（点箭头收起全树），行面选中根视图 */}
          <Collapsible asChild defaultOpen open={searching ? true : undefined} className="group/collapsible">
            <SidebarMenuItem>
              <div className="relative">
                <SidebarMenuButton
                  data-testid="dir-node-all"
                  isActive={selected === ''}
                  className="pr-7 font-file text-xs"
                  title={rootTooltip}
                  onClick={() => onSelect('')}
                >
                  <span className="min-w-0 flex-1 truncate">{rootLabel}</span>
                </SidebarMenuButton>
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
  )
}
