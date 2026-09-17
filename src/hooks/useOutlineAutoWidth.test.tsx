// src/hooks/useOutlineAutoWidth.test.tsx
import { useRef } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { useOutlineAutoWidth } from './useOutlineAutoWidth'

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
})

function Harness() {
  const ref = useRef<HTMLDivElement>(null)
  const wide = useOutlineAutoWidth(ref)
  return <div ref={ref} data-testid="probe" data-wide={wide ? '1' : '0'} />
}

describe('useOutlineAutoWidth', () => {
  test('宽 ≥900 判 wide；<900 判窄', () => {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 950 })
    const r1 = render(<Harness />)
    expect(r1.getByTestId('probe').dataset.wide).toBe('1')
    r1.unmount()
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 400 })
    const r2 = render(<Harness />)
    expect(r2.getByTestId('probe').dataset.wide).toBe('0')
  })
})
