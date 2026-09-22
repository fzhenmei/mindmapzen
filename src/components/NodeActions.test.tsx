// src/components/NodeActions.test.tsx —— 边缘锚点钳制（2026-09-22 边缘浮层修复）：
// 节点在画布右/下缘时浮动条锚点溢出容器被视口裁剪不可见；渲染后按实测尺寸钳进
// offsetParent(.editor)。jsdom 无布局（clientWidth/offsetWidth 恒 0），量测经
// own-property 桩注入；挂载时桩未就位，用 rerender 触发无依赖 useLayoutEffect 重跑。
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import NodeActions from './NodeActions'
import { TooltipProvider } from './ui/tooltip'

const noop = (): void => {}
const handlers = {
  onBodyClick: noop,
  onLinkClick: noop,
  onIconClick: noop,
  onImageClick: noop,
  onTagClick: noop,
  onStatusClick: noop,
}

/** 挂载 → 注入宿主 1200×800、浮条 300×40 量测桩 → 同 props rerender 让钳制 effect 重跑 */
function renderClamped(pos: { left: number; top: number }) {
  const tree = (p: { left: number; top: number }) => (
    <TooltipProvider>
      <div style={{ position: 'relative' }}>
        <NodeActions {...handlers} pos={p} />
      </div>
    </TooltipProvider>
  )
  const utils = render(tree(pos))
  const host = utils.container.firstElementChild as HTMLElement
  Object.defineProperty(host, 'clientWidth', { value: 1200, configurable: true })
  Object.defineProperty(host, 'clientHeight', { value: 800, configurable: true })
  const bar = screen.getByTestId('node-actions')
  Object.defineProperty(bar, 'offsetWidth', { value: 300, configurable: true })
  Object.defineProperty(bar, 'offsetHeight', { value: 40, configurable: true })
  utils.rerender(tree(pos))
  return bar
}

describe('NodeActions：边缘锚点钳制进容器（视口裁剪不可见修复）', () => {
  test('容器内锚点原样保留', () => {
    const bar = renderClamped({ left: 400, top: 300 })
    expect(bar.style.left).toBe('400px')
    expect(bar.style.top).toBe('300px')
  })
  test('右缘/下缘溢出收进容器（1200×800 容器、300×40 浮条、边距 8）', () => {
    const bar = renderClamped({ left: 1100, top: 780 })
    expect(bar.style.left).toBe('892px') // 1200-300-8
    expect(bar.style.top).toBe('752px') // 800-40-8
  })
})
