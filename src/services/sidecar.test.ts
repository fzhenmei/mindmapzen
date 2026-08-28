import { describe, expect, test } from 'vitest'
import { MemoryFsAdapter } from './fs/MemoryFsAdapter'
import { readSidecar, sidecarPathOf, writeSidecar } from './sidecar'
import type { Sidecar } from '../types/files'

const sc: Sidecar = {
  version: 1, theme: 'default', layout: 'mindmap',
  collapsed: ['/根/A'], offsets: {}, canvas: { x: 0, y: 0, zoom: 1 },
}

describe('sidecar', () => {
  test('路径映射', () => {
    expect(sidecarPathOf('/ws/a.md')).toBe('/ws/a.zen.json')
  })
  test('缺失返回 null', async () => {
    expect(await readSidecar(new MemoryFsAdapter(), '/ws/a.md')).toBeNull()
  })
  test('损坏 JSON 返回 null 不抛异常', async () => {
    const fs = new MemoryFsAdapter()
    await fs.writeTextFileAtomic('/ws/a.zen.json', 'not json')
    expect(await readSidecar(fs, '/ws/a.md')).toBeNull()
  })
  test('写入后读回', async () => {
    const fs = new MemoryFsAdapter()
    await writeSidecar(fs, '/ws/a.md', sc)
    expect(await readSidecar(fs, '/ws/a.md')).toEqual(sc)
  })
})
