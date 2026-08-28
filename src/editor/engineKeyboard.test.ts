import { describe, expect, test, vi } from 'vitest'
import { handleEngineKeyDown } from './engineKeyboard'

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
