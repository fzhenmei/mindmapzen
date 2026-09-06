// src/editor/NodeContextMenu.tsx —— 节点右键菜单(2026-09 纯鼠标操作):四项与键盘快捷键
// 一一对应(Tab/Enter/F2/Del),不引入新语义;删除走 destructive 红。引擎节点 svg 的
// contextmenu 有 stopPropagation(MindMapNode.js:438),DOM 包装层收不到,只能经引擎事件
// node_contextmenu 受控打开——本组件由 MindMapCanvas 在右键节点时条件渲染,父级经 onClose
// 卸载。定位用隐藏 0×0 锚点 span(DropdownMenuTrigger asChild)+ Popper 跟随:菜单浮层、
// Esc/外点收口、键盘导航全部复用 Radix DropdownMenu,与文件树右键菜单同皮肤。
import { useTranslation } from 'react-i18next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'

interface Props {
  /** 右键鼠标视口坐标(node_contextmenu 事件的 clientX/Y):隐藏锚点定位菜单弹出点 */
  x: number
  y: number
  /** 右键的节点是根:插入同级/删除置灰——引擎对根 insertNode 静默跳过(Render.js:819-821)、
   *  removeNode 会清光根的子节点(:1425-1428),菜单不给此入口(键盘路径维持引擎原生不变) */
  isRoot: boolean
  onInsertChild(): void
  onInsertSibling(): void
  onEditText(): void
  onDelete(): void
  /** 菜单收口(Esc/外点/选项点击后的 onOpenChange(false)):父级卸载本组件 */
  onClose(): void
}

export default function NodeContextMenu({
  x,
  y,
  isRoot,
  onInsertChild,
  onInsertSibling,
  onEditText,
  onDelete,
  onClose,
}: Readonly<Props>) {
  const { t } = useTranslation()
  return (
    <DropdownMenu open onOpenChange={(o) => { if (!o) onClose() }}>
      {/* 定位哨兵:0×0 不可见,Popper 以此为锚让菜单浮在鼠标右下;onCloseAutoFocus 阻止
          关菜单后焦点回跳哨兵(画布 role=application,焦点应留在 body) */}
      <DropdownMenuTrigger asChild>
        <span
          data-testid="ctx-node-anchor"
          aria-hidden
          style={{ position: 'fixed', left: x, top: y, width: 0, height: 0 }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()} aria-label={t('editor.nodeMenu.label')}>
        <DropdownMenuItem data-testid="ctx-node-child" onClick={onInsertChild}>
          {t('editor.nodeMenu.insertChild')}
          <DropdownMenuShortcut>Tab</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="ctx-node-sibling"
          disabled={isRoot}
          onClick={() => { if (!isRoot) onInsertSibling() }}
        >
          {t('editor.nodeMenu.insertSibling')}
          <DropdownMenuShortcut>Enter</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem data-testid="ctx-node-edit" onClick={onEditText}>
          {t('editor.nodeMenu.editText')}
          <DropdownMenuShortcut>F2</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="ctx-node-delete"
          variant="destructive"
          disabled={isRoot}
          onClick={() => { if (!isRoot) onDelete() }}
        >
          {t('editor.nodeMenu.delete')}
          <DropdownMenuShortcut>Del</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
