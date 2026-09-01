import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import TitleBar from './TitleBar'
import { useAppStore } from '../store/appStore'

// 顶部条（自定义标题栏）测试：jsdom 无 __TAURI_INTERNALS__，覆盖点是渲染结构、
// titlebarBg 驱动底色、以及非 Tauri 环境点击三键 no-op 不抛错（动态 import 不触发）
describe('TitleBar 自定义标题栏', () => {
  afterEach(() => {
    useAppStore.setState({ titlebarBg: '--background' })
    cleanup()
  })

  test('渲染 logo+品名与窗口三键', () => {
    render(<TitleBar />)
    expect(screen.getByText('Mind Map Zen')).toBeTruthy()
    expect(screen.getByTestId('btn-win-min')).toBeTruthy()
    expect(screen.getByTestId('btn-win-max')).toBeTruthy()
    expect(screen.getByTestId('btn-win-close')).toBeTruthy()
  })

  test('titlebarBg 驱动底色：案头 sidebar 色 / 编辑器 background', async () => {
    render(<TitleBar />)
    const bar = screen.getByTestId('titlebar')
    useAppStore.setState({ titlebarBg: '--sidebar' })
    await waitFor(() => expect(bar.className).toContain('bg-sidebar'))
    useAppStore.setState({ titlebarBg: '--background' })
    await waitFor(() => expect(bar.className).toContain('bg-background'))
  })

  test('非 Tauri 环境点击窗口三键 no-op 不抛错', () => {
    render(<TitleBar />)
    for (const id of ['btn-win-min', 'btn-win-max', 'btn-win-close']) {
      expect(() => fireEvent.click(screen.getByTestId(id))).not.toThrow()
    }
  })
})
