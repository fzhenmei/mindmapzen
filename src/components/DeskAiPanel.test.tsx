// src/components/DeskAiPanel.test.tsx —— 案头 AI 整理面板集成（spec §2.4/§1.5）：
// 确认门全链（未确认拒绝→确认执行）、sidecar 三件套、路径换址、工作区级历史落盘
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import DeskAiPanel from './DeskAiPanel'
import { useDeskChatStore } from '../store/deskChat'
import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'

vi.mock('./MarkdownPreview', () => ({
  default: ({ text }: { text: string }) => <div data-testid="md-preview">{text}</div>,
}))

let fs: MemoryFsAdapter
let round = 0
const writeClipboard = vi.fn(async () => {})

/** 内层 JSON 转义（tool_calls.arguments 是字符串字段，内嵌 JSON 引号须转义） */
const esc = (s: string): string => JSON.stringify(s).slice(1, -1)

/** 轮次协议：round1 = 用户首条指令 → AI 出方案（纯文本）；round2 = 用户「确认」→
 *  AI 执行 rename_file；round3 = 用户非确认消息 → AI 试图执行被拒 */
function installTransport(): void {
  ;(window as never as { __AI_TRANSPORT_FACTORY__: unknown }).__AI_TRANSPORT_FACTORY__ = () => ({
    start: (_p: unknown, onDelta: (d: string) => void) => {
      round += 1
      if (round === 1) {
        onDelta('{"choices":[{"delta":{"content":"方案：把「会议纪要」改名为「周会纪要」。确认执行吗？"}}]}')
        onDelta('{"choices":[{"delta":{},"finish_reason":"stop"}]}')
        return Promise.resolve({ endedWith: 'done' as const })
      }
      if (round === 2) {
        onDelta(`{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"rename_file","arguments":"${esc(JSON.stringify({ relDir: '', name: '会议纪要', newName: '周会纪要' }))}"}}]}}]}`)
        onDelta('{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}')
        return Promise.resolve({ endedWith: 'done' as const })
      }
      // round3：工具被拒后模型收尾文本（拒绝 detail 已回灌 history，此处只收尾）
      onDelta('{"choices":[{"delta":{"content":"好的，先不动文件。"}}]}')
      onDelta('{"choices":[{"delta":{},"finish_reason":"stop"}]}')
      return Promise.resolve({ endedWith: 'done' as const })
    },
    abort: () => {},
  })
}

beforeEach(async () => {
  round = 0
  fs = new MemoryFsAdapter()
  await fs.writeTextFileAtomic('/ws/会议纪要.md', '# 会议纪要\n')
  await fs.writeTextFileAtomic('/ws/会议纪要.zen.json', '{"version":1}')
  await fs.writeTextFileAtomic('/ws/会议纪要.zen.chat.json', '{"version":1,"messages":[]}')
  useDeskChatStore.getState().reset()
  useAppStore.setState({
    adapter: fs,
    workspaceDir: '/ws',
    configPath: '/ws/cfg.json',
    aiConfig: { baseUrl: 'https://a/v1', apiKey: 'k', model: 'm' },
    gitConfig: { enabled: false, remoteUrl: null, token: null },
    aiBackupNoticeShown: true,
    aiChatInputHeight: null,
    favorites: ['/ws/会议纪要.md'],
    recentOpened: ['/ws/会议纪要.md'],
    mapTabs: [],
    sessionRecent: [],
    lastOpened: null,
    currentMdPath: null,
    maps: [],
  } as never)
  installTransport()
})

test('未确认时写工具被拒：方案后发非确认消息，文件不动', async () => {
  render(<DeskAiPanel onTreeChanged={async () => {}} writeClipboard={writeClipboard} />)
  await userEvent.click(screen.getByTestId('desk-ai-toggle'))
  const input = screen.getByTestId('ai-input')
  await userEvent.type(input, '帮我整理')
  await userEvent.click(screen.getByTestId('ai-send'))
  expect(await screen.findByText(/方案：把「会议纪要」改名为/)).toBeInTheDocument()
  // 非确认消息（round2 的 transport 意图执行 rename，确认门应拒——拒绝 detail 回灌后
  // round3 收尾文本，回合正常结束）
  await userEvent.type(input, '再看看')
  await userEvent.click(screen.getByTestId('ai-send'))
  await waitFor(() => { expect(useDeskChatStore.getState().phase).toBe('idle') })
  expect(await fs.exists('/ws/会议纪要.md')).toBe(true)
  expect(await fs.exists('/ws/周会纪要.md')).toBe(false)
}, 20_000)

test('确认后执行：rename_file 落地三件套 + 路径换址 + .zen.desk-chat.json 落盘', async () => {
  render(<DeskAiPanel onTreeChanged={async () => {}} writeClipboard={writeClipboard} />)
  await userEvent.click(screen.getByTestId('desk-ai-toggle'))
  const input = screen.getByTestId('ai-input')
  // round1 方案
  await userEvent.type(input, '帮我整理')
  await userEvent.click(screen.getByTestId('ai-send'))
  await screen.findByText(/方案：把/)
  // round2：确认（transport 的 round2 是 tool_calls）
  await userEvent.type(input, '确认')
  await userEvent.click(screen.getByTestId('ai-send'))
  await waitFor(() => { expect(useDeskChatStore.getState().phase).toBe('idle') })
  expect(await fs.exists('/ws/周会纪要.md')).toBe(true)
  expect(await fs.exists('/ws/周会纪要.zen.json')).toBe(true)
  expect(await fs.exists('/ws/周会纪要.zen.chat.json')).toBe(true)
  expect(await fs.exists('/ws/会议纪要.md')).toBe(false)
  // 路径态换址
  expect(useAppStore.getState().favorites).toEqual(['/ws/周会纪要.md'])
  expect(useAppStore.getState().recentOpened).toEqual(['/ws/周会纪要.md'])
  // 工作区级历史落盘（两轮 user/assistant 流水）
  await waitFor(async () => {
    const raw = JSON.parse(await fs.readTextFile('/ws/.zen.desk-chat.json')) as { messages: Array<{ role: string }> }
    expect(raw.messages.filter((m) => m.role === 'user').length).toBeGreaterThanOrEqual(2)
  })
}, 20_000)

test('回合结束确认重置：执行成功后再发非确认消息，写工具再次被拒', async () => {
  render(<DeskAiPanel onTreeChanged={async () => {}} writeClipboard={writeClipboard} />)
  await userEvent.click(screen.getByTestId('desk-ai-toggle'))
  const input = screen.getByTestId('ai-input')
  await userEvent.type(input, '帮我整理')
  await userEvent.click(screen.getByTestId('ai-send'))
  await screen.findByText(/方案：把/)
  await userEvent.type(input, '确认')
  await userEvent.click(screen.getByTestId('ai-send'))
  await waitFor(() => { expect(useDeskChatStore.getState().phase).toBe('idle') })
  expect(await fs.exists('/ws/周会纪要.md')).toBe(true)
  // 新一轮：非确认消息 + transport 又给 tool_calls（重装工厂恒发 tool_calls——
  // 被门禁连续拒绝直至 3 败护栏终止，验证门禁在回合结束后已重置）
  installToolRound3()
  await userEvent.type(input, '把它再改回会议纪要')
  await userEvent.click(screen.getByTestId('ai-send'))
  await waitFor(() => { expect(useDeskChatStore.getState().phase).toBe('idle') })
  expect(await fs.exists('/ws/周会纪要.md')).toBe(true) // 未被改回——门禁生效
  expect(await fs.exists('/ws/会议纪要.md')).toBe(false)
}, 20_000)

/** 第三用例的专属 transport：round3 也发 tool_calls（rename 回旧名）——验证门禁重置 */
function installToolRound3(): void {
  ;(window as never as { __AI_TRANSPORT_FACTORY__: unknown }).__AI_TRANSPORT_FACTORY__ = () => ({
    start: (_p: unknown, onDelta: (d: string) => void) => {
      onDelta(`{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c9","function":{"name":"rename_file","arguments":"${esc(JSON.stringify({ relDir: '', name: '周会纪要', newName: '会议纪要' }))}"}}]}}]}`)
      onDelta('{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}')
      return Promise.resolve({ endedWith: 'done' as const })
    },
    abort: () => {},
  })
}
