// src/components/ChatPanel.test.tsx —— 面板渲染与编排接线（Task 11，spec §7）
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import ChatPanel from './ChatPanel'
import { useChatStore } from '../store/chatStore'
import { useAppStore } from '../store/appStore'

// jsdom 不执行 vditor 注入的子资源脚本（渲染 promise 永不 resolve），真实渲染归 e2e；
// 单测 mock MarkdownPreview 为透传 div——定稿消息走 md 渲染分支由 data-testid 断言
vi.mock('./MarkdownPreview', () => ({
  default: ({ text }: { text: string }) => <div data-testid="md-preview">{text}</div>,
}))

const fakeMm = { execCommand: vi.fn(), renderer: { findNodeByUid: () => null, renderTree: null } }

function mount(mm: unknown = fakeMm) {
  return render(
    <ChatPanel
      mmRef={{ current: mm as never }}
      selection={null}
      aiEnv={null}
      width={320}
      onResize={() => {}}
      onCommit={() => {}}
      onReset={() => {}}
      onClose={() => {}}
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
