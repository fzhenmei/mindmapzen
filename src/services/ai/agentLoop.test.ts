// src/services/ai/agentLoop.test.ts —— 回合状态机与护栏（Task 10，spec §4）
import { expect, test, vi } from 'vitest'
import { createTurnStop, runUserTurn } from './agentLoop'
import type { AiTransport, ChatRequestPayload, StreamOutcome } from './client'
import type { ToolCallResult } from './tools'
import type { ToolCardData } from '../../store/chatStore'

/** 脚本化 transport：按脚本逐轮吐 chunk 序列；abort() 令挂起的流以 'aborted' 主动收尾
 *  （对齐 Task 8 真实 transport 契约：inFlightFinish 模式，settle 单次守卫） */
function scriptedTransport(scripts: Array<Array<string>>, abortAfterMs = 0): AiTransport & { calls: number; payloads: ChatRequestPayload[] } {
  let round = 0
  let pendingAbort: (() => void) | null = null
  const payloads: ChatRequestPayload[] = []
  return {
    calls: 0,
    payloads,
    start(payload: ChatRequestPayload, onDelta: (d: string) => void): Promise<StreamOutcome> {
      this.calls++
      payloads.push(payload)
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
  } as AiTransport & { calls: number; payloads: ChatRequestPayload[] }
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
  const on = { phase: vi.fn(), delta: vi.fn(), finalize: vi.fn(), card: vi.fn(), error: vi.fn(), notice: vi.fn(), round: vi.fn() }
  const executeTool = vi.fn(async (): Promise<ToolCallResult> => ({ ok: true, detail: 'ok' }))
  const backup = vi.fn(async () => {})
  const deps = {
    transport,
    buildMessages: (h: unknown[]) => h,
    executeTool,
    backupBeforeFirstEdit: backup,
    toolSchemas: [] as unknown[], // 单测默认空清单：body.tools 透传非本文件既有断言目标
    on,
    ...overrides,
  }
  return { deps, on, executeTool, backup }
}

const INIT = { url: 'https://x/v1/chat/completions', apiKey: 'k', model: 'm', history: [], userText: '加个节点', selection: null }

/** 优雅收尾测试台：前 20 次吐工具调用 chunk（永不收敛），第 21 次（收尾总结）行为注入——
 *  scriptedTransport 脚本按序号取，无法表达"20 轮全工具+末次收尾" */
function wrapupTransport(wrapupChunk: string, wrapupOutcome: StreamOutcome): AiTransport & { calls: number; payloads: ChatRequestPayload[] } {
  const payloads: ChatRequestPayload[] = []
  const t = {
    calls: 0,
    payloads,
    start(payload: ChatRequestPayload, onDelta: (d: string) => void): Promise<StreamOutcome> {
      t.calls++
      payloads.push(payload)
      if (t.calls <= 20) {
        onDelta(okAdd)
        return Promise.resolve({ endedWith: 'done' as const })
      }
      if (wrapupChunk) onDelta(wrapupChunk)
      return Promise.resolve(wrapupOutcome)
    },
    abort: () => {},
  }
  return t
}

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

test('轮次上限优雅收尾：20 轮不收敛→注入收尾提示，末次无工具请求，正常流式收尾', async () => {
  const t = wrapupTransport(textHi, { endedWith: 'done' })
  const { deps, on } = makeDeps(t)
  await runUserTurn(deps, createTurnStop(), INIT)
  expect(t.calls).toBe(21) // 20 轮工具 + 1 次收尾总结
  const wrapup = t.payloads[20]!
  expect(wrapup.body.tools).toBeUndefined() // 收尾不带工具：模型只能纯文本总结
  const msgs = wrapup.body.messages as Array<{ role: string; content: string }>
  const last = msgs[msgs.length - 1]!
  expect(last).toMatchObject({ role: 'user', content: expect.stringContaining('轮次已达上限') })
  expect(on.error).not.toHaveBeenCalled() // 优雅收尾 ≠ 错误
  expect(on.delta).toHaveBeenCalledWith('已添加') // 收尾总结走正常流式
  expect(on.phase).toHaveBeenLastCalledWith('idle')
})

test('轮次进度：on.round 每轮 1 基递增（收尾总结不计轮）', async () => {
  const t = wrapupTransport(textHi, { endedWith: 'done' })
  const { deps, on } = makeDeps(t)
  await runUserTurn(deps, createTurnStop(), INIT)
  expect(on.round.mock.calls.map((c) => c[0])).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
})

test('收尾请求失败：降级中性 notice（修改已保留可继续），不发错误卡', async () => {
  const t = wrapupTransport('', { endedWith: 'error', errorMessage: 'HTTP 500' })
  const { deps, on } = makeDeps(t)
  await runUserTurn(deps, createTurnStop(), INIT)
  expect(on.notice).toHaveBeenCalledOnce()
  expect(on.notice.mock.calls[0]![0]).toContain('轮次上限')
  expect(on.error).not.toHaveBeenCalled() // 收尾失败是降级场景，不是故障语义
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

test('toolSchemas 经 deps 注入透传进请求 body.tools（案头文件域只带自己的清单）', async () => {
  const bodies: ChatRequestPayload[] = []
  const t: AiTransport = {
    start(payload, onDelta) {
      bodies.push(payload)
      onDelta('{"choices":[{"delta":{"content":"好"}}]}')
      return Promise.resolve({ endedWith: 'done' })
    },
    abort: () => {},
  }
  const { deps } = makeDeps(t, {
    toolSchemas: [{ type: 'function', function: { name: 'rename_file', parameters: {} } }],
  })
  await runUserTurn(deps, createTurnStop(), INIT)
  expect(bodies.length).toBeGreaterThan(0)
  const tools = bodies[0]!.body.tools as Array<{ function: { name: string } }>
  expect(tools.map((x) => x.function.name)).toEqual(['rename_file'])
})

test('rename_file 备份先于工具执行（终审 I-3：文件域落盘发生在 executeTool 内）', async () => {
  const okRenameFile = '{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c9","function":{"name":"rename_file","arguments":"{\\"name\\":\\"a\\",\\"newName\\":\\"b\\"}"}}]}}]}'
  const t = scriptedTransport([[okRenameFile, finishToolCalls], [textHi, finishStop]])
  const { deps, on, backup, executeTool } = makeDeps(t)
  await runUserTurn(deps, createTurnStop(), INIT)
  const cards = on.card.mock.calls.map((c) => c[0] as ToolCardData)
  expect(cards.some((c) => c.kind === 'file' && c.ok)).toBe(true)
  expect(backup).toHaveBeenCalledTimes(1)
  // 调用序断言：备份必须早于工具执行——否则安全网已含本回合第一个文件操作（改前：备份在成功后）
  expect(backup.mock.invocationCallOrder[0]).toBeLessThan(executeTool.mock.invocationCallOrder[0]!)
})

test('skill 工具卡截断（终审 I-2）：detail 超 160 字符截断带省略号，非 skill 卡不受影响', async () => {
  const two = [
    '{"choices":[{"delta":{"tool_calls":[' +
      '{"index":0,"id":"c0","function":{"name":"skill_read_doc","arguments":"{}"}},' +
      '{"index":1,"id":"c1","function":{"name":"add_node","arguments":"{}"}}' +
      ']}}]}',
    finishToolCalls,
  ]
  const t = scriptedTransport([two, [textHi, finishStop]])
  const long = '档'.repeat(300)
  const executeTool = vi.fn(async (): Promise<ToolCallResult> => ({ ok: true, detail: long }))
  const { deps, on } = makeDeps(t, { executeTool })
  await runUserTurn(deps, createTurnStop(), INIT)
  const cards = on.card.mock.calls.map((c) => c[0] as ToolCardData)
  const skill = cards.find((c) => c.kind === 'skill')!
  expect(skill.text).toBe(`${'档'.repeat(160)}…`) // 160 字符 + 省略号
  expect(cards.find((c) => c.kind === 'add')!.text).toBe(long) // 非 skill 域摘要本就短，不做截断
})
