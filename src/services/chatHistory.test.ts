// src/services/chatHistory.test.ts —— 对话历史持久化服务（2026-09 持久化）
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MemoryFsAdapter } from './fs/MemoryFsAdapter'
import {
  HISTORY_CHAR_BUDGET,
  appendTurn,
  chatHistoryPathOf,
  parseChatMessages,
  readChatHistory,
  windowedHistory,
} from './chatHistory'
import { useChatStore, type ChatMessage } from '../store/chatStore'

let fs: MemoryFsAdapter
beforeEach(() => {
  fs = new MemoryFsAdapter()
  useChatStore.getState().reset()
})

describe('chatHistoryPathOf', () => {
  test('.md 同干替换为 .zen.chat.json', () => {
    expect(chatHistoryPathOf('/ws/图.md')).toBe('/ws/图.zen.chat.json')
  })
})

describe('parseChatMessages 宽容解析', () => {
  test('非数组 → []；逐条校验 role 与 text，失型条目丢弃', () => {
    expect(parseChatMessages(undefined)).toEqual([])
    expect(parseChatMessages('x')).toEqual([])
    expect(
      parseChatMessages([
        { role: 'user', text: '你好' },
        { role: 'assistant' }, // 缺 text
        { role: 'error', text: '连接失败' }, // role 不入档
        { text: '裸文本' }, // 缺 role
        '垃圾条目',
        { role: 'assistant', text: '好的', cards: [{ kind: 'add', ok: true, text: '新节点' }] },
        { role: 'assistant', text: '卡片失型', cards: [{ kind: 'add', ok: 'yes', text: 'x' }] }, // cards 全非法 → 无 cards 键
      ]),
    ).toEqual([
      { role: 'user', text: '你好' },
      { role: 'assistant', text: '好的', cards: [{ kind: 'add', ok: true, text: '新节点' }] },
      { role: 'assistant', text: '卡片失型' },
    ])
  })
})

describe('readChatHistory', () => {
  test('文件不存在 → []（这张图还没聊过）', async () => {
    await expect(readChatHistory(fs, '/ws/a.md')).resolves.toEqual([])
  })

  test('读回合法流水', async () => {
    await fs.writeTextFileAtomic(
      '/ws/a.zen.chat.json',
      JSON.stringify({ version: 1, messages: [{ role: 'user', text: '问' }, { role: 'assistant', text: '答' }] }),
    )
    await expect(readChatHistory(fs, '/ws/a.md')).resolves.toEqual([
      { role: 'user', text: '问' },
      { role: 'assistant', text: '答' },
    ])
  })

  test('坏 JSON → warn + []（侧功能降级不抛）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await fs.writeTextFileAtomic('/ws/a.zen.chat.json', '{oops')
    await expect(readChatHistory(fs, '/ws/a.md')).resolves.toEqual([])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('appendTurn', () => {
  /** 造一条内存态消息（id/rendered 等 UI 字段齐全，验证存储投影会剥掉） */
  function msg(role: 'user' | 'assistant', text: string, cards?: ChatMessage['cards']): ChatMessage {
    return { id: 'm1', role, text, rendered: true, cards }
  }

  test('空回合（全空文本/error/notice）不写盘', async () => {
    await appendTurn(fs, '/ws/a.md', [
      msg('assistant', ''),
      { id: 'm2', role: 'error', text: '失败' },
      { id: 'm3', role: 'notice', text: '提示' },
    ])
    expect(await fs.exists('/ws/a.zen.chat.json')).toBe(false)
  })

  test('追加到既有流水：存储投影剥 UI 瞬态字段（id/rendered），空 cards 不落键', async () => {
    await fs.writeTextFileAtomic(
      '/ws/a.zen.chat.json',
      JSON.stringify({ version: 1, messages: [{ role: 'user', text: '旧问' }] }),
    )
    await appendTurn(fs, '/ws/a.md', [
      msg('user', '新问'),
      msg('assistant', '新答', [{ kind: 'add', ok: true, text: '节点' }]),
      msg('assistant', ''), // 空文本无卡片：半截占位，不入档
      msg('assistant', '', [{ kind: 'remove', ok: true, text: '误建节点' }]), // 零文本有卡片：保留（已发生的编辑）
    ])
    const file = JSON.parse(await fs.readTextFile('/ws/a.zen.chat.json')) as { version: number; messages: unknown[] }
    expect(file.version).toBe(1)
    expect(file.messages).toEqual([
      { role: 'user', text: '旧问' },
      { role: 'user', text: '新问' },
      { role: 'assistant', text: '新答', cards: [{ kind: 'add', ok: true, text: '节点' }] },
      { role: 'assistant', text: '', cards: [{ kind: 'remove', ok: true, text: '误建节点' }] },
    ])
  })
})

describe('windowedHistory 回传窗口', () => {
  /** 造 user/assistant 定稿对 */
  function turn(q: string, a: string): ChatMessage[] {
    return [
      { id: 'u', role: 'user', text: q },
      { id: 'a', role: 'assistant', text: a, rendered: true },
    ]
  }

  test('预算内全量回传；error/notice/未定稿/空文本不入窗', () => {
    const msgs = [
      ...turn('问1', '答1'),
      { id: 'e', role: 'error', text: '错' } as ChatMessage,
      { id: 'n', role: 'notice', text: '示' } as ChatMessage,
      { id: 's', role: 'assistant', text: '流式中' } as ChatMessage, // rendered 未置
      ...turn('问2', '答2'),
    ]
    expect(windowedHistory(msgs)).toEqual([
      { role: 'user', content: '问1' },
      { role: 'assistant', content: '答1' },
      { role: 'user', content: '问2' },
      { role: 'assistant', content: '答2' },
    ])
  })

  test('超预算只保尾部窗口；截断后窗口首条为 assistant 则丢弃（从 user 起）', () => {
    const msgs: ChatMessage[] = []
    // 每条恰好 4000 字符：5 轮 10 条共 4 万，尾部 6 条（问2..答4）= 24000 恰在预算内
    for (let i = 0; i < 5; i++) {
      msgs.push(...turn(('问' + i).padEnd(4000, ' '), ('答' + i).padEnd(4000, ' ')))
    }
    const out = windowedHistory(msgs)
    // 尾部窗口 = 预算内最后 6 条（问2/答2/问3/答3/问4/答4 = 24000），首条是 user（问2）
    expect(out[0]).toMatchObject({ role: 'user' })
    const used = out.reduce((n, m) => n + m.content.length, 0)
    expect(used).toBeLessThanOrEqual(HISTORY_CHAR_BUDGET)
    expect(out.map((m) => m.content.slice(0, 2))).toEqual(['问2', '答2', '问3', '答3', '问4', '答4'])
  })

  test('单条超预算也保留（用户当下输入就是想接着聊，不能送空上下文）', () => {
    const msgs: ChatMessage[] = [{ id: 'u', role: 'user', text: '巨长'.repeat(HISTORY_CHAR_BUDGET) }]
    const out = windowedHistory(msgs)
    expect(out).toHaveLength(1)
  })

  test('空消息表 → 空窗', () => {
    expect(windowedHistory([])).toEqual([])
  })
})
