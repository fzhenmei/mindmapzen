import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import DevBadge from './DevBadge'

// DEV 贴纸（2026-09 版本信息批）：import.meta.env.DEV 驱动——tauri dev（vite dev
// server）为 true 显示，tauri build 出的 release 包为 false 不渲染；右下角避让主题钮
describe('DevBadge', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
  })

  test('DEV 构建渲染「DEV」贴纸', () => {
    vi.stubEnv('DEV', true)
    render(<DevBadge />)
    expect(screen.getByTestId('dev-badge')).toBeInTheDocument()
    expect(screen.getByTestId('dev-badge')).toHaveTextContent('DEV')
  })

  test('release 构建（DEV=false）不渲染', () => {
    vi.stubEnv('DEV', false)
    render(<DevBadge />)
    expect(screen.queryByTestId('dev-badge')).not.toBeInTheDocument()
  })
})
