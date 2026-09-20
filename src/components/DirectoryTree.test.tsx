import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import DirectoryTree, { type TreeFile } from './DirectoryTree'
import { SidebarProvider } from './ui/sidebar'
import { useAppStore } from '../store/appStore'
import type { DirNode } from '../services/desk'

// 案头左树（2026-09 收藏置顶 + 列表排序）：行为经 props 注入覆盖（篮子徽章除外——判据读
// store 的 workspaceDir/basketRelPath，仅该组内就地设态）；
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
        onCopyPath={noop}
        onCopyWechat={noop}
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

  test('已收藏文件行尾收藏钮常显（aria-pressed 示态，文案取消收藏）', () => {
    renderTree({ favorites: [{ name: '甲图', relDir: 'docs' }] })
    // 树行与收藏组行各一枚，均示已收藏态
    for (const btn of screen.getAllByTestId('fav-btn-甲图')) {
      expect(btn).toHaveAttribute('aria-pressed', 'true')
      expect(btn).toHaveAttribute('aria-label', '取消收藏')
    }
    expect(screen.getByTestId('fav-btn-乙图')).toHaveAttribute('aria-pressed', 'false')
  })
})

// DetailActions 退役承接（2026-09 画布三态 M2）：详情页首独有「复制路径/公众号复制」
// 收敛进文件行右键菜单（删除项之后隔线一组）；全链（路径寻址/剪贴板）在 LibraryView 装配
describe('DirectoryTree 文件右键复制项', () => {
  test('菜单提供「复制路径」，点击回调待复制文件', async () => {
    const onCopyPath = vi.fn()
    renderTree({ onCopyPath })
    fireEvent.contextMenu(screen.getByTestId('file-node-甲图'))
    fireEvent.click(await screen.findByTestId('ctx-btn-copy-path'))
    expect(onCopyPath).toHaveBeenCalledWith(expect.objectContaining({ name: '甲图' }))
  })

  test('菜单提供「复制为公众号格式」，点击回调待复制文件', async () => {
    const onCopyWechat = vi.fn()
    renderTree({ onCopyWechat })
    fireEvent.contextMenu(screen.getByTestId('file-node-甲图'))
    fireEvent.click(await screen.findByTestId('ctx-btn-copy-wechat'))
    expect(onCopyWechat).toHaveBeenCalledWith(expect.objectContaining({ name: '甲图' }))
  })
})

// 行内悬停收藏钮（2026-09 微调）：文件行悬停显「收藏」浮层，点击即收藏/取消——
// 已收藏常显（状态指示），未收藏 hover 显示（CSS opacity，jsdom 不断言视觉只断言行）
describe('DirectoryTree 行内收藏钮', () => {
  test('未收藏行：点击收藏钮回调待收藏文件', () => {
    const onToggleFavorite = vi.fn()
    renderTree({ onToggleFavorite })
    fireEvent.click(screen.getByTestId('fav-btn-乙图'))
    expect(onToggleFavorite).toHaveBeenCalledWith({ name: '乙图', relDir: '' })
  })

  test('收藏组行同样提供收藏钮（取消收藏直达）', () => {
    const onToggleFavorite = vi.fn()
    renderTree({ favorites: [{ name: '甲图', relDir: 'docs' }], onToggleFavorite })
    // 树行 + 收藏组行两枚，点击任一均回调同一文件
    const btns = screen.getAllByTestId('fav-btn-甲图')
    expect(btns).toHaveLength(2)
    fireEvent.click(btns[1])
    expect(onToggleFavorite).toHaveBeenCalledWith({ name: '甲图', relDir: 'docs' })
  })

  test('收藏钮点击不触发行选中（收藏动作与选中/进详情解耦）', () => {
    const onSelectFile = vi.fn()
    renderTree({ onSelectFile })
    fireEvent.click(screen.getByTestId('fav-btn-乙图'))
    expect(onSelectFile).not.toHaveBeenCalled()
  })
})

// 收藏组折叠（2026-09 微调）：组标签即折叠扳机（官方 collapsible group 模式），
// 搜索时强制展开（收藏命中不被折叠态藏住）
describe('DirectoryTree 收藏组折叠', () => {
  test('标签点击收起/展开；收起后搜索强制展开', async () => {
    renderTree({ favorites: [{ name: '甲图', relDir: 'docs' }] })
    expect(screen.getByTestId('fav-node-甲图')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('fav-toggle'))
    await waitFor(() => expect(screen.queryByTestId('fav-node-甲图')).toBeNull())
    // 组标签仍在（可再展开）
    fireEvent.click(screen.getByTestId('fav-toggle'))
    expect(await screen.findByTestId('fav-node-甲图')).toBeInTheDocument()
    // 收起后搜索：强制展开，收藏命中可见
    fireEvent.click(screen.getByTestId('fav-toggle'))
    await waitFor(() => expect(screen.queryByTestId('fav-node-甲图')).toBeNull())
    fireEvent.change(screen.getByTestId('dir-search'), { target: { value: '甲' } })
    expect(await screen.findByTestId('fav-node-甲图')).toBeInTheDocument()
    // 清空搜索回落折叠态语义不回滚（受控 open 仅在搜索时置位）
    fireEvent.change(screen.getByTestId('dir-search'), { target: { value: '' } })
    await waitFor(() => expect(screen.queryByTestId('fav-node-甲图')).toBeNull())
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

// 篮子徽章（Task 10）：篮子文件行一眼可认——◱ 贴名称末尾（shrink-0 不挤压截断名）、纯装饰
// （aria-hidden）。判据 = 行内 TreeFile 反推 mdPath 与 basketAbsPath(ws, rel) 比对（同
// EditorView isBasket 口径）：同名不同目录/无工作区不误标。行渲染两处（树内普通行 file-node-*
// 与收藏组行 fav-node-*）共用 renderFile，徽章随之两处同时生效
describe('DirectoryTree 篮子徽章', () => {
  afterEach(() => useAppStore.setState({ workspaceDir: null, basketRelPath: null }))

  const badgeIn = (testid: string) => screen.getByTestId(testid).querySelector('[data-testid="basket-badge"]')

  test('篮子文件行带徽章，普通文件行不带', () => {
    useAppStore.setState({ workspaceDir: '/ws', basketRelPath: '点子篮子.md' })
    renderTree({ files: [{ name: '点子篮子', relDir: '' }, { name: '乙图', relDir: '' }] })
    expect(screen.getAllByTestId('basket-badge')).toHaveLength(1)
    const badge = badgeIn('file-node-点子篮子')
    expect(badge).not.toBeNull()
    expect(badge?.getAttribute('aria-hidden')).toBe('true')
    // 布局承重项（2026-09 审查加护）：shrink-0 保徽章不被名称挤压（误删即红）；名称 span
    // 无 flex-1 保徽章「贴名末」而非右对齐（误加即红），truncate 仍在（长名照截）
    expect(badge?.className).toContain('shrink-0')
    const nameSpan = screen.getByTestId('file-node-点子篮子').querySelector('span:not([data-testid])')
    expect(nameSpan?.className).toContain('truncate')
    expect(nameSpan?.className).not.toContain('flex-1')
    expect(badgeIn('file-node-乙图')).toBeNull()
  })

  test('收藏组行同样带徽章（树行 + 收藏行各一枚）', () => {
    useAppStore.setState({ workspaceDir: '/ws', basketRelPath: '点子篮子.md' })
    renderTree({ files: [{ name: '点子篮子', relDir: '' }], favorites: [{ name: '点子篮子', relDir: '' }] })
    expect(screen.getAllByTestId('basket-badge')).toHaveLength(2)
    expect(badgeIn('file-node-点子篮子')).not.toBeNull()
    expect(badgeIn('fav-node-点子篮子')).not.toBeNull()
  })

  test('嵌套目录的篮子行按绝对路径命中（relDir 拼接）', () => {
    useAppStore.setState({ workspaceDir: '/ws', basketRelPath: 'docs/篮子.md' })
    renderTree({ files: [{ name: '篮子', relDir: 'docs' }] })
    expect(badgeIn('file-node-篮子')).not.toBeNull()
  })

  test('同名不同目录不误标（按绝对路径而非名字判断）', () => {
    useAppStore.setState({ workspaceDir: '/ws', basketRelPath: 'docs/点子篮子.md' })
    renderTree({ files: [{ name: '点子篮子', relDir: '' }] })
    expect(screen.queryByTestId('basket-badge')).toBeNull()
  })

  test('无工作区（workspaceDir null）不渲染徽章（判空防线）', () => {
    useAppStore.setState({ workspaceDir: null, basketRelPath: '点子篮子.md' })
    renderTree({ files: [{ name: '点子篮子', relDir: '' }] })
    expect(screen.queryByTestId('basket-badge')).toBeNull()
  })

  test('篮子路径未定（basketRelPath null）不渲染徽章（判空防线）', () => {
    useAppStore.setState({ workspaceDir: '/ws', basketRelPath: null })
    renderTree({ files: [{ name: '点子篮子', relDir: '' }] })
    expect(screen.queryByTestId('basket-badge')).toBeNull()
  })
})
