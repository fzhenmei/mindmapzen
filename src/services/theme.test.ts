import { afterEach, describe, expect, test, vi } from 'vitest'
import { applyDocumentTheme, nextVisibleTheme, resolveTheme, watchSystemTheme } from './theme'

const media = (dark: boolean) => ({ matches: dark, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList

describe('theme 服务', () => {
  afterEach(() => { document.documentElement.removeAttribute('data-theme') })

  test('resolveTheme：auto 跟随系统，显式值直出', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(media(true))
    expect(resolveTheme('auto')).toBe('dark')
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('dark')).toBe('dark')
  })
  test('applyDocumentTheme 写 data-theme', () => {
    applyDocumentTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
  test('watchSystemTheme 注册监听并返回解绑', () => {
    const m = media(false)
    const spy = vi.spyOn(window, 'matchMedia').mockReturnValue(m)
    const cb = vi.fn()
    const stop = watchSystemTheme(cb)
    expect(m.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    stop()
    expect(m.removeEventListener).toHaveBeenCalled()
    spy.mockRestore()
  })
  test('nextVisibleTheme（系统亮）：单击必换可见主题', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(media(false))
    // auto(解析 light) → 跳过视觉相同的 light 直达 dark
    expect(nextVisibleTheme('auto')).toBe('dark')
    expect(nextVisibleTheme('light')).toBe('dark')
    // dark → auto（解析回 light，一次可见变化）
    expect(nextVisibleTheme('dark')).toBe('auto')
  })
  test('nextVisibleTheme（系统暗）：单击必换可见主题', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(media(true))
    // auto(解析 dark) → 跳过视觉相同的 dark 直达 light
    expect(nextVisibleTheme('auto')).toBe('light')
    expect(nextVisibleTheme('light')).toBe('auto')
    expect(nextVisibleTheme('dark')).toBe('light')
  })
})
