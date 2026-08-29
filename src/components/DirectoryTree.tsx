import type { DirNode } from '../services/desk'
import { IconFile } from './icons'

/** 树中导图文件行（M5d）：由 store maps 派生（name 不含扩展名；relDir 相对工作区，''=根） */
export interface TreeFile { name: string; relDir: string }

interface Props {
  /** 工作区目录树（desk.readDirTree 产出；根不在其中，「全部」项由本组件提供） */
  tree: DirNode[]
  /** 导图文件清单：目录节点展开时按 relDir 匹配渲染文件行（树成为完整文件视图） */
  files: TreeFile[]
  /** 树根（「全部」）显示名 = 工作区名；tooltip 显示工作区全路径 */
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
  /** 新建目录：rel 为父目录（''=在工作区根下建；具体名称由上层 NameDialog 收集） */
  onCreateDir: (rel: string) => void
}

/** 案头左树：目录层级 + 文件行导航（等宽小字 + 按层缩进），目录驱动卡片网格按 selectedDir 过滤。
 *  节点 testid 为 `dir-node-<name>`（重名目录跨层不唯一，测试与调用方按树内唯一名使用）；
 *  文件行 `file-node-<name>`；树根 `dir-node-all`（rel=''，显示工作区名）；「新建目录」`dir-create` */
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
  onCreateDir,
}: Readonly<Props>) {
  const isFileSelected = (f: TreeFile) =>
    selectedFile !== null && selectedFile.name === f.name && selectedFile.relDir === f.relDir

  const renderFiles = (relDir: string, depth: number) =>
    files
      .filter((f) => f.relDir === relDir)
      .map((f) => (
        <button
          key={`file:${relDir}/${f.name}`}
          type="button"
          data-testid={`file-node-${f.name}`}
          className={isFileSelected(f) ? 'dir-node file-node active' : 'dir-node file-node'}
          style={{ paddingLeft: 8 + depth * 14 }}
          title={`${f.name}.md`}
          onClick={() => onSelectFile(f)}
          onDoubleClick={() => onOpenFile(f)}
        >
          <IconFile />
          <span className="file-node-name">{f.name}</span>
        </button>
      ))

  const renderNodes = (nodes: DirNode[], depth: number) =>
    nodes.map((n) => (
      <div key={n.path}>
        <button
          type="button"
          data-testid={`dir-node-${n.name}`}
          className={selected === n.path ? 'dir-node active' : 'dir-node'}
          style={{ paddingLeft: 8 + depth * 14 }}
          title={n.path}
          onClick={() => onSelect(n.path)}
        >
          {n.name}
        </button>
        {renderNodes(n.children, depth + 1)}
        {renderFiles(n.path, depth + 1)}
      </div>
    ))
  const createDirTitle =
    selected === '' ? '在工作区根下新建目录' : `在「${selected}」下新建目录`
  return (
    <nav className="dir-tree" aria-label="案头目录">
      <button
        type="button"
        data-testid="dir-node-all"
        className={selected === '' ? 'dir-node active' : 'dir-node'}
        title={rootTooltip}
        onClick={() => onSelect('')}
      >
        {rootLabel}
      </button>
      {renderNodes(tree, 0)}
      {renderFiles('', 0)}
      <button
        type="button"
        data-testid="dir-create"
        className="dir-create-btn"
        title={createDirTitle}
        onClick={() => onCreateDir(selected)}
      >
        新建目录
      </button>
    </nav>
  )
}
