// 设置面板快速捕获分区（spec §5.1/§5.3；2026-09 拆分为双开关）：两开关独立调 store；
// 失败说明走内联位
import { render, screen, fireEvent, act } from '@testing-library/react'
import { vi, test, expect } from 'vitest'
import SettingsDialog from './SettingsDialog'
import { useAppStore } from '../store/appStore'

test('快速捕获分区：快捷键/托盘两开关独立调 setQuickCaptureConfig；注册失败说明显示', () => {
  const spy = vi.fn().mockResolvedValue(undefined)
  useAppStore.setState({
    setQuickCaptureConfig: spy,
    quickCaptureShortcut: false,
    quickCaptureTray: false,
    quickCaptureShortcutError: null,
  } as never)
  render(<SettingsDialog onClose={() => {}} />)
  expect(screen.getByTestId('settings-quickcapture-section')).toBeVisible()
  fireEvent.click(screen.getByTestId('quickcapture-shortcut'))
  expect(spy).toHaveBeenCalledWith({ shortcut: true })
  fireEvent.click(screen.getByTestId('quickcapture-tray'))
  expect(spy).toHaveBeenCalledWith({ tray: true })
  expect(screen.queryByTestId('quickcapture-shortcut-error')).toBeNull()
  // render 之后改 store 须包 act（React 19 调度：裸 setState 的重渲染不落 DOM，项目既有模式）
  act(() => useAppStore.setState({ quickCaptureShortcutError: '占用' }))
  expect(screen.getByTestId('quickcapture-shortcut-error')).toBeVisible()
})
