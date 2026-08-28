import { render, screen } from '@testing-library/react'
import App from './App'

test('应用默认渲染文件库视图', () => {
  render(<App />)
  expect(screen.getByTestId('btn-workspace')).toBeInTheDocument()
})
