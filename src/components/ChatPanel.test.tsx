// src/components/ChatPanel.test.tsx —— 面板渲染与编排接线（Task 11，spec §7）
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import ChatPanel from './ChatPanel'
import { useChatStore, type ChatMessage } from '../store/chatStore'
import { useAppStore } from '../store/appStore'
import { subscribeToast } from '../services/toast'
import type { WriteClipboard } from '../services/clipboard'

// jsdom 不执行 vditor 注入的子资源脚本（渲染 promise 永不 resolve），真实渲染归 e2e；
// 单测 mock MarkdownPreview 为透传 div——定稿消息走 md 渲染分支由 data-testid 断言
vi.mock('./MarkdownPreview', () => ({
  default: ({ text }: { text: string }) => <div data-testid="md-preview">{text}</div>,
}))

const fakeMm = { execCommand: vi.fn(), renderer: { findNodeByUid: () => null, renderTree: null } }

function mount(mm: unknown = fakeMm, writeClipboard: WriteClipboard = vi.fn(async () => {}), persistTurn: (m: ChatMessage[]) => Promise<void> = vi.fn(async () => {})) {
  return render(
    <ChatPanel
      mmRef={{ current: mm as never }}
      selection={null}
      aiEnv={null}
      width={320}
      writeClipboard={writeClipboard}
      onResize={() => {}}
      onCommit={() => {}}
      onReset={() => {}}
      onClose={() => {}}
      persistTurn={persistTurn}
    />,
  )
}

beforeEach(() => {
  useChatStore.getState().reset()
  useAppStore.setState({
    aiConfig: { baseUrl: 'https://a/v1', apiKey: 'k', model: 'm' },
    backupNow: vi.fn(async () => {}),
    // v1.1 ② 安全网告知：git 备份默认关（真实默认），告知标记每用例重置防跨用例残留
    gitConfig: { enabled: false, remoteUrl: null, token: null },
    aiBackupNoticeShown: false,
    // 输入框高度跨用例隔离（拖高用例会写入）
    aiChatInputHeight: null,
  } as never)
  // fake transport：纯文本回答（走 window 注入点，验证 Task 8 的 getTransport 工厂）
  ;(window as never as { __AI_TRANSPORT_FACTORY__: unknown }).__AI_TRANSPORT_FACTORY__ = () => ({
    start: async (_p: unknown, onDelta: (d: string) => void) => {
      onDelta('{"choices":[{"delta":{"content":"收到"}}]}')
      return { endedWith: 'done' as const }
    },
    abort: () => {},
  })
})

test('空态：显示引导', () => {
  mount()
  expect(screen.getByTestId('ai-panel')).toBeInTheDocument()
  expect(screen.getByText(/和 AI 一起写导图/)).toBeInTheDocument()
})

test('未配置时发送：错误卡片引导去设置', async () => {
  useAppStore.setState({ aiConfig: { baseUrl: '', apiKey: '', model: '' } } as never)
  mount()
  await userEvent.type(screen.getByTestId('ai-input'), 'hi')
  await userEvent.click(screen.getByTestId('ai-send'))
  expect(screen.getByText(/AI 未配置/)).toBeInTheDocument()
})

test('发送→流式→定稿切 md 渲染', async () => {
  mount()
  await userEvent.type(screen.getByTestId('ai-input'), '你好')
  await userEvent.click(screen.getByTestId('ai-send'))
  expect(await screen.findByText(/收到/)).toBeInTheDocument()
  expect(useChatStore.getState().phase).toBe('idle')
  // 定稿后 rendered=true：消息经 MarkdownPreview（mock 透传）渲染，流式光标分支退场
  expect(screen.getByTestId('md-preview')).toHaveTextContent('收到')
  expect(screen.queryByTestId('ai-msg-streaming')).not.toBeInTheDocument()
})

test('卡片渲染：失败红字；成功 ✓ 图标绿、正文保持 muted（spec §7 Ruling 5）', () => {
  useChatStore.getState().pushUser('x') // 产生 [user, assistant 占位] 两条——卡片挂在 assistant（idx 1）
  useChatStore.getState().pushCard({ kind: 'remove', ok: false, text: '节点不存在：[zz]' })
  useChatStore.getState().pushCard({ kind: 'add', ok: true, text: '新想法' })
  mount()
  expect(screen.getByTestId('ai-card-1-0')).toHaveTextContent('失败')
  expect(screen.getByTestId('ai-card-1-0')).toHaveClass('text-destructive')
  const okCard = screen.getByTestId('ai-card-1-1')
  expect(okCard).toHaveTextContent(/新增/) // 成功正文仍走词典文案（muted 正文）
  expect(okCard).toHaveClass('text-muted-foreground') // 正文档位不变
  expect(okCard.querySelector('span')).toHaveClass('text-emerald-600') // 仅 ✓ 图标着绿
})

/** 停摆流 transport：不发任何 delta、start 永挂，abort 以 'aborted' 主动收尾
 *  （对齐 Task 8 真实 transport 契约）——终审 I2 的模型停摆场景 */
function stallTransport(): { abortCalls: () => number } {
  let aborts = 0
  let resolveStart: ((o: { endedWith: string }) => void) | null = null
  ;(window as never as { __AI_TRANSPORT_FACTORY__: unknown }).__AI_TRANSPORT_FACTORY__ = () => ({
    start: () =>
      new Promise<{ endedWith: string }>((resolve) => {
        resolveStart = resolve
      }),
    abort: () => {
      aborts++
      resolveStart?.({ endedWith: 'aborted' })
    },
  })
  return { abortCalls: () => aborts }
}

test('终审 I2：模型停摆时点停止——主动 abort 传输，回合收尾无错误卡', async () => {
  const stall = stallTransport()
  mount()
  await userEvent.type(screen.getByTestId('ai-input'), '停摆')
  await userEvent.click(screen.getByTestId('ai-send'))
  await screen.findByTestId('ai-stop') // phase=streaming：停止钮出现（start 已挂起）
  await userEvent.click(screen.getByTestId('ai-stop'))
  // stop.request 之外主动掐流：不等 Rust 空闲超时 120s 才被动收尾
  expect(stall.abortCalls()).toBe(1)
  await waitFor(() => expect(useChatStore.getState().phase).toBe('idle'))
  expect(screen.queryByTestId('ai-msg-error')).not.toBeInTheDocument() // 停止 ≠ 错误
  expect(useChatStore.getState().stopRequest).toBeNull() // 回合收尾即摘除全局句柄
})

test('v1.1（原终审 I3 语义升级）：回合中 ai-close 卸载——卸载即中止回合', async () => {
  const stall = stallTransport()
  const view = mount()
  await userEvent.type(screen.getByTestId('ai-input'), '关面板')
  await userEvent.click(screen.getByTestId('ai-send'))
  await screen.findByTestId('ai-stop')
  view.unmount() // 回合中收起面板：v1.1 起卸载 cleanup 走全局句柄立即中止——
  // 关面板 = 不再需要，防后台孤儿回合继续编辑导图（用户失去观察入口却不知情）
  expect(stall.abortCalls()).toBe(1) // 卸载即掐流，不等 Rust 空闲超时被动收尾
  await waitFor(() => expect(useChatStore.getState().phase).toBe('idle'))
  expect(useChatStore.getState().stopRequest).toBeNull() // 收尾摘除全局句柄
  expect(useChatStore.getState().messages.at(-1)?.role).not.toBe('error') // 中止 ≠ 错误卡
})

test('v1.1 ②：git 备份未启用——首轮发送插入安全网信息卡，会话内不重复', async () => {
  mount()
  await userEvent.type(screen.getByTestId('ai-input'), '你好')
  await userEvent.click(screen.getByTestId('ai-send'))
  expect(await screen.findByTestId('ai-msg-notice')).toBeInTheDocument()
  expect(screen.getByTestId('ai-msg-notice')).toHaveTextContent('版本管理')
  await screen.findByText(/收到/)
  await userEvent.type(screen.getByTestId('ai-input'), '再问')
  await userEvent.click(screen.getByTestId('ai-send'))
  await waitFor(() => expect(screen.getAllByTestId('ai-msg-notice')).toHaveLength(1)) // 会话级一次
})

test('v1.1 ②：git 备份已启用——无安全网信息卡', async () => {
  useAppStore.setState({ gitConfig: { enabled: true, remoteUrl: null, token: null } } as never)
  mount()
  await userEvent.type(screen.getByTestId('ai-input'), '你好')
  await userEvent.click(screen.getByTestId('ai-send'))
  await screen.findByText(/收到/)
  expect(screen.queryByTestId('ai-msg-notice')).not.toBeInTheDocument()
})

test('终审三叉#2：引擎未就绪发送——错误卡片出现（无声失败消除）', async () => {
  mount(null) // mmRef.current=null：画布引擎尚未挂载（加载态）
  await userEvent.type(screen.getByTestId('ai-input'), 'hi')
  await userEvent.click(screen.getByTestId('ai-send'))
  expect(screen.getByTestId('ai-msg-error')).toHaveTextContent('画布引擎未就绪')
  expect(useChatStore.getState().phase).toBe('idle') // 未进回合，无锁悬挂
})

test('终审 M3：工具轮第二轮 streaming 退回纯文本+光标分支，定稿再挂 md', async () => {
  const getMindmap =
    '{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"get_mindmap","arguments":"{}"}}]}}]}'
  const finishToolCalls = '{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}'
  let round = 0
  let releaseRound2: (() => void) | null = null
  ;(window as never as { __AI_TRANSPORT_FACTORY__: unknown }).__AI_TRANSPORT_FACTORY__ = () => ({
    start: (_p: unknown, onDelta: (d: string) => void) => {
      round++
      if (round === 1) {
        onDelta(getMindmap)
        onDelta(finishToolCalls)
        return Promise.resolve({ endedWith: 'done' as const })
      }
      // 第二轮吐一个文本 delta 后挂起：窗口内断言"已定稿消息退回流式分支"
      onDelta('{"choices":[{"delta":{"content":"好的"}}]}')
      return new Promise<{ endedWith: 'done' }>((resolve) => {
        releaseRound2 = () => resolve({ endedWith: 'done' })
      })
    },
    abort: () => {},
  })
  mount()
  await userEvent.type(screen.getByTestId('ai-input'), '读图')
  await userEvent.click(screen.getByTestId('ai-send'))
  await waitFor(() => expect(releaseRound2).not.toBeNull()) // round-1 定稿+工具已执行，round-2 已挂起
  expect(useChatStore.getState().phase).toBe('streaming')
  const mid = useChatStore.getState().messages
  expect(mid[mid.length - 1]!.rendered).toBe(false) // M3 核心：round-2 streaming 时 rendered 回 false
  expect(screen.getByTestId('ai-msg-streaming')).toBeInTheDocument() // 纯文本+光标回归（不再全量 lute 重渲染）
  releaseRound2!()
  await waitFor(() => expect(useChatStore.getState().phase).toBe('idle'))
  const fin = useChatStore.getState().messages
  expect(fin[fin.length - 1]!.rendered).toBe(true) // 定稿再挂 md
  expect(screen.getByTestId('md-preview')).toHaveTextContent('好的')
  expect(screen.queryByTestId('ai-msg-streaming')).not.toBeInTheDocument()
})

// ═══ 快捷键（2026-09 AI 对话输入优化）：Enter 发送 / Shift+Enter 换行 / IME 合成安全 ═══

test('快捷键：Enter 直接发送——消息入流、输入清空', async () => {
  mount()
  await userEvent.type(screen.getByTestId('ai-input'), '你好{enter}')
  expect(await screen.findByText(/收到/)).toBeInTheDocument() // fake transport 纯文本回合走完
  expect(useChatStore.getState().messages.some((m) => m.role === 'user' && m.text === '你好')).toBe(true)
  expect((screen.getByTestId('ai-input') as HTMLTextAreaElement).value).toBe('')
})

test('快捷键：Shift+Enter 换行不发送', async () => {
  mount()
  await userEvent.type(screen.getByTestId('ai-input'), '你好{shift>}{enter}{/shift}世界')
  expect((screen.getByTestId('ai-input') as HTMLTextAreaElement).value).toBe('你好\n世界')
  expect(useChatStore.getState().messages).toHaveLength(0) // 未触发发送
})

test('快捷键：输入法合成中的 Enter 不发送（选词确认回车）', () => {
  mount()
  fireEvent.change(screen.getByTestId('ai-input'), { target: { value: '你好' } })
  fireEvent.keyDown(screen.getByTestId('ai-input'), { key: 'Enter', isComposing: true })
  expect(useChatStore.getState().messages).toHaveLength(0)
})

test('提示：输入区常显快捷键提示文案', () => {
  mount()
  expect(screen.getByTestId('ai-input-hint')).toHaveTextContent('Enter 发送，Shift + Enter 换行')
})

// ═══ 输入区拖高手柄（2026-09 长内容）：向上拖增高、松手提交、双击回默认 ═══

/** 拖高测试台：桩掉持久层 IO，但回显真实 setter 语义（setState）——
 *  onCommit 清拖拽暂存后，高度靠 store 回显不闪回 */
const mountForDrag = () => {
  const commit = vi.fn(async (h: number | null) => {
    useAppStore.setState({ aiChatInputHeight: h } as never)
  })
  useAppStore.setState({ setAiChatInputHeight: commit } as never)
  mount()
  return { commit, handle: screen.getByRole('separator', { name: '调整输入框高度' }) }
}

test('拖高手柄：向上拖增高（clamp 到上限），松手提交最终高度', () => {
  const { commit, handle } = mountForDrag()
  // jsdom clientHeight=0：起点高 0、上限 max(64+40, 0)=104——上移 150 后 clamp 到 104
  fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 100, clientY: 300 })
  fireEvent.pointerMove(window, { pointerId: 1, clientY: 250 })
  expect((screen.getByTestId('ai-input') as HTMLTextAreaElement).style.height).toBe('64px') // 逐帧跟手（min clamp）
  fireEvent.pointerMove(window, { pointerId: 1, clientY: 150 })
  fireEvent.pointerUp(window, { pointerId: 1 })
  expect(commit).toHaveBeenCalledTimes(1)
  expect(commit).toHaveBeenCalledWith(104) // max clamp
  expect((screen.getByTestId('ai-input') as HTMLTextAreaElement).style.height).toBe('104px')
})

test('拖高手柄：持久高度开面板即生效；双击提交 null 恢复默认', () => {
  useAppStore.setState({ aiChatInputHeight: 180 } as never)
  const { commit, handle } = mountForDrag()
  expect((screen.getByTestId('ai-input') as HTMLTextAreaElement).style.height).toBe('180px')
  fireEvent.dblClick(handle)
  expect(commit).toHaveBeenCalledWith(null)
})

test('拖高手柄：松手提交的落盘窗口期高度不闪回（拖拽暂存保持）', async () => {
  // 持久层落盘是异步磁盘 IO（load-merge-save 后才回写 store）——若松手即清拖拽暂存，
  // 窗口期内 inputH 回落旧值/默认两行，落地后又跳回拖拽高，一降一升即用户报的闪烁。
  // 契约：暂存保持到落地（同值覆盖无感），只有双击重置才清
  let release: (() => void) | null = null
  const commit = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve
      }),
  )
  useAppStore.setState({ setAiChatInputHeight: commit as never } as never)
  mount()
  const handle = screen.getByRole('separator', { name: '调整输入框高度' })
  fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 100, clientY: 300 })
  fireEvent.pointerMove(window, { pointerId: 1, clientY: 200 })
  fireEvent.pointerUp(window, { pointerId: 1 })
  expect(commit).toHaveBeenCalledWith(100)
  expect((screen.getByTestId('ai-input') as HTMLTextAreaElement).style.height).toBe('100px') // 落地前不闪回
  release!()
})

// ═══ 按轮悬浮复制（2026-09）：定稿 assistant 回复 hover 复制钮，复制该轮 Markdown 原文 ═══

/** 布置一条定稿 assistant 回复（走真实 store 流：pushUser 占位 → 追加 delta → 定稿） */
function seedFinalAssistant(text: string): void {
  useChatStore.getState().pushUser('问')
  useChatStore.getState().appendStreamDelta(text)
  useChatStore.getState().finalizeStream()
}

test('按轮复制：定稿回复有复制钮，点击复制该轮 Markdown 原文', async () => {
  const write = vi.fn(async () => {})
  seedFinalAssistant('**回答**')
  mount(fakeMm, write)
  await userEvent.click(screen.getByRole('button', { name: '复制此轮回复' }))
  expect(write).toHaveBeenCalledWith('**回答**')
})

test('按轮复制：流式生成中不显示复制钮（文本未定稿）', () => {
  useChatStore.getState().pushUser('问')
  useChatStore.getState().appendStreamDelta('半截') // 不 finalize：rendered=false
  mount()
  expect(screen.queryByRole('button', { name: '复制此轮回复' })).not.toBeInTheDocument()
})

test('按轮复制：剪贴板失败——toast 报错不静默（吞异常红线）', async () => {
  const write = vi.fn(() => Promise.reject(new Error('clipboard unavailable')))
  seedFinalAssistant('回答')
  mount(fakeMm, write)
  const toasts: (string | null)[] = []
  subscribeToast((t) => toasts.push(t?.text ?? null))
  await userEvent.click(screen.getByRole('button', { name: '复制此轮回复' }))
  expect(toasts).toContain('复制失败，请重试')
})

test('按轮复制：user 输入也有独立复制钮，各自复制各自内容', async () => {
  const write = vi.fn(async () => {})
  seedFinalAssistant('回答') // 消息流：[user('问'), assistant('回答')]
  mount(fakeMm, write)
  await userEvent.click(screen.getByRole('button', { name: '复制此条输入' }))
  expect(write).toHaveBeenCalledWith('问')
  await userEvent.click(screen.getByRole('button', { name: '复制此轮回复' }))
  expect(write).toHaveBeenCalledWith('回答')
})

// ═══ 操作卡片收起（2026-09）：回合收尾自动收起明细卡，摘要行点击可展开 ═══

/** 两轮 transport 台：round-1 发 add_node 工具调用（fakeMm findNodeByUid 恒 null → 失败卡，
 *  失败计数分支一并覆盖）后收尾；round-2 吐一个文本 delta 后挂起——releaseRound2 放行收尾 */
function toolTurnTransport(): { releaseRound2(): void } {
  let round = 0
  let releaseRound2: (() => void) | null = null
  // 两次 onDelta 同 M3 先例：工具调用 delta + finish_reason=tool_calls 收尾
  const toolDelta = JSON.stringify({
    choices: [
      {
        delta: {
          tool_calls: [
            { index: 0, id: 'c1', function: { name: 'add_node', arguments: '{"parentUid":"root","text":"x"}' } },
          ],
        },
      },
    ],
  })
  const finishDelta = JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] })
  ;(window as never as { __AI_TRANSPORT_FACTORY__: unknown }).__AI_TRANSPORT_FACTORY__ = () => ({
    start: (_p: unknown, onDelta: (d: string) => void) => {
      round++
      if (round === 1) {
        onDelta(toolDelta)
        onDelta(finishDelta)
        return Promise.resolve({ endedWith: 'done' as const })
      }
      onDelta('{"choices":[{"delta":{"content":"完成"}}]}')
      return new Promise<{ endedWith: string }>((resolve) => {
        releaseRound2 = () => resolve({ endedWith: 'done' })
      })
    },
    abort: () => {},
  })
  return { releaseRound2: () => releaseRound2?.() }
}

test('操作卡片收起：回合结束自动收起——回合中展开可见，收尾只剩摘要行（含失败计数）', async () => {
  const { releaseRound2 } = toolTurnTransport()
  mount()
  await userEvent.type(screen.getByTestId('ai-input'), '加节点')
  await userEvent.click(screen.getByTestId('ai-send'))
  // round-1 工具已执行、round-2 已挂起（executing→streaming 过渡点）
  await waitFor(() => expect(useChatStore.getState().messages.at(-1)?.cards).toHaveLength(1))
  // 回合中：操作步骤进行时明细卡展开可见（用户能看进度）。消息下标 2 = 首轮 notice
  // 安全网卡前插（git 备份未启用，beforeEach 默认关）→ [notice, user, assistant]
  expect(screen.getByTestId('ai-card-2-0')).toBeInTheDocument()
  releaseRound2()
  await waitFor(() => expect(useChatStore.getState().phase).toBe('idle'))
  // 回合收尾：自动收起——明细卡退场，只剩摘要行；失败不静默：失败计数入摘要
  expect(screen.queryByTestId('ai-card-2-0')).not.toBeInTheDocument()
  const toggle = screen.getByTestId('ai-cards-toggle-2')
  expect(toggle).toHaveTextContent('1 项操作')
  expect(toggle).toHaveTextContent('1 项失败')
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
})

test('操作卡片收起：点击摘要行展开明细、再点收起；全成功无失败计数', async () => {
  useChatStore.getState().pushUser('x')
  useChatStore.getState().pushCard({ kind: 'add', ok: true, text: '新想法' })
  useChatStore.getState().pushCard({ kind: 'add', ok: true, text: '另一个' })
  useChatStore.getState().collapseLastCards()
  mount()
  const toggle = screen.getByTestId('ai-cards-toggle-1')
  expect(toggle).toHaveTextContent('2 项操作')
  expect(toggle).not.toHaveTextContent('失败')
  expect(screen.queryByTestId('ai-card-1-0')).not.toBeInTheDocument()
  await userEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByTestId('ai-card-1-0')).toBeInTheDocument()
  expect(screen.getByTestId('ai-card-1-1')).toBeInTheDocument()
  await userEvent.click(toggle)
  expect(screen.queryByTestId('ai-card-1-0')).not.toBeInTheDocument()
})

test('操作卡片收起：只收本轮最后一条 assistant——往轮卡片保持原样', () => {
  const chat = useChatStore.getState()
  chat.pushUser('a')
  chat.pushCard({ kind: 'add', ok: true, text: '旧1' }) // 挂第一轮 assistant
  chat.pushUser('b')
  chat.pushCard({ kind: 'add', ok: true, text: '新1' }) // 挂第二轮 assistant
  chat.collapseLastCards()
  const msgs = useChatStore.getState().messages
  const first = msgs.find((m) => m.role === 'assistant')!
  const last = msgs.at(-1)!
  expect(last.role).toBe('assistant')
  expect(first.cardsCollapsed).toBeUndefined() // 往轮不动（保持用户留置的展开态）
  expect(last.cardsCollapsed).toBe(true)
})

// ═══ 回合级状态行（2026-09 执行中指示常驻）：操作多时消息区被滚离底部，面板内
// 无任何"还在执行"指示——状态行放滚动区外，回合期间恒可见，收尾即隐 ═══

test('状态行：回合中常驻消息区外（不随滚动），收尾即隐', async () => {
  stallTransport() // 停摆流：streaming 挂起至点停止
  mount()
  await userEvent.type(screen.getByTestId('ai-input'), '执行')
  await userEvent.click(screen.getByTestId('ai-send'))
  await screen.findByTestId('ai-stop') // phase=streaming：进入回合
  // 回合中：状态行出现，且在滚动消息区之外——上翻看操作明细也恒可见
  const row = screen.getByTestId('ai-status')
  expect(row).toHaveTextContent('AI 处理中')
  expect(screen.getByTestId('ai-messages')).not.toContainElement(row)
  await userEvent.click(screen.getByTestId('ai-stop'))
  await waitFor(() => expect(useChatStore.getState().phase).toBe('idle'))
  expect(screen.queryByTestId('ai-status')).not.toBeInTheDocument()
})

test('状态行：executing 阶段同样显示（工具轮间隙无流式光标时仍是执行中）', () => {
  useChatStore.getState().setPhase('executing')
  mount()
  expect(screen.getByTestId('ai-status')).toBeInTheDocument()
})

// ═══ 操作卡滚动窗口（2026-09 有界队列）：回合中恒显最新 5 条，更早的折进摘要 ═══

/** 布置一条含 n 张卡的 assistant 消息（走真实 store 流），返回其消息下标 */
function seedCards(n: number): void {
  useChatStore.getState().pushUser('问')
  for (let i = 0; i < n; i++) useChatStore.getState().pushCard({ kind: 'add', ok: true, text: `op${i}` })
}

test('滚动窗口：8 张卡默认只见最新 5 条，摘要计较早 3 条；点开展开全部，再点回窗口', async () => {
  seedCards(8)
  mount()
  // 窗口态：较早 op0..op2 折起，最新 op3..op7 恒显（testid 用原始下标，跨形态稳定）
  expect(screen.queryByTestId('ai-card-1-0')).not.toBeInTheDocument()
  expect(screen.queryByTestId('ai-card-1-2')).not.toBeInTheDocument()
  expect(screen.getByTestId('ai-card-1-3')).toBeInTheDocument()
  expect(screen.getByTestId('ai-card-1-7')).toBeInTheDocument()
  const toggle = screen.getByTestId('ai-cards-toggle-1')
  expect(toggle).toHaveTextContent('较早的 3 项操作')
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await userEvent.click(toggle) // 全展开：8 条明细齐现，摘要仍在窗口上方（箭头转向）
  expect(screen.getByTestId('ai-card-1-0')).toBeInTheDocument()
  expect(screen.getByTestId('ai-card-1-7')).toBeInTheDocument()
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await userEvent.click(toggle) // 折回窗口：较早的重新折起
  expect(screen.queryByTestId('ai-card-1-0')).not.toBeInTheDocument()
  expect(screen.getByTestId('ai-card-1-7')).toBeInTheDocument()
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
})

test('滚动窗口：回合收尾全折成总计数摘要（不再标"较早的"），点开即全部展开', async () => {
  seedCards(8)
  useChatStore.getState().collapseLastCards()
  mount()
  const toggle = screen.getByTestId('ai-cards-toggle-1')
  expect(toggle).toHaveTextContent('8 项操作')
  expect(toggle).not.toHaveTextContent('较早的')
  expect(screen.queryByTestId('ai-card-1-7')).not.toBeInTheDocument()
  await userEvent.click(toggle) // 全折态点摘要：全部展开（windowed=false）
  expect(useChatStore.getState().messages.at(-1)!.cardsWindowed).toBe(false)
  expect(screen.getByTestId('ai-card-1-0')).toBeInTheDocument()
  expect(screen.getByTestId('ai-card-1-7')).toBeInTheDocument()
})

// ═══ 历史对话提醒（2026-09 持久化）：banner 载入/重新开始/隐式清理 + 回合收尾落盘 ═══

test('有历史时置顶 banner 示轮数；载入历史：消息入面板、卡片收起、banner 退场', async () => {
  useChatStore.getState().setPendingHistory([
    { role: 'user', text: '旧问' },
    { role: 'assistant', text: '旧答', cards: [{ kind: 'add', ok: true, text: '节点' }] },
    { role: 'user', text: '旧问二' },
  ])
  mount()
  expect(screen.getByTestId('ai-history-banner')).toHaveTextContent('2 轮')
  await userEvent.click(screen.getByTestId('ai-history-load'))
  expect(screen.queryByTestId('ai-history-banner')).not.toBeInTheDocument()
  // 载入消息走定稿分支（md 渲染），卡片收起成摘要行
  expect(screen.getByTestId('md-preview')).toHaveTextContent('旧答')
  expect(screen.getByText('旧问')).toBeInTheDocument()
  expect(screen.getByText('旧问二')).toBeInTheDocument()
  expect(screen.getByTestId('ai-cards-toggle-1')).toHaveTextContent('1 项操作')
  expect(useChatStore.getState().pendingHistory).toBeNull()
})

test('重新开始：仅弃待载入，消息区保持空态', async () => {
  useChatStore.getState().setPendingHistory([{ role: 'user', text: '旧问' }])
  mount()
  await userEvent.click(screen.getByTestId('ai-history-restart'))
  expect(screen.queryByTestId('ai-history-banner')).not.toBeInTheDocument()
  expect(useChatStore.getState().messages).toEqual([])
})

test('banner 在场时发送 = 隐式重新开始：banner 退场，新回合照常落盘且不带旧历史', async () => {
  const persistTurn = vi.fn<(msgs: ChatMessage[]) => Promise<void>>(async () => {})
  useChatStore.getState().setPendingHistory([{ role: 'user', text: '旧问' }])
  mount(fakeMm, undefined, persistTurn)
  await userEvent.type(screen.getByTestId('ai-input'), '新话题')
  await userEvent.click(screen.getByTestId('ai-send'))
  expect(await screen.findByText(/收到/)).toBeInTheDocument()
  expect(screen.queryByTestId('ai-history-banner')).not.toBeInTheDocument()
  // 端口收到本回合原始切片（含安全网 notice——过滤归 appendTurn，服务层单测已覆盖）
  await waitFor(() => expect(persistTurn).toHaveBeenCalledTimes(1))
  const persisted = persistTurn.mock.calls[0][0] as ChatMessage[]
  expect(persisted.map((m) => m.role)).toEqual(['notice', 'user', 'assistant'])
  expect(persisted[1]).toMatchObject({ text: '新话题' })
})

test('回合收尾把操作卡片随消息一并交持久化端口（在途挂卡，收尾切片带出）', async () => {
  const persistTurn = vi.fn<(msgs: ChatMessage[]) => Promise<void>>(async () => {})
  // 门闸 transport：start 挂起等放行——卡在回合在途时挂上，避免收尾竞态
  let releaseStart: ((o: { endedWith: string }) => void) | null = null
  ;(window as never as { __AI_TRANSPORT_FACTORY__: unknown }).__AI_TRANSPORT_FACTORY__ = () => ({
    start: () =>
      new Promise<{ endedWith: string }>((resolve) => {
        releaseStart = resolve
      }),
    abort: () => {},
  })
  mount(fakeMm, undefined, persistTurn)
  await userEvent.type(screen.getByTestId('ai-input'), '加节点')
  await userEvent.click(screen.getByTestId('ai-send'))
  await screen.findByTestId('ai-msg-streaming') // 回合在途（user + assistant 占位已建，start 已挂起）
  useChatStore.getState().pushCard({ kind: 'add', ok: true, text: '新想法' })
  releaseStart!({ endedWith: 'done' })
  await waitFor(() => expect(persistTurn).toHaveBeenCalledTimes(1))
  const persisted = persistTurn.mock.calls[0][0] as ChatMessage[]
  expect(persisted[2]!.cards).toEqual([{ kind: 'add', ok: true, text: '新想法' }])
})
