import { render, screen } from '@testing-library/react'
import App from './App'

test('应用渲染标题', () => {
  render(<App />)
  expect(screen.getByText('Mind Map Zen')).toBeInTheDocument()
})
