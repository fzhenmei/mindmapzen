import { cn } from './utils'

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
