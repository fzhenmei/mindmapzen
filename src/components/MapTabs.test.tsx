import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import MapTabs from './MapTabs'
import { TooltipProvider } from './ui/tooltip'
import type { SwitchCandidate } from './QuickSwitchDialog'

// 顶部导图胶囊条（2026-09 鼠标流切换）：最近打开常驻平铺、当前图高亮、点选即切。
// 纯展示组件——候选派生（useQuickSwitch）与切换链（switchTo 安全链）在 EditorView 装配

const noop = (): void => {}

const cand = (mdPath: string, name: string, dir = ''): SwitchCandidate => ({ mdPath, name, dir })

/** 渲染脚手架：EditorView 根有 TooltipProvider，此处同构包裹 */
function renderTabs(tabs: ReadonlyArray<SwitchCandidate>, currentMdPath: string, onPick = noop): void {
  render(
    <TooltipProvider>
      <MapTabs tabs={tabs} currentMdPath={currentMdPath} onPick={onPick} />
    </TooltipProvider>,
  )
}

describe('MapTabs（顶部导图胶囊条）', () => {
  afterEach(cleanup)

  test('≥2 张渲染全部胶囊，当前图 aria-current 高亮', () => {
    renderTabs([cand('/ws/a.md', '图A'), cand('/ws/b.md', '图B'), cand('/ws/子/c.md', '图C', '子')], '/ws/b.md')
    expect(screen.getByTestId('map-tabs')).toBeInTheDocument()
    const items = screen.getAllByTestId('map-tab')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('图A')
    expect(items[1]).toHaveAttribute('aria-current', 'page')
    expect(items[0]).not.toHaveAttribute('aria-current')
    expect(items[2]).not.toHaveAttribute('aria-current')
  })

  test('仅 1 张（无切换意义）与空列表不渲染整条', () => {
    const { rerender } = render(
      <TooltipProvider>
        <MapTabs tabs={[cand('/ws/a.md', '图A')]} currentMdPath="/ws/a.md" onPick={noop} />
      </TooltipProvider>,
    )
    expect(screen.queryByTestId('map-tabs')).not.toBeInTheDocument()
    rerender(
      <TooltipProvider>
        <MapTabs tabs={[]} currentMdPath="/ws/a.md" onPick={noop} />
      </TooltipProvider>,
    )
    expect(screen.queryByTestId('map-tabs')).not.toBeInTheDocument()
  })

  test('点击非当前胶囊上报 mdPath（切换链在 EditorView）', () => {
    const onPick = vi.fn()
    renderTabs([cand('/ws/a.md', '图A'), cand('/ws/b.md', '图B')], '/ws/a.md', onPick)
    fireEvent.click(screen.getAllByTestId('map-tab')[1])
    expect(onPick).toHaveBeenCalledWith('/ws/b.md')
  })

  test('点击当前胶囊 no-op（不上报，不触发保存链）', () => {
    const onPick = vi.fn()
    renderTabs([cand('/ws/a.md', '图A'), cand('/ws/b.md', '图B')], '/ws/a.md', onPick)
    fireEvent.click(screen.getAllByTestId('map-tab')[0])
    expect(onPick).not.toHaveBeenCalled()
  })

  // 长名防线（2026-09 用户验收）：胶囊 truncate+max-w+min-w-0、容器限宽——nowrap 文本的
  // min-content=全文本宽，无 min-w-0 则 flex 收缩失效照样溢出；全名经 Tooltip 可达
  test('长名不破布局：胶囊单宽截断（truncate 挂内层 span）、容器限宽可收缩', () => {
    renderTabs([cand('/ws/a.md', '这张导图的名字特别长特别长特别长'), cand('/ws/b.md', 'b')], '/ws/a.md')
    expect(screen.getByTestId('map-tabs').className).toContain('max-w-[calc(100vw-2rem)]')
    const pill = screen.getAllByTestId('map-tab')[0]
    expect(pill.className).toContain('max-w-[10em]')
    expect(pill.className).toContain('min-w-0')
    // truncate 在内层 span 上：Button 基类 inline-flex，text-overflow 对 flex 容器无效
    expect(pill.querySelector('span')?.className).toContain('truncate')
  })

  // 高亮变体锚点（2026-09 修复回归）：Tailwind 无 aria-current 内置变体，须任意值语法
  // aria-[current=page]:——写成 aria-current:bg-primary 时不报错但类永不生成、高亮静默失效；
  // 点亮色与砚栏布局组（ToggleGroup data-state=on）同款 accent（2026-09 用户验收）
  test('当前图高亮类为任意值变体 accent 点亮（同布局组）', () => {
    renderTabs([cand('/ws/a.md', '图A'), cand('/ws/b.md', '图B')], '/ws/a.md')
    const pill = screen.getAllByTestId('map-tab')[0]
    expect(pill.className).toContain('aria-[current=page]:bg-accent')
    expect(pill.className).not.toContain('aria-current:')
  })
})
