// src/editor/NodeContextMenu.test.tsx —— 节点右键菜单(2026-09 纯鼠标操作):引擎节点 svg 的
// contextmenu 有 stopPropagation(MindMapNode.js:438),DOM 包装层收不到事件,菜单只能经引擎
// 事件总线 node_contextmenu 受控打开——本组件由 MindMapCanvas 条件渲染挂载,单测覆盖四项
// 动作/根置灰/锚点定位/Esc 收口;画布端引擎接线遵循 MindMapCanvas 惯例不单测,由 e2e 覆盖。
import { fireEvent, render, screen } from '@testing-library/react'
import NodeContextMenu from './NodeContextMenu'

function renderMenu(overrides: Partial<Parameters<typeof NodeContextMenu>[0]> = {}) {
  const cb = {
    onInsertChild: vi.fn(),
    onInsertSibling: vi.fn(),
    onEditText: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
  }
  const props = { x: 100, y: 200, isRoot: false, ...overrides, ...cb }
  render(<NodeContextMenu {...props} />)
  return cb
}

test('四项菜单齐全:各项点击各回调一次', () => {
  const cb = renderMenu()
  // 与键盘快捷键一一对应(Tab/Enter/F2/Del),文案为验收口径
  expect(screen.getByTestId('ctx-node-child')).toHaveTextContent('插入子节点')
  expect(screen.getByTestId('ctx-node-sibling')).toHaveTextContent('插入同级节点')
  expect(screen.getByTestId('ctx-node-edit')).toHaveTextContent('编辑文本')
  expect(screen.getByTestId('ctx-node-delete')).toHaveTextContent('删除节点')
  fireEvent.click(screen.getByTestId('ctx-node-child'))
  fireEvent.click(screen.getByTestId('ctx-node-sibling'))
  fireEvent.click(screen.getByTestId('ctx-node-edit'))
  fireEvent.click(screen.getByTestId('ctx-node-delete'))
  expect(cb.onInsertChild).toHaveBeenCalledTimes(1)
  expect(cb.onInsertSibling).toHaveBeenCalledTimes(1)
  expect(cb.onEditText).toHaveBeenCalledTimes(1)
  expect(cb.onDelete).toHaveBeenCalledTimes(1)
})

test('根节点:插入同级与删除置灰且不回调,插子/编辑仍可用', () => {
  // 引擎对根 insertNode 静默跳过(Render.js:819-821)、removeNode 会清光根的子节点(:1425-1428)
  // ——菜单置灰不给入口(比键盘 Del 更安全;键盘路径维持引擎原生行为不变)
  const cb = renderMenu({ isRoot: true })
  expect(screen.getByTestId('ctx-node-sibling')).toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByTestId('ctx-node-delete')).toHaveAttribute('aria-disabled', 'true')
  // Radix Menu 只在禁用时输出 aria-disabled,启用项无该属性
  expect(screen.getByTestId('ctx-node-child')).not.toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByTestId('ctx-node-edit')).not.toHaveAttribute('aria-disabled', 'true')
  fireEvent.click(screen.getByTestId('ctx-node-sibling'))
  fireEvent.click(screen.getByTestId('ctx-node-delete'))
  expect(cb.onInsertSibling).not.toHaveBeenCalled()
  expect(cb.onDelete).not.toHaveBeenCalled()
  fireEvent.click(screen.getByTestId('ctx-node-child'))
  expect(cb.onInsertChild).toHaveBeenCalledTimes(1)
})

test('Esc 收口:onOpenChange(false) 经 onClose 上报父级卸载', () => {
  const cb = renderMenu()
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  expect(cb.onClose).toHaveBeenCalledTimes(1)
})

test('隐藏锚点落在鼠标视口坐标(菜单受控定位,非触发器)', () => {
  renderMenu({ x: 340, y: 120 })
  const anchor = screen.getByTestId('ctx-node-anchor')
  expect(anchor).toHaveStyle({ position: 'fixed', left: '340px', top: '120px' })
})
