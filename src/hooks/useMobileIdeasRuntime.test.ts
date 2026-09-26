import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../store/appStore'
import { handleMobileIdeas } from './useMobileIdeasRuntime'

// handleMobileIdeas:整批事件 → 循环 captureIdea → 按成功数 toast(spec §5.4 批量聚合)
describe('handleMobileIdeas', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('逐条写入并按成功数提示', async () => {
    const captureIdea = vi.fn(async () => ({ ok: true }) as const)
    useAppStore.setState({ captureIdea })
    const n = await handleMobileIdeas([
      { id: 'u1', text: '点子甲', body: '补充', capturedAt: 1 },
      { id: 'u2', text: '点子乙', body: '', capturedAt: 2 },
    ])
    expect(n).toBe(2)
    expect(captureIdea).toHaveBeenCalledTimes(2)
    expect(captureIdea).toHaveBeenCalledWith({ text: '点子甲', body: '补充' })
    expect(captureIdea).toHaveBeenCalledWith({ text: '点子乙', body: undefined })
  })

  it('失败条目计入失败不弹成功提示', async () => {
    const captureIdea = vi.fn(async () => ({ ok: false, error: 'x' }) as const)
    useAppStore.setState({ captureIdea })
    const n = await handleMobileIdeas([{ id: 'u1', text: 'a', body: '', capturedAt: 1 }])
    expect(n).toBe(0)
  })
})
