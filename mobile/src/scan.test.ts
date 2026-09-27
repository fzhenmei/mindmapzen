// scanAndPair 契约测试(spec 2026-09-27 §6):扫码 → 解析 → 存配对 → 触发同步。
// 依赖全注入(扫码/存配对/同步/提示),不 mock 模块只 mock 行为——逻辑纯度即测点
import { describe, expect, it, vi } from 'vitest'
import { scanAndPair, type ScanDeps } from './scan'

function makeDeps(overrides: Partial<ScanDeps> = {}): ScanDeps & { spies: Record<string, ReturnType<typeof vi.fn>> } {
  const spies = {
    scan: vi.fn(),
    setPairing: vi.fn(),
    onPaired: vi.fn(),
    toast: vi.fn(),
  }
  return {
    scan: overrides.scan ?? spies.scan,
    setPairing: overrides.setPairing ?? spies.setPairing,
    onPaired: overrides.onPaired ?? spies.onPaired,
    toast: overrides.toast ?? spies.toast,
    spies,
  }
}

describe('scanAndPair', () => {
  it('合法二维码:存配对 + 触发同步', async () => {
    const d = makeDeps({ scan: vi.fn().mockResolvedValue('http://192.168.1.10:39871/#tok-1') })
    expect(await scanAndPair(d)).toBe(true)
    expect(d.spies.setPairing).toHaveBeenCalledWith({ baseUrl: 'http://192.168.1.10:39871', token: 'tok-1' })
    expect(d.spies.onPaired).toHaveBeenCalled()
    expect(d.spies.toast).not.toHaveBeenCalled()
  })

  it('非配对二维码:toast 且不动配对(Review Focus 1)', async () => {
    const d = makeDeps({ scan: vi.fn().mockResolvedValue('https://example.com/名片') })
    expect(await scanAndPair(d)).toBe(false)
    expect(d.spies.setPairing).not.toHaveBeenCalled()
    expect(d.spies.toast).toHaveBeenCalledWith('scanFailed')
  })

  it('IP 变化重扫:新配对覆盖(Review Focus 3)', async () => {
    const d = makeDeps({ scan: vi.fn().mockResolvedValue('http://192.168.1.99:39871/#tok-2') })
    await scanAndPair(d)
    expect(d.spies.setPairing).toHaveBeenCalledWith({ baseUrl: 'http://192.168.1.99:39871', token: 'tok-2' })
  })

  it('扫码被取消/权限拒绝:toast + 显式出口,不静默(Review Focus 5)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const d = makeDeps({ scan: vi.fn().mockRejectedValue(new Error('cancel')) })
    expect(await scanAndPair(d)).toBe(false)
    expect(d.spies.toast).toHaveBeenCalledWith('scanFailed')
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
