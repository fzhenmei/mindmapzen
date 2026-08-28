import '@testing-library/jest-dom/vitest'

// jsdom 未实现 window.matchMedia：主题服务依赖 prefers-color-scheme。
// 守卫式桩（不覆盖可能的真实实现）：matches=false → 默认亮色；监听注册为空操作（jsdom 不触发 change）。
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
}
