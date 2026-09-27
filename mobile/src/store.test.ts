// 配对持久化契约测试(2026-09-27 绑定丢失修复):锁定「重开恢复」链路。
// vi.resetModules 模拟页面重开——store(zustand persist)与 sync(模块级
// pairingOverride)全部重建,localStorage 是唯一跨会话载体。
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
  window.location.hash = ''
})

it('扫码 hash 配对后,重开(重建模块)配对仍恢复', async () => {
  const { autoPairFromUrl } = await import('./store')
  window.location.hash = '#tok-repro'
  expect(autoPairFromUrl()).toBe(true)
  expect(window.location.hash).toBe('') // hash 已清,重开不带令牌

  const { useMobileStore } = await import('./store') // 模拟重开
  expect(useMobileStore.getState().pairing).toEqual({ baseUrl: window.location.origin, token: 'tok-repro' })
})

it('手动配对后重开同样恢复', async () => {
  {
    const { useMobileStore } = await import('./store')
    useMobileStore.getState().setPairingManual({ baseUrl: 'http://192.168.1.9:39871', token: 't2' })
  }
  const { useMobileStore } = await import('./store')
  expect(useMobileStore.getState().pairing.token).toBe('t2')
})

it('readStored 兼容 zustand persist 格式(唯一合法落盘格式)', async () => {
  // persist 落盘形如 {"state":{"pairing":{...}},"version":0};解析必须解出内层
  localStorage.setItem(
    'mz-pairing',
    JSON.stringify({ state: { pairing: { baseUrl: 'http://b:1', token: 'tk' } }, version: 0 }),
  )
  const { readStored } = await import('./sync')
  expect(readStored()).toEqual({ baseUrl: 'http://b:1', token: 'tk' })
})

it('配对后 sync 侧令牌可取(重开场景 pairingOverride 由 rehydrate 回填)', async () => {
  const { useMobileStore } = await import('./store')
  useMobileStore.getState().setPairingManual({ baseUrl: 'http://b:1', token: 'tk9' })
  const { currentPairing } = await import('./sync')
  expect(currentPairing()).toEqual({ baseUrl: 'http://b:1', token: 'tk9' })
})

describe('parsePairingUrl(App 扫码解析,spec 2026-09-27 §6)', () => {
  it('合法配对 URL:origin 为 baseUrl,hash 为令牌', async () => {
    const { parsePairingUrl } = await import('./store')
    expect(parsePairingUrl('http://192.168.1.10:39871/#abc-def-123')).toEqual({
      baseUrl: 'http://192.168.1.10:39871',
      token: 'abc-def-123',
    })
  })
  it('空串/非 URL/缺协议头 → null', async () => {
    const { parsePairingUrl } = await import('./store')
    expect(parsePairingUrl('')).toBeNull()
    expect(parsePairingUrl('not a url')).toBeNull()
    expect(parsePairingUrl('192.168.1.10:39871/#t')).toBeNull() // 无协议头,new URL 抛错
  })
  it('缺 hash 或空令牌 → null(Review Focus 2)', async () => {
    const { parsePairingUrl } = await import('./store')
    expect(parsePairingUrl('http://192.168.1.10:39871/')).toBeNull()
    expect(parsePairingUrl('http://192.168.1.10:39871/#')).toBeNull()
  })
})
