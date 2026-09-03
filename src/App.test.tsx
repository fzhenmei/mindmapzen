import { fireEvent, render, screen } from '@testing-library/react'
import App from './App'

// 无工作区（测试环境 adapter 未注入，init 失败不设工作区）→ 文库默认落在开屏页（M5d Task 3）
test('应用默认渲染文件库视图（无工作区时为开屏页）', async () => {
  render(<App />)
  expect(await screen.findByTestId('welcome-screen')).toBeInTheDocument()
})

// WebView 默认快捷键全局屏蔽（v2.5 用户反馈：案头 Ctrl+P 调起打印）：
// 应用无对应功能的浏览器默认键一律 preventDefault；F5/Ctrl+R 刷新绕过关闭守卫最危险。
// 只阻默认行为不拦传播——应用自身快捷键（编辑器 Ctrl+P 浮层/Ctrl+S 保存）照常收到
test('WebView 默认快捷键被全局屏蔽，应用自有键不受影响', async () => {
  render(<App />)
  await screen.findByTestId('welcome-screen')

  // 屏蔽集：Ctrl+P 打印 / Ctrl+S 保存网页 / Ctrl+F 查找栏 / Ctrl+O 打开 / Ctrl+D 收藏 / Ctrl+R、F5 刷新
  for (const init of [
    { key: 'p', ctrlKey: true },
    { key: 's', ctrlKey: true },
    { key: 'f', ctrlKey: true },
    { key: 'o', ctrlKey: true },
    { key: 'd', ctrlKey: true },
    { key: 'r', ctrlKey: true },
    { key: 'F5' },
  ]) {
    const e = new KeyboardEvent('keydown', { ...init, cancelable: true, bubbles: true })
    fireEvent(window, e)
    expect(e.defaultPrevented, `Ctrl/${init.key} 应被屏蔽`).toBe(true)
  }

  // 应用自有键不被拦截（默认态保持，各视图自己的监听负责处理）
  for (const init of [
    { key: 'z', ctrlKey: true }, // 撤销（引擎）
    { key: 'c', ctrlKey: true, shiftKey: true }, // 复制分支
    { key: 'Tab', ctrlKey: true }, // 快速切换
  ]) {
    const e = new KeyboardEvent('keydown', { ...init, cancelable: true, bubbles: true })
    fireEvent(window, e)
    expect(e.defaultPrevented, `${init.key} 不应被全局屏蔽`).toBe(false)
  }
})

// 漫游引导（spec §3.3）：无工作区（开屏）不自动触发——先选工作区落案头后才开始
test('无工作区时不自动出现漫游引导', async () => {
  render(<App />)
  await screen.findByTestId('welcome-screen')
  expect(screen.queryByTestId('tour-overlay')).not.toBeInTheDocument()
})

