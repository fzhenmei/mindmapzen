import { render } from '@testing-library/react'
import { ScrollArea } from './scroll-area'

// ScrollArea（官方源码重置）：定位经官方 data-slot（Root/Viewport/Scrollbar/Thumb）。

test('渲染滚动区：视口全尺寸承接 + 子内容透传（Scrollbar 需真实溢出，jsdom 不渲染）', () => {
  const { container } = render(
    <ScrollArea className="h-40">
      <p>目录条目</p>
    </ScrollArea>,
  )
  const q = (slot: string) => container.querySelector(`[data-slot="${slot}"]`)!
  expect(q('scroll-area').className).toContain('relative')
  expect(q('scroll-area').className).toContain('h-40')
  expect(q('scroll-area-viewport').className).toContain('size-full')
  expect(container.querySelector('p')!.textContent).toBe('目录条目')
})
