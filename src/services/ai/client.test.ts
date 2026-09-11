// src/services/ai/client.test.ts —— chunk 解析/分片拼装/transport（Task 8，spec §2.2）
import { describe, expect, test } from 'vitest'
import { assembleAssistantToolCalls, mergeToolCallChunks, parseDeltaChunk } from './client'

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
