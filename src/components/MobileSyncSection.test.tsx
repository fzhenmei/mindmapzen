// 手机同步设置分区（spec 2026-09-26 mobile-capture §5.1）：信息加载后渲染开关/二维码/IP 下拉；
// invoke 按命令名回桩（mock 路径与组件 import 完全一致）
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MobileSyncSection from './MobileSyncSection'

const infoMock = vi.fn()
const setMock = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({ invoke: (cmd: string, args?: unknown) => {
  if (cmd === 'get_mobile_sync_info') return infoMock()
  if (cmd === 'set_mobile_sync_config') return setMock(args)
  throw new Error(`unexpected ${cmd}`)
} }))

describe('MobileSyncSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // enabled=true：二维码/IP 下拉都在 info.enabled 分支内，断言对象仅在开启态渲染
    infoMock.mockResolvedValue({ enabled: true, port: 39871, token: 'tok123', ips: ['192.168.1.10', '172.17.0.1'], current: '192.168.1.10' })
  })

  it('渲染分区:开关/二维码/IP 下拉', async () => {
    render(<MobileSyncSection />)
    // 分区根 testid 已随标题行上移到设置窗手风琴 trigger,组件内锚点改开关
    expect(await screen.findByTestId('mobile-sync-toggle')).toBeInTheDocument()
    // 二维码由 toString 异步生成后 setState,同样走 findBy 等待提交(分区出现 ≠ svg 已挂)
    expect((await screen.findByTestId('mobile-sync-qr')).querySelector('svg')).not.toBeNull()
    // 二维码内容含选中 IP + 端口 + 令牌
    expect(screen.getByTestId('mobile-sync-pairing-url').textContent).toContain('http://192.168.1.10:39871/#tok123')
    expect(screen.getByTestId('mobile-sync-ip-select').querySelectorAll('option').length).toBe(2)
  })
})
