import { describe, expect, test, vi } from 'vitest'
import { handleCanvasFallbackKey, handleEngineKeyDown, type FallbackKeyContext } from './engineKeyboard'

describe('handleEngineKeyDown', () => {
  test('Tab 触发插入子节点并返回 true', () => {
    const exec = vi.fn()
    expect(handleEngineKeyDown(exec, null, 'Tab')).toBe(true)
    expect(exec).toHaveBeenCalledWith('INSERT_CHILD_NODE')
  })
  test('Enter 触发插入同级节点', () => {
    const exec = vi.fn()
    expect(handleEngineKeyDown(exec, null, 'Enter')).toBe(true)
    expect(exec).toHaveBeenCalledWith('INSERT_NODE')
  })
  test('Delete 触发删除节点', () => {
    const exec = vi.fn()
    expect(handleEngineKeyDown(exec, null, 'Delete')).toBe(true)
    expect(exec).toHaveBeenCalledWith('REMOVE_NODE')
  })
  test('编辑器内不拦截', () => {
    const exec = vi.fn()
    const ta = document.createElement('textarea')
    expect(handleEngineKeyDown(exec, ta, 'Tab')).toBe(false)
    expect(exec).not.toHaveBeenCalled()
  })
  test('其他键不处理', () => {
    const exec = vi.fn()
    expect(handleEngineKeyDown(exec, null, 'a')).toBe(false)
    expect(exec).not.toHaveBeenCalled()
  })
})

// ---- window 兜底键译总装（2026-09 看板审查 Important-1）：看板态 Tab/Enter/Delete ----
// ---- 短路（不打进被遮画布），撤销兜底（Ctrl+Z/y）不受门禁（看板内撤销靠它） ----

/** 基准上下文：无修饰键、焦点在 body（各域全 false），用例按需覆写 */
const baseCtx = (over: Partial<FallbackKeyContext> = {}): FallbackKeyContext => ({
  key: '',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  inTextInput: false,
  inDialog: false,
  inInteractive: false,
  kanban: false,
  ...over,
})

describe('handleCanvasFallbackKey', () => {
  test('导图态照常兜底：Tab 插子节点、Delete 删节点（既有行为不回归）', () => {
    const exec = vi.fn()
    expect(handleCanvasFallbackKey(exec, baseCtx({ key: 'Tab' }))).toBe(true)
    expect(exec).toHaveBeenCalledWith('INSERT_CHILD_NODE')
    expect(handleCanvasFallbackKey(exec, baseCtx({ key: 'Delete' }))).toBe(true)
    expect(exec).toHaveBeenCalledWith('REMOVE_NODE')
  })

  test('看板态门禁：Delete 不产生 REMOVE_NODE 且不拦截（看板键盘导航不被杀死）', () => {
    const exec = vi.fn()
    expect(handleCanvasFallbackKey(exec, baseCtx({ key: 'Delete', kanban: true }))).toBe(false)
    expect(exec).not.toHaveBeenCalled()
  })

  test('看板态门禁：Tab/Enter 同样短路（不往被浮层遮住的画布插节点）', () => {
    const exec = vi.fn()
    expect(handleCanvasFallbackKey(exec, baseCtx({ key: 'Tab', kanban: true }))).toBe(false)
    expect(handleCanvasFallbackKey(exec, baseCtx({ key: 'Enter', kanban: true }))).toBe(false)
    expect(exec).not.toHaveBeenCalled()
  })

  test('撤销兜底不受看板门禁：看板态 Ctrl+Z 仍 BACK、Ctrl+Shift+Z 仍 FORWARD（看板内撤销靠它）', () => {
    const exec = vi.fn()
    expect(handleCanvasFallbackKey(exec, baseCtx({ key: 'z', ctrlKey: true, kanban: true }))).toBe(true)
    expect(exec).toHaveBeenCalledWith('BACK')
    expect(handleCanvasFallbackKey(exec, baseCtx({ key: 'z', ctrlKey: true, shiftKey: true, kanban: true }))).toBe(true)
    expect(exec).toHaveBeenCalledWith('FORWARD')
  })

  test('焦点守卫：文本输入框放行（含撤销兜底）；对话框内不补位撤销；交互元素不译件', () => {
    const exec = vi.fn()
    // 输入框内：原生输入优先，z/y 兜底也不发（框内原生撤销）
    expect(handleCanvasFallbackKey(exec, baseCtx({ key: 'z', ctrlKey: true, inTextInput: true }))).toBe(false)
    // 对话框内：Radix 焦点陷阱，不补位撤销
    expect(handleCanvasFallbackKey(exec, baseCtx({ key: 'z', ctrlKey: true, inDialog: true }))).toBe(false)
    // 交互元素（select/button/a）：正常 Tab 导航优先，不译件（撤销兜底仍可达——砚栏按钮上 Ctrl+Z）
    expect(handleCanvasFallbackKey(exec, baseCtx({ key: 'Tab', inInteractive: true }))).toBe(false)
    expect(handleCanvasFallbackKey(exec, baseCtx({ key: 'z', ctrlKey: true, inInteractive: true }))).toBe(true)
    expect(exec).not.toHaveBeenCalledWith('INSERT_CHILD_NODE')
    expect(exec).toHaveBeenCalledWith('BACK')
  })
})
