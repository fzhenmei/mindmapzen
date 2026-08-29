import { render, screen } from '@testing-library/react'
import { ScrollArea } from './scroll-area'

test('渲染滚动区：视口裁剪布局 + 子内容透传', () => {
  render(
    <ScrollArea className="h-40">
      <p>目录条目</p>
    </ScrollArea>,
  )
  const area = screen.getByTestId('ui-scroll-area')
  expect(area.className).toContain('overflow-hidden')
  const viewport = screen.getByTestId('ui-scroll-viewport')
  expect(viewport.className).toContain('h-full')
  expect(screen.getByText('目录条目')).toBeInTheDocument()
})
