import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ThemeToggle from './ThemeToggle'
import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'

// 验收修复 1：单击必须切换可见主题——从 auto（系统亮）首个候选 light 与当前解析相同，
// 应跳过直达 dark；系统暗时同理反向。mock 手法与 theme.test.ts 一致（vi.spyOn matchMedia）
const media = (dark: boolean) =>
  ({ matches: dark, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList

const mockSystem = (dark: boolean) => vi.spyOn(window, 'matchMedia').mockReturnValue(media(dark))

const setPref = (p: 'auto' | 'light' | 'dark') =>
  useAppStore.setState({ themePref: p, resolvedTheme: p === 'auto' ? 'light' : p })

describe('ThemeToggle 单击必换可见主题', () => {
  beforeEach(() => {
    useAppStore.getState().setAdapter(new MemoryFsAdapter())
    useAppStore.setState({ configPath: '/cfg.json' })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    setPref('auto')
    cleanup()
  })

  describe('系统亮色', () => {
    beforeEach(() => mockSystem(false))

    test('pref=auto → 单击跳过视觉相同的 light 直达 dark', async () => {
      setPref('auto')
      render(<ThemeToggle />)
      fireEvent.click(screen.getByTestId('btn-theme'))
      await waitFor(() => expect(useAppStore.getState().themePref).toBe('dark'))
      expect(document.documentElement.dataset.theme).toBe('dark')
    })

    test('pref=light → 单击切换 dark', async () => {
      setPref('light')
      render(<ThemeToggle />)
      fireEvent.click(screen.getByTestId('btn-theme'))
      await waitFor(() => expect(useAppStore.getState().themePref).toBe('dark'))
    })

    test('pref=dark → 单击切换 auto（解析回亮，一次可见变化）', async () => {
      setPref('dark')
      render(<ThemeToggle />)
      fireEvent.click(screen.getByTestId('btn-theme'))
      await waitFor(() => expect(useAppStore.getState().themePref).toBe('auto'))
      expect(document.documentElement.dataset.theme).toBe('light')
    })
  })

  describe('系统暗色', () => {
    beforeEach(() => mockSystem(true))

    test('pref=auto → 单击直达 light（跳过视觉相同的 dark）', async () => {
      setPref('auto')
      render(<ThemeToggle />)
      fireEvent.click(screen.getByTestId('btn-theme'))
      await waitFor(() => expect(useAppStore.getState().themePref).toBe('light'))
    })

    test('pref=light → 单击切换 auto（解析回暗）', async () => {
      setPref('light')
      render(<ThemeToggle />)
      fireEvent.click(screen.getByTestId('btn-theme'))
      await waitFor(() => expect(useAppStore.getState().themePref).toBe('auto'))
    })

    test('pref=dark → 单击切换 light', async () => {
      setPref('dark')
      render(<ThemeToggle />)
      fireEvent.click(screen.getByTestId('btn-theme'))
      await waitFor(() => expect(useAppStore.getState().themePref).toBe('light'))
    })
  })
})
