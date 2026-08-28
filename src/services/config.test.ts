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
    await saveConfig(fs, '/cfg.json', { workspaceDir: '/ws', lastOpened: '/ws/a.md' })
    expect(await loadConfig(fs, '/cfg.json')).toEqual({ workspaceDir: '/ws', lastOpened: '/ws/a.md' })
  })
})
