import type { DirNode } from '../services/desk'
import { formatFileSize } from '../services/fileSize'
import type { MapInfo } from '../types/files'
import { Button } from './ui/button'
import { IconFile, IconFolder, IconPencil, IconTrash } from './icons'

/** 文件 tile 悬停动作三态（LibraryView 的对话框流复用） */
export type MapAction = 'move' | 'rename' | 'delete'

interface Props {
  /** 当前目录相对路径（'' = 工作区根） */
  dirRel: string
  /** 工作区全量目录树（按 dirRel 取本层子目录） */
  tree: DirNode[]
  /** 当前层的导图（调用方已按 relDir 过滤） */
  maps: MapInfo[]
  /** 文件夹 tile 单击：选中该目录（左树联动） */
  onSelectDir(rel: string): void
  /** 文件 tile 单击：选中文件（右侧切详情态）；双击：进纸面 */
  onSelectMap(m: MapInfo): void
  onOpenMap(m: MapInfo): void
  /** 悬停操作：移动/重命名/删除（对话框流在 LibraryView） */
  onAction(a: MapAction, m: MapInfo): void
}

/** 案头目录态（M15 资源管理器视图）：文件夹 tile + 导图文件 tile 大图标网格——
 *  上大图标、中名称、下元信息（创建时间 + 大小，等宽文件声道）。文件 tile 悬停浮现
 *  移动/重命名/删除三钮（testid 沿用）；单击选中进详情，双击打开。tile = ui Button
 *  ghost 纵向解剖（官方组合，无手搓容器） */
export default function FileExplorer({
  dirRel,
  tree,
  maps,
  onSelectDir,
  onSelectMap,
  onOpenMap,
  onAction,
}: Readonly<Props>) {
  // 本层子目录：dirRel='' 取树顶层，否则按 path 前缀下钻
  const childDirs =
    dirRel === ''
      ? tree
      : (tree.find((n) => n.path === dirRel)?.children ?? [])

  if (childDirs.length === 0 && maps.length === 0)
    return (
      <div
        className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground"
        data-testid="dir-empty-state"
      >
        这一层还是空的
      </div>
    )

  return (
    <div className="grid flex-1 min-w-0 auto-cols-min grid-cols-[repeat(auto-fill,minmax(128px,1fr))] content-start gap-2 overflow-y-auto pb-6">
      {childDirs.map((d) => (
        <Button
          key={d.path}
          type="button"
          variant="ghost"
          data-testid={`folder-tile-${d.name}`}
          className="flex h-auto w-full flex-col items-center gap-1.5 rounded-lg p-3 text-center"
          onClick={() => onSelectDir(d.path)}
        >
          <span className="text-primary">
            <IconFolder size={36} />
          </span>
          <span className="w-full truncate font-file text-xs" title={d.path}>
            {d.name}
          </span>
        </Button>
      ))}
      {maps.map((m) => (
        <div key={m.mdPath} className="map-card group relative">
          <Button
            type="button"
            variant="ghost"
            data-testid="map-item"
            className="flex h-auto w-full flex-col items-center gap-1.5 rounded-lg p-3 text-center"
            onClick={() => onSelectMap(m)}
            onDoubleClick={() => onOpenMap(m)}
            title={`选中「${m.name}」（双击打开）`}
          >
            <span className="text-muted-foreground">
              <IconFile size={36} />
            </span>
            <span className="w-full truncate font-file text-xs">{m.name}</span>
            <span className="w-full truncate font-file text-[11px] text-muted-foreground">
              {new Date(m.createdAt).toLocaleDateString('zh-CN')} · {formatFileSize(m.size)}
            </span>
          </Button>
          {/* 悬停操作钮（沿旧卡片口径）：移动/重命名/删除 */}
          <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
            {(
              [
                ['btn-move', '移动到目录', IconFolder, 'move'],
                ['btn-rename', '重命名', IconPencil, 'rename'],
                ['btn-delete', '删除', IconTrash, 'delete'],
              ] as const
            ).map(([testid, label, Icon, action]) => (
              <Button
                key={testid}
                variant="ghost"
                size="icon-sm"
                data-testid={testid}
                aria-label={label}
                onClick={() => onAction(action, m)}
              >
                <Icon />
              </Button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
