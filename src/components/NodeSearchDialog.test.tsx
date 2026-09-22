// NodeSearchDialog(节点搜索浮层):QuickSwitchDialog 骨架——顶部定位、输入即过滤、
// ↑↓/Tab/Enter 键盘流;差异点:跳转后浮层保持(连续 Enter 跳下一处,Esc 才关)。
// 数据面在 services/nodeSearch 纯函数,本组件纯展示(候选经 props)。
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import NodeSearchDialog from './NodeSearchDialog'
import type { NodeHit } from '../services/nodeSearch'

const hits: NodeHit[] = [
  { uid: 'r', text: '根主题', path: '', depth: 0 },
  { uid: 'a', text: '甲分支', path: '根主题', depth: 1 },
  { uid: 't1', text: '任务甲', path: '根主题 / 甲分支', depth: 2 },
  { uid: 't2', text: '任务甲', path: '根主题 / 乙分支', depth: 2 },
  { uid: 's1', text: 'SpringBoot', path: '根主题 / 乙分支', depth: 2 },
]

afterEach(cleanup)

describe('NodeSearchDialog(节点搜索浮层)', () => {
  test('输入框渲染 autoFocus;空 query 列前 50 条不显示计数条', () => {
    render(<NodeSearchDialog hits={hits} onPick={() => {}} onClose={() => {}} />)
    const input = screen.getByTestId('node-search-input')
    expect(input).toHaveAttribute('placeholder', '输入节点关键词…')
    expect(document.activeElement).toBe(input)
    expect(screen.getAllByTestId('node-search-item')).toHaveLength(5)
    expect(screen.queryByTestId('node-search-count')).not.toBeInTheDocument()
  })

  test('输入即过滤(大小写不敏感)+ 计数条显示匹配数', () => {
    render(<NodeSearchDialog hits={hits} onPick={() => {}} onClose={() => {}} />)
    fireEvent.change(screen.getByTestId('node-search-input'), { target: { value: '任务' } })
    expect(screen.getAllByTestId('node-search-item')).toHaveLength(2)
    expect(screen.getByTestId('node-search-count')).toHaveTextContent('2 个匹配节点')
    fireEvent.change(screen.getByTestId('node-search-input'), { target: { value: 'spring' } })
    expect(screen.getAllByTestId('node-search-item')).toHaveLength(1)
  })

  test('无匹配出空态', () => {
    render(<NodeSearchDialog hits={hits} onPick={() => {}} onClose={() => {}} />)
    fireEvent.change(screen.getByTestId('node-search-input'), { target: { value: '不存在' } })
    expect(screen.getByTestId('node-search-empty')).toBeVisible()
  })

  test('条目展示:主行文本 + 次行路径面包屑(根节点无次行)', () => {
    render(<NodeSearchDialog hits={hits} onPick={() => {}} onClose={() => {}} />)
    const items = screen.getAllByTestId('node-search-item')
    expect(items[0]).toHaveTextContent('根主题')
    expect(items[2]).toHaveTextContent('任务甲')
    expect(items[2]).toHaveTextContent('根主题 / 甲分支')
  })

  test('键盘流:↑↓/Tab 循环移动高亮(aria-selected);Enter 跳转且浮层保持', () => {
    const onPick = vi.fn()
    render(<NodeSearchDialog hits={hits} onPick={onPick} onClose={() => {}} />)
    const input = screen.getByTestId('node-search-input')
    const items = () => screen.getAllByTestId('node-search-item')
    expect(items()[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(items()[1]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(items()[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(items()[1]).toHaveAttribute('aria-selected', 'true')
    // 新过滤词:高亮回首位
    fireEvent.change(input, { target: { value: '任务' } })
    const filtered = screen.getAllByTestId('node-search-item')
    expect(filtered[0]).toHaveAttribute('aria-selected', 'true')
    // Enter 跳当前高亮;浮层保持(输入框仍在,可继续跳)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith('t1')
    expect(screen.getByTestId('node-search-input')).toBeInTheDocument()
  })

  test('点击条目跳转(hover 同步高亮)', () => {
    const onPick = vi.fn()
    render(<NodeSearchDialog hits={hits} onPick={onPick} onClose={() => {}} />)
    const items = screen.getAllByTestId('node-search-item')
    fireEvent.mouseEnter(items[4])
    expect(items[4]).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(items[4])
    expect(onPick).toHaveBeenCalledWith('s1')
  })
})
