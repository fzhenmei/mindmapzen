import type { DirNode } from '../services/desk'
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from './ui/sidebar'
import { IconFile, IconFolder } from './icons'

/** 树中导图文件行（M5d）：由 store maps 派生（name 不含扩展名；relDir 相对工作区，''=根） */
export interface TreeFile { name: string; relDir: string }

interface Props {
  /** 工作区目录树（desk.readDirTree 产出；根不在其中，「全部」项由本组件提供） */
  tree: DirNode[]
  /** 导图文件清单：目录节点展开时按 relDir 匹配渲染文件行（树成为完整文件视图） */
  files: TreeFile[]
  /** 树根（「全部」）显示名 = 工作区名；title 显示工作区全路径 */
  rootLabel: string
  rootTooltip: string
  /** 当前选中目录（''=全部/工作区根视图） */
  selected: string
  /** 当前选中文件（卡片或文件行单击选中）：对应文件行高亮 */
  selectedFile: TreeFile | null
  onSelect: (rel: string) => void
  /** 文件行单击：选中并预览 */
  onSelectFile: (f: TreeFile) => void
  /** 文件行双击：打开进纸面 */
  onOpenFile: (f: TreeFile) => void
}

/** 案头左树（M14 Task 3 Sidebar 化）：官方 SidebarContent/Group/Menu 骨架，目录与
 *  文件行均为 SidebarMenuButton——选中态走官方 isActive（data-active=true +
 *  data-[active=true]:bg-sidebar-accent 官方皮肤链），等宽文件声道与层级缩进保留。
 *  节点 testid 为 `dir-node-<name>`（重名目录跨层不唯一，测试与调用方按树内唯一名使用）；
 *  文件行 `file-node-<name>`；树根 `dir-node-all`（rel=''，显示工作区名）。
 *  「新建目录」随官方解剖上移 SidebarFooter（由 LibraryView 渲染，testid dir-create 不变） */
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
  const isFileSelected = (f: TreeFile) =>
    selectedFile !== null && selectedFile.name === f.name && selectedFile.relDir === f.relDir

  const renderFiles = (relDir: string, depth: number) =>
    files
      .filter((f) => f.relDir === relDir)
      .map((f) => (
        <SidebarMenuItem key={`file:${relDir}/${f.name}`}>
          <SidebarMenuButton
            data-testid={`file-node-${f.name}`}
            isActive={isFileSelected(f)}
            className="font-file text-xs"
            style={{ paddingLeft: 8 + depth * 14 }}
            title={`${f.name}.md`}
            onClick={() => onSelectFile(f)}
            onDoubleClick={() => onOpenFile(f)}
          >
            <IconFile />
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))

  const renderNodes = (nodes: DirNode[], depth: number) =>
    nodes.map((n) => (
      <SidebarMenuItem key={n.path}>
        <SidebarMenuButton
          data-testid={`dir-node-${n.name}`}
          isActive={selected === n.path}
          className="font-file text-xs"
          style={{ paddingLeft: 8 + depth * 14 }}
          title={n.path}
          onClick={() => onSelect(n.path)}
        >
          <IconFolder />
          <span className="min-w-0 flex-1 truncate">{n.name}</span>
        </SidebarMenuButton>
        {renderNodes(n.children, depth + 1)}
        {renderFiles(n.path, depth + 1)}
      </SidebarMenuItem>
    ))

  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>目录</SidebarGroupLabel>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              data-testid="dir-node-all"
              isActive={selected === ''}
              className="font-file text-xs"
              title={rootTooltip}
              onClick={() => onSelect('')}
            >
              <span className="min-w-0 flex-1 truncate">{rootLabel}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {renderNodes(tree, 0)}
          {renderFiles('', 0)}
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
  )
}
