import { clampOverlayPos, cn } from './utils'

// cn = clsx 合并 + tailwind-merge 冲突消解：shadcn 约定的类名工具（Task 2 底座）

test('clsx 合并：多参、数组、条件真值保留、假值滤除', () => {
  expect(cn('flex', 'items-center')).toBe('flex items-center')
  expect(cn(['px-2', 'py-1'])).toBe('px-2 py-1')
  const cond = 1 === 1
  expect(cn('flex', cond && 'gap-2', !cond && 'hidden', undefined, null, '')).toBe('flex gap-2')
})

test('tailwind-merge 冲突消解：同组后者覆盖前者，跨组保留', () => {
  // 同组（水平内边距）：后者胜
  expect(cn('px-2', 'px-4')).toBe('px-4')
  // 调用方 className 压过组件内置默认（组件库核心诉求：bg-primary 被 bg-destructive 覆盖）
  expect(cn('bg-primary', 'bg-destructive')).toBe('bg-destructive')
  // 跨组互不影响；非相邻的同类冲突同样按序消解
  expect(cn('text-sm', 'px-1', 'text-base')).toBe('px-1 text-base')
})

test('clsx + tailwind-merge 组合：条件类参与冲突消解', () => {
  const active = 2 > 1
  expect(cn('bg-primary', active && 'bg-card')).toBe('bg-card')
  expect(cn('h-8', 'px-4', !active && 'h-4')).toBe('h-8 px-4')
})

// clampOverlayPos = 浮层锚点视口钳制（边缘浮层修复 2026-09-22）：正文悬停窗 / 节点
// 浮动操作条共用——TourOverlay.popoverPos 惯用法的泛化，边界放不下时贴边保可见
describe('clampOverlayPos', () => {
  test('视口内锚点原样保留', () => {
    expect(clampOverlayPos(100, 200, 300, 150, 1200, 800)).toEqual({ left: 100, top: 200 })
  })
  test('右/下缘溢出收进边界（宽 300 高 150 视口 1200×800 边距 8）', () => {
    // 右缘：1100 + 300 > 1200 - 8 → 收到 892；下缘：700 + 150 > 800 - 8 → 收到 642
    expect(clampOverlayPos(1100, 700, 300, 150, 1200, 800)).toEqual({ left: 892, top: 642 })
  })
  test('左/上缘负值抬到边距', () => {
    expect(clampOverlayPos(-20, -5, 300, 150, 1200, 800)).toEqual({ left: 8, top: 8 })
  })
  test('边界放不下（浮层大于边界）退到边距贴边，不产生负坐标', () => {
    // 宽 1300 > 1200：maxLeft = max(1200-1300-8, 8) = 8
    expect(clampOverlayPos(500, 500, 1300, 900, 1200, 800)).toEqual({ left: 8, top: 8 })
  })
  test('自定义边距', () => {
    expect(clampOverlayPos(1100, 700, 300, 150, 1200, 800, 16)).toEqual({ left: 884, top: 634 })
  })
})
