import { describe, expect, test } from 'vitest'
import { MemoryFsAdapter } from './fs/MemoryFsAdapter'
import { migrateOldConfig } from './migration'

// identifier 变更（com.tauri.dev → com.mindmapzen.app）后 appDataDir 随之变化，旧配置一次性迁移
const OLD = '/appdata/com.tauri.dev/config.json'
const NEW = '/appdata/com.mindmapzen.app/config.json'
const MARKER = '/appdata/com.mindmapzen.app/.migrated-from-tauri-dev'

describe('旧配置迁移（identifier com.tauri.dev → com.mindmapzen.app）', () => {
  test('旧存在且新缺失：复制内容、留档标记、旧文件保留', async () => {
    const fs = new MemoryFsAdapter()
    await fs.writeTextFileAtomic(OLD, '{"workspaceDir":"/ws"}')
    expect(await migrateOldConfig(fs, NEW, OLD)).toBe(true)
    expect(await fs.readTextFile(NEW)).toBe('{"workspaceDir":"/ws"}')
    expect(await fs.exists(MARKER)).toBe(true)
    expect(await fs.readTextFile(OLD)).toBe('{"workspaceDir":"/ws"}')
  })
  test('新配置已存在：不迁移、不写标记', async () => {
    const fs = new MemoryFsAdapter()
    await fs.writeTextFileAtomic(OLD, '{"a":1}')
    await fs.writeTextFileAtomic(NEW, '{"b":2}')
    expect(await migrateOldConfig(fs, NEW, OLD)).toBe(false)
    expect(await fs.readTextFile(NEW)).toBe('{"b":2}')
    expect(await fs.exists(MARKER)).toBe(false)
  })
  test('旧配置不存在：返回 false 且不写任何文件', async () => {
    const fs = new MemoryFsAdapter()
    expect(await migrateOldConfig(fs, NEW, OLD)).toBe(false)
    expect(await fs.exists(NEW)).toBe(false)
    expect(await fs.exists(MARKER)).toBe(false)
  })
})
