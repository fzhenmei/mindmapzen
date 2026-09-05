import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import DirectoryTree, { type TreeFile } from './DirectoryTree'
import { SidebarProvider } from './ui/sidebar'
import type { DirNode } from '../services/desk'

// 案头左树（2026-09 收藏置顶 + 列表排序）：全注入 props 无 store 依赖，组件面行为在此覆盖；
// favorites 派生（store∩maps 宽容剔除）与重命名/移动 relocate 接线归 LibraryView 面
const tree: DirNode[] = [{ name: 'docs', path: 'docs', children: [] }]
const files: TreeFile[] = [
  { name: '乙图', relDir: '' },
  { name: '甲图', relDir: 'docs' },
]
const noop = () => {}

const renderTree = (over: Partial<Parameters<typeof DirectoryTree>[0]> = {}) =>
  render(
    <SidebarProvider>
      <DirectoryTree
        tree={tree}
        files={files}
        rootLabel="工作区"
        rootTooltip="/ws"
        selected={null}
        selectedFile={null}
        favorites={[]}
        sort="modified"
        onSelect={noop}
        onSelectFile={noop}
        onOpenFile={noop}
        onFileAction={noop}
        onCreateMapIn={noop}
        onCreateDirIn={noop}
        onDeleteDir={noop}
        onMoveFile={noop}
        onMoveDir={noop}
        onToggleFavorite={noop}
        onSortChange={noop}
        {...over}
      />
    </SidebarProvider>,
  )

beforeEach(() => {
  // Radix ContextMenu 右键菜单挂 body（非组件树内），screen 全局查询即可
})
afterEach(cleanup)

describe('DirectoryTree 收藏组', () => {
  test('有收藏时顶部渲染「收藏」组，行以星标图标区分', () => {
    renderTree({ favorites: [{ name: '甲图', relDir: 'docs' }] })
    expect(screen.getByText('收藏')).toBeInTheDocument()
    expect(screen.getByTestId('fav-node-甲图')).toBeInTheDocument()
  })

  test('空收藏整组隐藏（零成本不添乱）', () => {
    renderTree({ favorites: [] })
    expect(screen.queryByText('收藏')).toBeNull()
    expect(screen.queryByTestId('fav-node-甲图')).toBeNull()
  })

  test('收藏行单击选中预览、双击进纸面（与文件行同语义）', () => {
    const onSelectFile = vi.fn()
    const onOpenFile = vi.fn()
    renderTree({ favorites: [{ name: '甲图', relDir: 'docs' }], onSelectFile, onOpenFile })
    fireEvent.click(screen.getByTestId('fav-node-甲图'))
    expect(onSelectFile).toHaveBeenCalledWith({ name: '甲图', relDir: 'docs' })
    fireEvent.doubleClick(screen.getByTestId('fav-node-甲图'))
    expect(onOpenFile).toHaveBeenCalledWith({ name: '甲图', relDir: 'docs' })
  })

  test('搜索过滤收藏组（与目录树同口径）', () => {
    renderTree({ favorites: [{ name: '甲图', relDir: 'docs' }, { name: '乙图', relDir: '' }] })
    fireEvent.change(screen.getByTestId('dir-search'), { target: { value: '甲' } })
    expect(screen.getByTestId('fav-node-甲图')).toBeInTheDocument()
    expect(screen.queryByTestId('fav-node-乙图')).toBeNull()
  })
})

describe('DirectoryTree 收藏入口', () => {
  test('文件行右键菜单提供「收藏」，点击回调待收藏文件', async () => {
    const onToggleFavorite = vi.fn()
    renderTree({ onToggleFavorite })
    fireEvent.contextMenu(screen.getByTestId('file-node-甲图'))
    fireEvent.click(await screen.findByTestId('ctx-btn-favorite'))
    expect(onToggleFavorite).toHaveBeenCalledWith({ name: '甲图', relDir: 'docs' })
  })

  test('已收藏文件菜单项变「取消收藏」', async () => {
    renderTree({ favorites: [{ name: '甲图', relDir: 'docs' }] })
    fireEvent.contextMenu(screen.getByTestId('file-node-甲图'))
    expect(await screen.findByText('取消收藏')).toBeInTheDocument()
  })

  test('已收藏文件在目录树行尾显示星标', () => {
    renderTree({ favorites: [{ name: '甲图', relDir: 'docs' }] })
    expect(screen.getByTestId('fav-star-甲图')).toBeInTheDocument()
    expect(screen.queryByTestId('fav-star-乙图')).toBeNull()
  })
})

describe('DirectoryTree 排序钮', () => {
  // Radix DropdownMenu 触发是 pointerDown（同 ui/dropdown-menu.test 口径），click 打不开
  test('搜索框旁排序钮开下拉两档，点选回调并单选指示当前档', async () => {
    const onSortChange = vi.fn()
    renderTree({ onSortChange })
    fireEvent.pointerDown(screen.getByTestId('dir-sort'), { button: 0 })
    fireEvent.click(await screen.findByTestId('sort-name'))
    expect(onSortChange).toHaveBeenCalledWith('name')
  })

  test('当前排序档 aria-checked（RadioGroup 受控）', async () => {
    renderTree({ sort: 'name' })
    fireEvent.pointerDown(screen.getByTestId('dir-sort'), { button: 0 })
    await waitFor(() => expect(screen.getByTestId('sort-name').getAttribute('aria-checked')).toBe('true'))
    expect(screen.getByTestId('sort-modified').getAttribute('aria-checked')).toBe('false')
  })
})
