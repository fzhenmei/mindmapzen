import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import QuickSwitchDialog, { type SwitchCandidate } from './QuickSwitchDialog'

// 候选样例（调用方已排除当前图）：跨目录三张，过滤/键盘/点击用
const candidates: SwitchCandidate[] = [
  { mdPath: '/ws/会议/周会.md', name: '周会', dir: '会议' },
  { mdPath: '/ws/读书.md', name: '读书', dir: '' },
  { mdPath: '/ws/项目/架构.md', name: '架构', dir: '项目' },
]

const renderDialog = (cs: SwitchCandidate[] = candidates) => {
  const onPick = vi.fn()
  const onClose = vi.fn()
  render(<QuickSwitchDialog candidates={cs} onPick={onPick} onClose={onClose} />)
  return { onPick, onClose }
}

/** 当前高亮项（aria-selected 的 option）——键盘流断言的锚点 */
const activeItem = (): HTMLElement =>
  screen.getAllByTestId('switch-item').find((el) => el.getAttribute('aria-selected') === 'true')!

describe('QuickSwitchDialog（编辑器内快速切换浮层）', () => {
  test('渲染候选并自动聚焦输入框，首项默认高亮', () => {
    renderDialog()
    expect(screen.getAllByTestId('switch-item').length).toBe(3)
    expect(screen.getByTestId('switch-input')).toBe(document.activeElement)
    expect(activeItem().textContent).toContain('周会')
  })

  test('输入过滤：名称大小写不敏感、目录名也可命中', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('switch-input'), { target: { value: '架构' } })
    expect(screen.getAllByTestId('switch-item').length).toBe(1)
    fireEvent.change(screen.getByTestId('switch-input'), { target: { value: '会 议'.slice(0, 2) } })
    expect(screen.getAllByTestId('switch-item').length).toBe(1)
    fireEvent.change(screen.getByTestId('switch-input'), { target: { value: ' nonexistent ' } })
    expect(screen.queryAllByTestId('switch-item').length).toBe(0)
    expect(screen.getByTestId('switch-empty')).toBeInTheDocument()
  })

  test('↑↓ 循环移动高亮', () => {
    renderDialog()
    const input = screen.getByTestId('switch-input')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(activeItem().textContent).toContain('读书')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(activeItem().textContent).toContain('架构')
    fireEvent.keyDown(input, { key: 'ArrowDown' }) // 循环回首项
    expect(activeItem().textContent).toContain('周会')
    fireEvent.keyDown(input, { key: 'ArrowUp' }) // 上越界到末项
    expect(activeItem().textContent).toContain('架构')
  })

  test('Enter 挑选当前高亮项', () => {
    const { onPick } = renderDialog()
    const input = screen.getByTestId('switch-input')
    fireEvent.change(input, { target: { value: '架构' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith('/ws/项目/架构.md')
  })

  test('点击条目直接挑选', () => {
    const { onPick } = renderDialog()
    fireEvent.click(screen.getAllByTestId('switch-item')[1])
    expect(onPick).toHaveBeenCalledWith('/ws/读书.md')
  })

  test('Esc 关闭浮层', () => {
    const { onPick, onClose } = renderDialog()
    fireEvent.keyDown(screen.getByTestId('switch-input'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onPick).not.toHaveBeenCalled()
  })
})
