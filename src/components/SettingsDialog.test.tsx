import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SettingsDialog from './SettingsDialog'
import { useAppStore } from '../store/appStore'
import { DEFAULT_COPY_SETTINGS } from '../types/files'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'

// 设置对话框（M5b Task 4）：渲染 store 现值、切换即写 store 并持久化、关闭回调
describe('SettingsDialog', () => {
  beforeEach(() => {
    useAppStore.getState().setAdapter(new MemoryFsAdapter())
    useAppStore.setState({ configPath: '/cfg.json', settings: { ...DEFAULT_COPY_SETTINGS } })
  })
  afterEach(cleanup)

  test('渲染两开关，默认 复制含备注=off、保留双链=on', () => {
    render(<SettingsDialog onClose={() => {}} />)
    expect(screen.getByTestId('settings-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('copy-note-toggle')).not.toBeChecked()
    expect(screen.getByTestId('copy-links-toggle')).toBeChecked()
    expect(screen.getByText('复制时包含备注')).toBeInTheDocument()
    expect(screen.getByText('复制时保留双链标记')).toBeInTheDocument()
  })

  test('开关反映 store 现值（copyIncludeNote=true 时点亮）', () => {
    useAppStore.setState({ settings: { copyIncludeNote: true, copyIncludeLinks: false } })
    render(<SettingsDialog onClose={() => {}} />)
    expect(screen.getByTestId('copy-note-toggle')).toBeChecked()
    expect(screen.getByTestId('copy-links-toggle')).not.toBeChecked()
  })

  test('切换即更新 store 并持久化到配置（load-merge-save）', async () => {
    // 预置一份既有配置：合并保存不得覆盖其他字段
    await useAppStore.getState().adapter.writeTextFileAtomic(
      '/cfg.json',
      JSON.stringify({ workspaceDir: '/ws', lastOpened: null, preferredLayout: 'logic', theme: 'dark' }),
    )
    render(<SettingsDialog onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('copy-note-toggle'))
    fireEvent.click(screen.getByTestId('copy-links-toggle'))
    await waitFor(() =>
      expect(useAppStore.getState().settings).toEqual({ copyIncludeNote: true, copyIncludeLinks: false }),
    )
    const cfg = JSON.parse(await useAppStore.getState().adapter.readTextFile('/cfg.json'))
    expect(cfg.settings).toEqual({ copyIncludeNote: true, copyIncludeLinks: false })
    expect(cfg.workspaceDir).toBe('/ws') // 合并保存保留其他字段
    expect(cfg.preferredLayout).toBe('logic')
    expect(cfg.theme).toBe('dark')
  })

  test('关闭按钮触发 onClose', () => {
    const onClose = vi.fn()
    render(<SettingsDialog onClose={onClose} />)
    fireEvent.click(screen.getByTestId('settings-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
