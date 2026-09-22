// useExpandLevel（一键收起到 N 级的受控值源）：engineReady 后从 renderTree 初始读取
// expandLevelOf，之后双通道跟随——afterExecCommand（展开四命令即时 + BACK/FORWARD 撤销
// 重做恢复整树快照）与 data_change（节流尾随兜底，无载荷丢弃同 MindMapCanvas 口径）。
// 引擎不进单测（MindMapCanvas 约定）：fake mm 手写 on/off 事件表 + 可变 renderTree。
import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import type { MindMapHandle } from '../types/engine'
import { useExpandLevel } from './useExpandLevel'

/** fake 引擎：listeners 事件表 + renderTree 活引用（expandLevelOf 的输入面） */
function fakeMm() {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const mm = {
    on: vi.fn((ev: string, cb: (...args: unknown[]) => void) => {
      listeners.set(ev, [...(listeners.get(ev) ?? []), cb])
    }),
    off: vi.fn((ev: string, cb: (...args: unknown[]) => void) => {
      listeners.set(ev, (listeners.get(ev) ?? []).filter((f) => f !== cb))
    }),
    renderer: { renderTree: null as unknown },
  } as unknown as MindMapHandle
  const emit = (ev: string, ...args: unknown[]): void => {
    for (const cb of [...(listeners.get(ev) ?? [])]) cb(...args)
  }
  /** 换树（四层 r>a>b>c，c 叶不参与判定：全展开 / level=2 形态两个夹具） */
  const setTree = (level2: boolean): void => {
    mm.renderer!.renderTree = {
      data: { text: 'r', uid: 'r' },
      children: [
        {
          data: { text: 'a', uid: 'a', expand: true },
          children: [{ data: { text: 'b', uid: 'b', expand: !level2 }, children: [{ data: { text: 'c', uid: 'c' }, children: [] }] }],
        },
      ],
    }
  }
  return { mm, emit, setTree }
}

/** 渲染探针组件：把 hook 返回值落到外部变量 */
function probe(mm: MindMapHandle | null, ready: boolean): { current: number | 'all' | undefined } {
  const out = { current: undefined as number | 'all' | undefined }
  function Probe(): null {
    const mmRef = useRef<MindMapHandle | null>(mm)
    out.current = useExpandLevel(mmRef, ready)
    return null
  }
  render(<Probe />)
  return out
}

afterEach(cleanup)

describe('useExpandLevel（展开层级受控值源）', () => {
  test('engineReady 后初始读取；未就绪返回 undefined', () => {
    const { mm, setTree } = fakeMm()
    setTree(false)
    const before = probe(mm, false)
    expect(before.current).toBeUndefined()
    cleanup()
    const after = probe(mm, true)
    expect(after.current).toBe('all')
  })

  test('afterExecCommand 展开命令即时重读：树变 level=2 形态后读到 2', () => {
    const { mm, emit, setTree } = fakeMm()
    setTree(false)
    const out = probe(mm, true)
    expect(out.current).toBe('all')
    act(() => {
      setTree(true)
      emit('afterExecCommand', 'UNEXPAND_TO_LEVEL', 2)
    })
    expect(out.current).toBe(2)
  })

  test('BACK/FORWARD 触发重读（撤销重做恢复整树快照改展开态）；白名单外命令不读', () => {
    const { mm, emit, setTree } = fakeMm()
    setTree(false)
    const out = probe(mm, true)
    act(() => {
      setTree(true)
      emit('afterExecCommand', 'BACK')
    })
    expect(out.current).toBe(2)
    act(() => {
      setTree(false)
      emit('afterExecCommand', 'SET_NODE_DATA')
    })
    // 白名单外（SET_NODE_DATA）：树已还原但未重读，值保持旧读数 2
    expect(out.current).toBe(2)
  })

  test('data_change 带载荷触发重读；无载荷丢弃（backForward 空栈同值噪声）', () => {
    const { mm, emit, setTree } = fakeMm()
    setTree(false)
    const out = probe(mm, true)
    act(() => {
      setTree(true)
      emit('data_change', undefined)
    })
    expect(out.current).toBe('all')
    act(() => {
      emit('data_change', { data: { text: 'r' }, children: [] })
    })
    expect(out.current).toBe(2)
  })

  test('卸载退订（off 收到对应回调）', () => {
    const { mm } = fakeMm()
    probe(mm, true)
    cleanup()
    expect(mm.off).toHaveBeenCalled()
  })
})
