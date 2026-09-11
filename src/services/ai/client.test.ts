// src/services/ai/client.test.ts —— chunk 解析/分片拼装/transport（Task 8，spec §2.2）
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { assembleAssistantToolCalls, mergeToolCallChunks, parseDeltaChunk, TauriAiTransport } from './client'

// Tauri 模块 mock：Channel 只需可挂 onmessage；invoke 按命令名回桩值（不动真网络）
vi.mock('@tauri-apps/api/core', () => {
  class Channel<T = unknown> {
    onmessage: ((msg: T) => void) | undefined
  }
  return { Channel, invoke: vi.fn() }
})

describe('parseDeltaChunk', () => {
  test('文本增量与 finish_reason', () => {
    expect(parseDeltaChunk('{"choices":[{"delta":{"content":"你好"}}]}')).toEqual({ text: '你好' })
    expect(parseDeltaChunk('{"choices":[{"delta":{},"finish_reason":"stop"}]}')?.finishReason).toBe('stop')
  })
  test('工具调用分片（id/name/arguments 分多片到达）', () => {
    const p = parseDeltaChunk('{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"add_node","arguments":"{\\"par"}}]}}]}')
    expect(p?.toolCallChunks).toEqual([{ index: 0, id: 'c1', name: 'add_node', arguments: '{"par' }])
  })
  test('非 JSON 容错返回 null', () => {
    expect(parseDeltaChunk('oops')).toBeNull()
  })
  test('JSON null/非对象载荷返回 null 不抛（Channel 异步回调里抛错会被静默吞）', () => {
    expect(parseDeltaChunk('null')).toBeNull()
    expect(parseDeltaChunk('123')).toBeNull()
    expect(parseDeltaChunk('"str"')).toBeNull()
  })
})

test('mergeToolCallChunks 跨片拼接（arguments 累加、乱序 index）', () => {
  const acc = new Map()
  mergeToolCallChunks(acc, [{ index: 0, id: 'c1', name: 'add_node', arguments: '{"par' }])
  mergeToolCallChunks(acc, [{ index: 0, arguments: 'entUid":"a3f2","text":"x"}' }])
  const assembled = assembleAssistantToolCalls(acc)
  expect(assembled).toEqual([
    { id: 'c1', type: 'function', function: { name: 'add_node', arguments: '{"parentUid":"a3f2","text":"x"}' } },
  ])
})

test('assembleAssistantToolCalls 按 index 排序', () => {
  const acc = new Map()
  mergeToolCallChunks(acc, [{ index: 1, id: 'c2', name: 'b' }])
  mergeToolCallChunks(acc, [{ index: 0, id: 'c1', name: 'a' }])
  expect(assembleAssistantToolCalls(acc).map((c) => c.id)).toEqual(['c1', 'c2'])
})

describe('TauriAiTransport', () => {
  beforeEach(() => {
    // 非 Tauri 守卫桩（'__TAURI_INTERNALS__' in window）；测后清理
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'ai_chat_start') return Promise.resolve(42)
      if (cmd === 'ai_chat_abort') return Promise.resolve(undefined)
      return Promise.reject(new Error(`unexpected command: ${cmd}`))
    })
  })
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
    vi.mocked(invoke).mockReset()
  })

  test('abort 主动收尾 start（Rust abort 后不发任何消息，Promise 不得悬挂）', async () => {
    const t = new TauriAiTransport()
    const p = t.start(
      { url: 'http://localhost/v1/chat/completions', apiKey: 'k', body: { model: 'm', messages: [], stream: true } },
      () => {},
    )
    await new Promise((r) => setTimeout(r, 0)) // 等 ai_chat_start 的 then 跑完（currentId 落定）
    t.abort()
    await expect(p).resolves.toEqual({ endedWith: 'aborted' })
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('ai_chat_abort', { id: 42 })
  })
})
