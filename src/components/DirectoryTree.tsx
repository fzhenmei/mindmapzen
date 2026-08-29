import type { DirNode } from '../services/desk'

interface Props {
  /** 工作区目录树（desk.readDirTree 产出；根不在其中，「全部」项由本组件提供） */
  tree: DirNode[]
  /** 当前选中目录（''=全部/工作区根视图） */
  selected: string
  onSelect: (rel: string) => void
  /** 新建目录：rel 为父目录（''=在工作区根下建；具体名称由上层 NameDialog 收集） */
  onCreateDir: (rel: string) => void
}

/** 案头左树：目录层级导航（等宽小字 + 按层缩进），驱动卡片网格按 selectedDir 过滤。
 *  节点 testid 为 `dir-node-<name>`（重名目录跨层不唯一，测试与调用方按树内唯一名使用）；
 *  「全部」`dir-node-all`（rel=''）；「新建目录」`dir-create` */
export default function DirectoryTree({ tree, selected, onSelect, onCreateDir }: Readonly<Props>) {
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
        {n.children.length > 0 && renderNodes(n.children, depth + 1)}
      </div>
    ))
  return (
    <nav className="dir-tree" aria-label="案头目录">
      <button
        type="button"
        data-testid="dir-node-all"
        className={selected === '' ? 'dir-node active' : 'dir-node'}
        onClick={() => onSelect('')}
      >
        全部
      </button>
      {renderNodes(tree, 0)}
      <button
        type="button"
        data-testid="dir-create"
        className="dir-create-btn"
        title={`在${selected === '' ? '工作区根' : `「${selected}」`}下新建目录`}
        onClick={() => onCreateDir(selected)}
      >
        新建目录
      </button>
    </nav>
  )
}
