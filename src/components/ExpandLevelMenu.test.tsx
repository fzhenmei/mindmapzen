// ExpandLevelMenu（一键收起到 N 级）：砚栏缩放段的层级单选下拉——受控值由
// statusOps.expandLevelOf 派生（'all' / n / undefined 混合态），点选即执行
// EXPAND_ALL / UNEXPAND_TO_LEVEL（接线在 ZenBar props，组件纯展示）。
// jsdom 驱动沿用 ZenBar 复制组下拉模式：pointerDown（button 0）展开，data-testid 定位条目。
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TooltipProvider } from './ui/tooltip'
import ExpandLevelMenu from './ExpandLevelMenu'

const renderMenu = (level: number | 'all' | undefined): void => {
  render(
    <TooltipProvider>
      <ExpandLevelMenu level={level} onSelect={() => {}} />
    </TooltipProvider>,
  )
}

/** 展开菜单（pointerDown 同 ZenBar 复制组下拉驱动模式） */
const openMenu = (): void => {
  fireEvent.pointerDown(screen.getByTestId('btn-expand-level'), { button: 0 })
}

afterEach(cleanup)

describe('ExpandLevelMenu（层级单选下拉）', () => {
  test('渲染触发钮（aria-label 语义名）；展开后含「全部展开」与 1~5 级六项', () => {
    renderMenu('all')
    expect(screen.getByTestId('btn-expand-level')).toHaveAttribute('aria-label', '展开层级')
    openMenu()
    expect(screen.getByTestId('expand-level-all')).toBeVisible()
    for (let n = 1; n <= 5; n += 1) {
      expect(screen.getByTestId(`expand-level-${n}`)).toBeVisible()
    }
    expect(screen.getByTestId('expand-level-2')).toHaveTextContent('展开到 2 级')
  })

  test('受控选中态：level=all 高亮全部展开项；level=2 高亮 2 级项；混合态（undefined）无高亮', () => {
    const { unmount } = render(<TooltipProvider><ExpandLevelMenu level="all" onSelect={() => {}} /></TooltipProvider>)
    openMenu()
    expect(screen.getByTestId('expand-level-all')).toHaveAttribute('data-state', 'checked')
    unmount()

    render(<TooltipProvider><ExpandLevelMenu level={2} onSelect={() => {}} /></TooltipProvider>)
    openMenu()
    expect(screen.getByTestId('expand-level-2')).toHaveAttribute('data-state', 'checked')
    expect(screen.getByTestId('expand-level-all')).toHaveAttribute('data-state', 'unchecked')
    cleanup()

    render(<TooltipProvider><ExpandLevelMenu level={undefined} onSelect={() => {}} /></TooltipProvider>)
    openMenu()
    for (const id of ['expand-level-all', 'expand-level-1', 'expand-level-3', 'expand-level-5']) {
      expect(screen.getByTestId(id)).toHaveAttribute('data-state', 'unchecked')
    }
  })

  test('点选回调：全部展开 → onSelect("all")；3 级 → onSelect(3)', () => {
    const onSelect = vi.fn()
    render(<TooltipProvider><ExpandLevelMenu level={undefined} onSelect={onSelect} /></TooltipProvider>)
    openMenu()
    fireEvent.click(screen.getByTestId('expand-level-all'))
    expect(onSelect).toHaveBeenCalledWith('all')
    cleanup()

    const onSelect2 = vi.fn()
    render(<TooltipProvider><ExpandLevelMenu level={undefined} onSelect={onSelect2} /></TooltipProvider>)
    openMenu()
    fireEvent.click(screen.getByTestId('expand-level-3'))
    expect(onSelect2).toHaveBeenCalledWith(3)
  })
})
