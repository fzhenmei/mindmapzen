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

// jsdom 未实现 Pointer Capture API：Radix Select 等原语的指针事件处理会调用之。
// 守卫式桩（不覆盖可能的真实实现）：无捕获语义下 Radix 退化为普通指针事件驱动。
if (typeof HTMLElement.prototype.hasPointerCapture !== 'function') {
  HTMLElement.prototype.hasPointerCapture = (): boolean => false
}
if (typeof HTMLElement.prototype.setPointerCapture !== 'function') {
  HTMLElement.prototype.setPointerCapture = (): void => {}
}
if (typeof HTMLElement.prototype.releasePointerCapture !== 'function') {
  HTMLElement.prototype.releasePointerCapture = (): void => {}
}

// jsdom 未实现 scrollIntoView：Radix Select/Menu 高亮项滚动调用之（无滚动布局，空操作即可）
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = (): void => {}
}

// jsdom 未实现 ResizeObserver：Radix Tooltip/Popper 系（ui/tooltip、select、dropdown 等
// 官方源码）依赖其测量浮层。守卫式空桩（不覆盖可能的真实实现），回调永不触发。
if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
  class ResizeObserverStub implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub
}
