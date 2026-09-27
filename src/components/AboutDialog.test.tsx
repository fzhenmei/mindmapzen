import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import AboutDialog from './AboutDialog'

// 关于对话框（2026-09 设置窗手风琴批）：产品名/版本/commit/开源链接渲染；纯回调组件——
// 重看引导与关闭的 store/装配链由 SettingsDialog.test 覆盖，此处只守卫本框行为
describe('AboutDialog', () => {
  afterEach(cleanup)

  test('渲染产品名、版本号、commit 短哈希与开源链接', () => {
    render(<AboutDialog onClose={() => {}} onReplayTour={() => {}} />)
    expect(screen.getByTestId('about-dialog')).toBeInTheDocument()
    expect(screen.getByText('Mind Map Zen')).toBeInTheDocument()
    const version = screen.getByTestId('about-version')
    expect(version).toHaveTextContent(`v${__APP_VERSION__}`)
    expect(version).toHaveTextContent(__GIT_COMMIT__)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://github.com/fzhenmei/mindmapzen')
    expect(link).toHaveAttribute('target', '_blank')
  })

  test('重看引导按钮触发 onReplayTour；关闭按钮触发 onClose', () => {
    const onReplayTour = vi.fn()
    const onClose = vi.fn()
    render(<AboutDialog onClose={onClose} onReplayTour={onReplayTour} />)
    fireEvent.click(screen.getByTestId('tour-replay'))
    expect(onReplayTour).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('about-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
