import { describe, expect, test } from 'vitest'
import { MemoryFsAdapter } from './fs/MemoryFsAdapter'
import { readSidecar, sidecarPathOf, writeSidecar } from './sidecar'
import type { Sidecar } from '../types/files'

const sc: Sidecar = {
  version: 1, theme: 'default', layout: 'mindmap',
  collapsed: ['/根/A'], offsets: {}, canvas: { x: 0, y: 0, zoom: 1 },
  linkAdjust: { '/根/A->/根/B': { cx1: 1, cy1: 2, cx2: 3, cy2: 4 } },
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

  test('linkAdjust 缺失/非对象 → {}（旧 sidecar 兼容）', async () => {
    const fs = new MemoryFsAdapter()
    await fs.writeTextFileAtomic('/ws/a.zen.json', JSON.stringify({ version: 1 }))
    expect((await readSidecar(fs, '/ws/a.md'))!.linkAdjust).toEqual({})
    await fs.writeTextFileAtomic('/ws/a.zen.json', JSON.stringify({ version: 1, linkAdjust: 'x' }))
    expect((await readSidecar(fs, '/ws/a.md'))!.linkAdjust).toEqual({})
  })

  test('linkAdjust 容错：非法条目丢弃、合法条目保留、部分数字缺失按缺省保留', async () => {
    const fs = new MemoryFsAdapter()
    await fs.writeTextFileAtomic(
      '/ws/a.zen.json',
      JSON.stringify({
        version: 1,
        linkAdjust: {
          '/A->/B': { cx1: 1, cy1: 2, cx2: 3, cy2: 4 },
          '/A->/C': { cx1: 5 }, // 仅一个数字：有效（缺省字段渲染时补 0）
          '/A->/D': 'bad', // 非对象 → 丢弃
          '/A->/E': { cx1: 'x', cy1: {} }, // 数字位全非法 → 丢弃
          '/A->/F': {}, // 无任何数字 → 丢弃
        },
      }),
    )
    expect((await readSidecar(fs, '/ws/a.md'))!.linkAdjust).toEqual({
      '/A->/B': { cx1: 1, cy1: 2, cx2: 3, cy2: 4 },
      '/A->/C': { cx1: 5 },
    })
  })
})
