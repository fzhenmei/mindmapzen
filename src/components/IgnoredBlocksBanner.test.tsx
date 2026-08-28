import { fireEvent, render, screen } from '@testing-library/react'
import IgnoredBlocksBanner from './IgnoredBlocksBanner'

test('显示数量、默认收起、可展开', () => {
  render(
    <IgnoredBlocksBanner
      blocks={[
        { type: 'paragraph', excerpt: '一段说明' },
        { type: 'code', excerpt: 'code()' },
      ]}
    />,
  )
  expect(screen.getByTestId('ignored-banner')).toHaveTextContent('2 个内容块未映射')
  expect(screen.queryByTestId('ignored-list')).not.toBeInTheDocument()
  fireEvent.click(screen.getByTestId('ignored-toggle'))
  expect(screen.getByTestId('ignored-list')).toHaveTextContent('段落：一段说明')
  expect(screen.getByTestId('ignored-list')).toHaveTextContent('代码块：code()')
})
