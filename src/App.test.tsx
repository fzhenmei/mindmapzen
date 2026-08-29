import { render, screen } from '@testing-library/react'
import App from './App'

// 无工作区（测试环境 adapter 未注入，init 失败不设工作区）→ 文库默认落在开屏页（M5d Task 3）
test('应用默认渲染文件库视图（无工作区时为开屏页）', async () => {
  render(<App />)
  expect(await screen.findByTestId('welcome-screen')).toBeInTheDocument()
})
