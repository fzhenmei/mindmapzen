// src/hooks/useSavePipeline.test.ts —— 保存管线冲突检测（多实例/外部编辑器覆盖防护）：
// 打开时记磁盘原文基线（initBaseline），写盘前重读对比——不一致即外部变更，
// 经 onExternalConflict 三态（overwrite/reload/cancel）裁决；成功落盘后基线刷新为写入内容
import { afterEach, describe, expect, test } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useSavePipeline } from './useSavePipeline'
import { engineTreeToZen, serialize } from '../services/mdTree'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'
import type { LinkRegistry } from '../editor/linkRegistry'
import type { MindMapHandle } from '../types/engine'
import type { EngineNode } from '../types/engine'
import type { LayoutKind } from '../types/files'

const MD = '/ws/a.md'
const V0 = '# 根\n'
const V_EXTERNAL = '# 外部改的版本\n'

const tree = (): EngineNode => ({ data: { text: '根', uid: 'r' }, children: [] })
// 引擎快照可变（外部改文本模拟编辑）：每次 getData 取现值
let engineData: EngineNode = tree()
const mmRef = { current: { getData: () => engineData } as unknown as MindMapHandle }

interface Harness {
  pipeline: ReturnType<typeof useSavePipeline>
  fs: MemoryFsAdapter
  dirtyRef: { current: boolean }
  conflictCalls: number
  setAnswer(a: 'overwrite' | 'reload' | 'cancel'): void
  dirtyEvents: boolean[]
}

const mount = (): Harness => {
  const fs = new MemoryFsAdapter()
  const dirtyRef = { current: false }
  const dirtyEvents: boolean[] = []
  let answer: 'overwrite' | 'reload' | 'cancel' = 'cancel'
  let conflictCalls = 0
  const registry: LinkRegistry = { byUid: new Map() }
  const layoutRef = { current: 'mindmap' as LayoutKind }
  const { result } = renderHook(() =>
    useSavePipeline({
      adapter: fs,
      mdPath: MD,
      mmRef,
      layoutRef,
      dirtyRef,
      registry,
      onDirtyChange: (d) => dirtyEvents.push(d),
      onError: () => {},
      onExternalConflict: () => {
        conflictCalls += 1
        return Promise.resolve(answer)
      },
    }),
  )
  return {
    pipeline: result.current,
    fs,
    dirtyRef,
    dirtyEvents,
    get conflictCalls() {
      return conflictCalls
    },
    setAnswer: (a) => {
      answer = a
    },
  }
}

/** 期望落盘内容：内存树经序列化（管线写盘口径同构） */
const expectedMd = (): string => serialize(engineTreeToZen(engineData).tree)

afterEach(() => {
  cleanup()
  engineData = tree()
})

describe('useSavePipeline 冲突检测', () => {
  test('外部变更后保存：弹冲突、不写盘、保脏', async () => {
    const h = mount()
    await h.fs.writeTextFileAtomic(MD, V0)
    act(() => h.pipeline.initBaseline(V0))
    // 外部修改（另一实例/编辑器落盘）
    await h.fs.writeTextFileAtomic(MD, V_EXTERNAL)
    h.dirtyRef.current = true
    let ok = true
    await act(async () => {
      ok = await h.pipeline.saveNow()
    })
    expect(h.conflictCalls).toBe(1)
    expect(ok).toBe(false)
    expect(await h.fs.readTextFile(MD)).toBe(V_EXTERNAL)
    expect(h.dirtyRef.current).toBe(true)
  })

  test('冲突选 overwrite：以内存为准写盘，基线刷新', async () => {
    const h = mount()
    h.setAnswer('overwrite')
    await h.fs.writeTextFileAtomic(MD, V0)
    act(() => h.pipeline.initBaseline(V0))
    await h.fs.writeTextFileAtomic(MD, V_EXTERNAL)
    h.dirtyRef.current = true
    let ok = false
    await act(async () => {
      ok = await h.pipeline.saveNow()
    })
    expect(ok).toBe(true)
    expect(await h.fs.readTextFile(MD)).toBe(expectedMd())
    expect(h.dirtyRef.current).toBe(false)
    // 基线已刷新：再编辑再保存（磁盘未被外部动过）不弹冲突
    engineData = { data: { text: '改', uid: 'r' }, children: [] }
    h.dirtyRef.current = true
    await act(async () => {
      ok = await h.pipeline.saveNow()
    })
    expect(h.conflictCalls).toBe(1)
    expect(ok).toBe(true)
    expect(await h.fs.readTextFile(MD)).toBe(expectedMd())
  })

  test('冲突选 cancel：不写盘、返回失败、脏保留', async () => {
    const h = mount()
    await h.fs.writeTextFileAtomic(MD, V0)
    act(() => h.pipeline.initBaseline(V0))
    await h.fs.writeTextFileAtomic(MD, V_EXTERNAL)
    h.dirtyRef.current = true
    let ok = true
    await act(async () => {
      ok = await h.pipeline.saveNow()
    })
    expect(ok).toBe(false)
    expect(await h.fs.readTextFile(MD)).toBe(V_EXTERNAL)
    expect(h.dirtyRef.current).toBe(true)
  })

  test('冲突选 reload：不写盘、返回失败（重载导航由上层执行）', async () => {
    const h = mount()
    h.setAnswer('reload')
    await h.fs.writeTextFileAtomic(MD, V0)
    act(() => h.pipeline.initBaseline(V0))
    await h.fs.writeTextFileAtomic(MD, V_EXTERNAL)
    h.dirtyRef.current = true
    let ok = true
    await act(async () => {
      ok = await h.pipeline.saveNow()
    })
    expect(ok).toBe(false)
    expect(await h.fs.readTextFile(MD)).toBe(V_EXTERNAL)
  })

  test('无外部变更：保存不弹冲突', async () => {
    const h = mount()
    await h.fs.writeTextFileAtomic(MD, V0)
    act(() => h.pipeline.initBaseline(V0))
    h.dirtyRef.current = true
    let ok = false
    await act(async () => {
      ok = await h.pipeline.saveNow()
    })
    expect(h.conflictCalls).toBe(0)
    expect(ok).toBe(true)
    expect(await h.fs.readTextFile(MD)).toBe(expectedMd())
  })

  test('保存后外部再变更：再次保存重新弹冲突（基线随成功落盘刷新）', async () => {
    const h = mount()
    await h.fs.writeTextFileAtomic(MD, V0)
    act(() => h.pipeline.initBaseline(V0))
    h.dirtyRef.current = true
    await act(async () => {
      await h.pipeline.saveNow()
    })
    expect(h.conflictCalls).toBe(0)
    // 第一轮保存后外部又改了盘 → 第二轮保存应弹
    await h.fs.writeTextFileAtomic(MD, V_EXTERNAL)
    engineData = { data: { text: '二改', uid: 'r' }, children: [] }
    h.dirtyRef.current = true
    await act(async () => {
      await h.pipeline.saveNow()
    })
    expect(h.conflictCalls).toBe(1)
  })

  test('文件被外部删除：不弹冲突直接写回', async () => {
    const h = mount()
    await h.fs.writeTextFileAtomic(MD, V0)
    act(() => h.pipeline.initBaseline(V0))
    await h.fs.remove(MD)
    h.dirtyRef.current = true
    let ok = false
    await act(async () => {
      ok = await h.pipeline.saveNow()
    })
    expect(h.conflictCalls).toBe(0)
    expect(ok).toBe(true)
    expect(await h.fs.readTextFile(MD)).toBe(expectedMd())
  })
})
