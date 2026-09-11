// src/services/ai/agentLoop.test.ts —— 回合状态机与护栏（Task 10，spec §4）
import { expect, test, vi } from 'vitest'
import { createTurnStop, runUserTurn } from './agentLoop'
import type { AiTransport, ChatRequestPayload, StreamOutcome } from './client'
import type { ToolCallResult } from './tools'

/** 脚本化 transport：按脚本逐轮吐 chunk 序列 */
function scriptedTransport(scripts: Array<Array<string>>, abortAfterMs = 0): AiTransport & { calls: number } {
  let round = 0
  return {
    calls: 0,
    start(_payload: ChatRequestPayload, onDelta: (d: string) => void): Promise<StreamOutcome> {
      this.calls++
      const chunks = scripts[Math.min(round, scripts.length - 1)]!
      round++
      return new Promise((resolve) => {
        let i = 0
        const timer = setInterval(() => {
          if (i >= chunks.length) {
            clearInterval(timer)
            resolve({ endedWith: 'done' })
            return
          }
          onDelta(chunks[i]!)
          i++
        }, abortAfterMs || 1)
      })
    },
    abort() {},
  } as AiTransport & { calls: number }
}

const okAdd = '{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"add_node","arguments":"{\\"parentUid\\":\\"a\\",\\"text\\":\\"x\\"}"}}]}}]}'
const finishToolCalls = '{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}'
const textHi = '{"choices":[{"delta":{"content":"已添加"}}]}'
const finishStop = '{"choices":[{"delta":{},"finish_reason":"stop"}]}'

type AgentTurnDepsLike = Parameters<typeof runUserTurn>[0]

function makeDeps(transport: AiTransport, overrides: Partial<AgentTurnDepsLike> = {}) {
  const on = { phase: vi.fn(), delta: vi.fn(), finalize: vi.fn(), card: vi.fn(), error: vi.fn() }
  const executeTool = vi.fn(async (): Promise<ToolCallResult> => ({ ok: true, detail: 'ok' }))
  const backup = vi.fn(async () => {})
  const deps = {
    transport,
    buildMessages: (h: unknown[]) => h,
    executeTool,
    backupBeforeFirstEdit: backup,
    on,
    ...overrides,
  }
  return { deps, on, executeTool, backup }
}

const INIT = { url: 'https://x/v1/chat/completions', apiKey: 'k', model: 'm', history: [], userText: '加个节点', selection: null }

test('纯文本回合：delta→finalize→idle，不执行工具', async () => {
  const t = scriptedTransport([[textHi, finishStop]])
  const { deps, on, executeTool } = makeDeps(t)
  await runUserTurn(deps, createTurnStop(), INIT)
  expect(on.delta).toHaveBeenCalledWith('已添加')
  expect(on.finalize).toHaveBeenCalledOnce()
  expect(executeTool).not.toHaveBeenCalled()
  expect(on.phase).toHaveBeenLastCalledWith('idle')
})

test('工具回合：执行→卡片→备份一次→第二轮收尾', async () => {
  const t = scriptedTransport([[okAdd, finishToolCalls], [textHi, finishStop]])
  const { deps, on, backup, executeTool } = makeDeps(t)
  await runUserTurn(deps, createTurnStop(), INIT)
  expect(executeTool).toHaveBeenCalledWith('add_node', { parentUid: 'a', text: 'x' })
  expect(on.card).toHaveBeenCalledOnce()
  expect(backup).toHaveBeenCalledOnce()
  expect(on.delta).toHaveBeenCalledWith('已添加')
  expect(t.calls).toBe(2)
})

test('12 轮护栏：工具回合不收敛即终止并报错', async () => {
  const t = scriptedTransport([[okAdd, finishToolCalls]])
  const { deps, on } = makeDeps(t)
  await runUserTurn(deps, createTurnStop(), INIT)
  expect(t.calls).toBe(12)
  expect(on.error).toHaveBeenCalledOnce()
})

test('连续 3 次工具失败终止', async () => {
  const three = [
    '{"choices":[{"delta":{"tool_calls":[' +
      [0, 1, 2].map((i) => `{"index":${i},"id":"c${i}","function":{"name":"add_node","arguments":"{}"}}`).join(',') +
      ']}}]}',
    finishToolCalls,
  ]
  const t = scriptedTransport([three])
  const { deps, on } = makeDeps(t, { executeTool: vi.fn(async () => ({ ok: false, detail: '节点不存在' })) })
  await runUserTurn(deps, createTurnStop(), INIT)
  expect(on.error).toHaveBeenCalledOnce()
  expect(t.calls).toBe(1) // 单轮内即终止，不发起下一轮
})

test('streaming 中停止：中止传输不再执行工具', async () => {
  const t = scriptedTransport([[okAdd, finishToolCalls, textHi]], 5)
  const { deps, on, executeTool } = makeDeps(t)
  const stop = createTurnStop()
  const p = runUserTurn(deps, stop, INIT)
  setTimeout(() => stop.request(), 8) // 第 2 个 chunk 后请求停止
  await p
  expect(executeTool).not.toHaveBeenCalled()
  expect(on.error).not.toHaveBeenCalled()
})

test('executing 中停止：当前工具做完即停，后续工具不再执行', async () => {
  const two = [
    '{"choices":[{"delta":{"tool_calls":[' +
      [0, 1].map((i) => `{"index":${i},"id":"c${i}","function":{"name":"add_node","arguments":"{}"}}`).join(',') +
      ']}}]}',
    finishToolCalls,
  ]
  const t = scriptedTransport([two])
  const stop = createTurnStop()
  const executeTool = vi.fn(async (): Promise<ToolCallResult> => {
    stop.request() // 第一个工具执行中用户请求停止
    return { ok: true, detail: 'ok' }
  })
  const { deps, on } = makeDeps(t, { executeTool })
  await runUserTurn(deps, stop, INIT)
  expect(executeTool).toHaveBeenCalledOnce()
  expect(on.error).not.toHaveBeenCalled()
})

test('网络错误：error 卡片收尾', async () => {
  const t: AiTransport = {
    start: async (): Promise<StreamOutcome> => ({ endedWith: 'error', errorMessage: 'HTTP 401' }),
    abort: () => {},
  }
  const { deps, on } = makeDeps(t)
  await runUserTurn(deps, createTurnStop(), INIT)
  expect(on.error).toHaveBeenCalledOnce()
  expect(on.error).toHaveBeenCalledWith('AI 请求失败：HTTP 401') // Ruling 1：非特判码走 network 文案
})

test('非 Tauri 环境错误码 AI_TRANSPORT_UNAVAILABLE：专用文案（Ruling 1）', async () => {
  const t: AiTransport = {
    start: async (): Promise<StreamOutcome> => ({ endedWith: 'error', errorMessage: 'AI_TRANSPORT_UNAVAILABLE' }),
    abort: () => {},
  }
  const { deps, on } = makeDeps(t)
  await runUserTurn(deps, createTurnStop(), INIT)
  expect(on.error).toHaveBeenCalledWith('当前环境不支持 AI 网络调用（需在桌面应用内使用）')
})
