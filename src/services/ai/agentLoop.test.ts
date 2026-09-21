// src/services/ai/agentLoop.test.ts —— 回合状态机与护栏（Task 10，spec §4）
import { expect, test, vi } from 'vitest'
import { createTurnStop, runUserTurn } from './agentLoop'
import type { AiTransport, ChatRequestPayload, StreamOutcome } from './client'
import type { ToolCallResult } from './tools'

/** 脚本化 transport：按脚本逐轮吐 chunk 序列；abort() 令挂起的流以 'aborted' 主动收尾
 *  （对齐 Task 8 真实 transport 契约：inFlightFinish 模式，settle 单次守卫） */
function scriptedTransport(scripts: Array<Array<string>>, abortAfterMs = 0): AiTransport & { calls: number } {
  let round = 0
  let pendingAbort: (() => void) | null = null
  return {
    calls: 0,
    start(_payload: ChatRequestPayload, onDelta: (d: string) => void): Promise<StreamOutcome> {
      this.calls++
      const chunks = scripts[Math.min(round, scripts.length - 1)]!
      round++
      return new Promise((resolve) => {
        let settled = false
        let i = 0
        const finish = (o: StreamOutcome): void => {
          if (settled) return
          settled = true
          clearInterval(timer)
          pendingAbort = null
          resolve(o)
        }
        const timer = setInterval(() => {
          if (i >= chunks.length) {
            finish({ endedWith: 'done' })
            return
          }
          onDelta(chunks[i]!)
          i++
        }, abortAfterMs || 1)
        pendingAbort = () => finish({ endedWith: 'aborted' })
      })
    },
    abort() {
      pendingAbort?.()
    },
  } as AiTransport & { calls: number }
}

const okAdd = '{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"add_node","arguments":"{\\"parentUid\\":\\"a\\",\\"text\\":\\"x\\"}"}}]}}]}'
const finishToolCalls = '{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}'
const textHi = '{"choices":[{"delta":{"content":"已添加"}}]}'
const finishStop = '{"choices":[{"delta":{},"finish_reason":"stop"}]}'
// 备份分组(spec §1 裁定):内容编辑(含新工具)触发回合前 git 备份;视图操作豁免
const okLayout = '{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"set_layout","arguments":"{\\"kind\\":\\"timeline\\"}"}}]}}]}'
const okTags = '{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c2","function":{"name":"set_node_tags","arguments":"{\\"uid\\":\\"a\\",\\"tags\\":[]}"}' + '}]}}]}'

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

test('streaming 中停止：就地 abort 掐断网络流，不执行工具', async () => {
  const t = scriptedTransport([[okAdd, finishToolCalls, textHi]], 5)
  const abortSpy = vi.spyOn(t, 'abort')
  const { deps, on, executeTool } = makeDeps(t)
  const stop = createTurnStop()
  const p = runUserTurn(deps, stop, INIT)
  setTimeout(() => stop.request(), 8) // 第 2 个 chunk 后请求停止
  await p // abort 令 start 以 'aborted' 主动收尾，不等流自然结束（回合有限时间返回）
  expect(abortSpy).toHaveBeenCalled()
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

test('终审 I2：stop 后到达的 error outcome 按已停止静默处理，不误报错误卡', async () => {
  // 模型停摆：start 挂起且无任何 delta，abort 传染无从触发；用户停止后 Rust 空闲
  // 超时（120s）才以 error 收尾——stop 检查须先于 error 归因，否则错误卡误报+锁悬挂
  let resolveStart: (o: StreamOutcome) => void = () => {}
  const t: AiTransport = {
    start: () =>
      new Promise<StreamOutcome>((resolve) => {
        resolveStart = resolve
      }),
    abort: () => {
      resolveStart({ endedWith: 'error', errorMessage: 'HTTP 504 gateway stall' })
    },
  }
  const { deps, on } = makeDeps(t)
  const stop = createTurnStop()
  const p = runUserTurn(deps, stop, INIT)
  stop.request() // 用户点停止；编排层 handleStop 随后调 transport.abort()（此处由 abort 显式触发）
  t.abort()
  await p
  expect(on.error).not.toHaveBeenCalled() // 旧序：error 分支先于 stop 检查 → 停止回合误报错误卡
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

test('视图工具(set_layout)成功不触发回合前备份', async () => {
  const t = scriptedTransport([[okLayout, finishToolCalls], [textHi, finishStop]])
  const { deps, backup, on } = makeDeps(t)
  await runUserTurn(deps, createTurnStop(), INIT)
  expect(on.card).toHaveBeenCalledOnce() // 卡片照发(UI 可见反馈)
  expect(backup).not.toHaveBeenCalled() // 视图操作豁免
})

test('内容工具(set_node_tags)成功触发回合前备份恰一次', async () => {
  const t = scriptedTransport([[okTags, finishToolCalls], [textHi, finishStop]])
  const { deps, backup } = makeDeps(t)
  await runUserTurn(deps, createTurnStop(), INIT)
  expect(backup).toHaveBeenCalledOnce()
})

test('排序工具(up_node)是内容编辑:触发备份', async () => {
  const okUp = '{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c5","function":{"name":"up_node","arguments":"{\\"uid\\":\\"a\\"}"}}]}}]}'
  const t = scriptedTransport([[okUp, finishToolCalls], [textHi, finishStop]])
  const { deps, backup, on } = makeDeps(t)
  await runUserTurn(deps, createTurnStop(), INIT)
  expect(on.card).toHaveBeenCalledOnce()
  expect(backup).toHaveBeenCalledOnce()
})
