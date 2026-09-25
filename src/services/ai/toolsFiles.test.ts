// src/services/ai/toolsFiles.test.ts —— 案头文件域工具（spec §1.4/§1.5）：三件套同步/
// 非法字符拒绝/自动建目录/大纲截断/人工确认门
import { beforeEach, describe, expect, test } from 'vitest'
import { MemoryFsAdapter } from '../fs/MemoryFsAdapter'
import { executeFileTool, NOT_CONFIRMED_DETAIL, type FileToolEnv } from './toolsFiles'

let fs: MemoryFsAdapter
const relocations: Array<[string, string]> = []
let treeChanges = 0
let confirmed = false

beforeEach(() => {
  fs = new MemoryFsAdapter()
  relocations.length = 0
  treeChanges = 0
  confirmed = false
})

function env(): FileToolEnv {
  return {
    adapter: fs,
    wsDir: '/ws',
    onFileRelocated: async (a, b) => { relocations.push([a, b]) },
    onTreeChanged: async () => { treeChanges += 1 },
    confirmation: { isConfirmed: () => confirmed },
  }
}

beforeEach(async () => {
  await fs.writeTextFileAtomic('/ws/会议纪要.md', '# 会议纪要\n')
  await fs.writeTextFileAtomic('/ws/会议纪要.zen.json', '{"version":1}')
  await fs.writeTextFileAtomic('/ws/会议纪要.zen.chat.json', '{"version":1,"messages":[]}')
})

describe('人工确认门（spec §1.5）', () => {
  test('未确认：三个写工具全部拒绝，文案引导先出方案', async () => {
    for (const [name, args] of [
      ['rename_file', { relDir: '', name: '会议纪要', newName: '纪要' }],
      ['move_file', { relDir: '', name: '会议纪要', toRelDir: '工作' }],
      ['create_directory', { relDir: '工作' }],
    ] as const) {
      const r = await executeFileTool(name, args, env())
      expect(r.ok).toBe(false)
      expect(r.detail).toBe(NOT_CONFIRMED_DETAIL)
    }
    expect(await fs.exists('/ws/会议纪要.md')).toBe(true)
  })

  test('已确认：写工具放行；读工具不受门禁（无需确认即可 list/outline）', async () => {
    confirmed = true
    const list = await executeFileTool('list_workspace_files', {}, env())
    expect(list.ok).toBe(true)
    const outline = await executeFileTool('get_file_outline', { relDir: '', name: '会议纪要' }, env())
    expect(outline.ok).toBe(true)
  })
})

describe('rename_file', () => {
  test('确认后改名：三件套同动 + onFileRelocated 换址回调', async () => {
    confirmed = true
    const r = await executeFileTool('rename_file', { relDir: '', name: '会议纪要', newName: '周会纪要' }, env())
    expect(r.ok).toBe(true)
    expect(await fs.exists('/ws/周会纪要.md')).toBe(true)
    expect(await fs.exists('/ws/周会纪要.zen.json')).toBe(true)
    expect(await fs.exists('/ws/周会纪要.zen.chat.json')).toBe(true)
    expect(await fs.exists('/ws/会议纪要.md')).toBe(false)
    expect(relocations).toEqual([['/ws/会议纪要.md', '/ws/周会纪要.md']])
  })

  test('新名非法字符拒绝（AI 自纠）', async () => {
    confirmed = true
    const r = await executeFileTool('rename_file', { relDir: '', name: '会议纪要', newName: 'a:b' }, env())
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('非法字符')
  })

  test('文件不存在拒绝', async () => {
    confirmed = true
    const r = await executeFileTool('rename_file', { relDir: '', name: '不存在', newName: 'x' }, env())
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('不存在')
  })
})

describe('move_file', () => {
  test('确认后移动：目标目录自动创建，三件套同动，返回实际落名', async () => {
    confirmed = true
    const r = await executeFileTool('move_file', { relDir: '', name: '会议纪要', toRelDir: '工作/周会' }, env())
    expect(r.ok).toBe(true)
    expect(await fs.exists('/ws/工作/周会/会议纪要.md')).toBe(true)
    expect(await fs.exists('/ws/工作/周会/会议纪要.zen.chat.json')).toBe(true)
    expect(relocations).toEqual([['/ws/会议纪要.md', '/ws/工作/周会/会议纪要.md']])
  })
})

describe('create_directory', () => {
  test('确认后建目录触发 onTreeChanged', async () => {
    confirmed = true
    const r = await executeFileTool('create_directory', { relDir: '归档/2026' }, env())
    expect(r.ok).toBe(true)
    expect(treeChanges).toBe(1)
  })
})

describe('get_file_outline', () => {
  test('前两层大纲：root + 一层子节点；节点超 60 截断标注', async () => {
    await fs.writeTextFileAtomic('/ws/大图.md', '# 大图\n'.concat(...Array.from({ length: 80 }, (_, i) => `\n## 子${i}\n`)))
    const r = await executeFileTool('get_file_outline', { relDir: '', name: '大图' }, env())
    expect(r.ok).toBe(true)
    expect(r.detail).toContain('子0')
    expect(r.detail).toContain('截断')
    const lineCount = r.detail.split('\n').filter((l) => l.trim() !== '').length
    expect(lineCount).toBeLessThanOrEqual(61) // 60 行大纲 + 1 行截断标注
  })

  test('文件不存在拒绝', async () => {
    const r = await executeFileTool('get_file_outline', { relDir: '', name: '无' }, env())
    expect(r.ok).toBe(false)
  })
})

describe('list_workspace_files', () => {
  test('含相对目录与修改日期；空工作区如实相告', async () => {
    const r = await executeFileTool('list_workspace_files', {}, env())
    expect(r.ok).toBe(true)
    expect(r.detail).toContain('会议纪要.md')
    const empty = new MemoryFsAdapter()
    await empty.mkdir('/ws2')
    const r2 = await executeFileTool('list_workspace_files', {}, { ...env(), adapter: empty, wsDir: '/ws2' })
    expect(r2.detail).toContain('空')
  })
})
