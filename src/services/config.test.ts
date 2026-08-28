import { describe, expect, test } from 'vitest'
import { MemoryFsAdapter } from './fs/MemoryFsAdapter'
import { DEFAULT_CONFIG } from '../types/files'
import { loadConfig, saveConfig } from './config'

describe('配置读写', () => {
  test('缺失时返回默认配置', async () => {
    const fs = new MemoryFsAdapter()
    expect(await loadConfig(fs, '/cfg.json')).toEqual(DEFAULT_CONFIG)
  })
  test('损坏 JSON 返回默认配置', async () => {
    const fs = new MemoryFsAdapter()
    await fs.writeTextFileAtomic('/cfg.json', '{oops')
    expect(await loadConfig(fs, '/cfg.json')).toEqual(DEFAULT_CONFIG)
  })
  test('保存后可读回', async () => {
    const fs = new MemoryFsAdapter()
    await saveConfig(fs, '/cfg.json', { workspaceDir: '/ws', lastOpened: '/ws/a.md', preferredLayout: null })
    expect(await loadConfig(fs, '/cfg.json')).toEqual({ workspaceDir: '/ws', lastOpened: '/ws/a.md', preferredLayout: null })
  })
})

describe('preferredLayout（验收轮三：记住默认布局）', () => {
  test('合法值往返', async () => {
    const fs = new MemoryFsAdapter()
    await saveConfig(fs, '/cfg.json', { workspaceDir: '/ws', lastOpened: null, preferredLayout: 'logic' })
    expect((await loadConfig(fs, '/cfg.json')).preferredLayout).toBe('logic')
  })
  test('非法值与缺失回退 null', async () => {
    const fs = new MemoryFsAdapter()
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: '/ws', lastOpened: null, preferredLayout: 'bogus' }))
    expect((await loadConfig(fs, '/cfg.json')).preferredLayout).toBeNull()
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: '/ws', lastOpened: null }))
    expect((await loadConfig(fs, '/cfg.json')).preferredLayout).toBeNull()
  })
})
