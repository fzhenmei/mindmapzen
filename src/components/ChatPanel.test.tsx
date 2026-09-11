// src/components/ChatPanel.test.tsx —— 面板渲染与编排接线（Task 11，spec §7）
import { render, screen } from '@testing-library/react'
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

function mount() {
  return render(
    <ChatPanel
      mmRef={{ current: fakeMm as never }}
      selection={null}
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

test('卡片渲染：失败红字', () => {
  useChatStore.getState().pushUser('x') // 产生 [user, assistant 占位] 两条——卡片挂在 assistant（idx 1）
  useChatStore.getState().pushCard({ kind: 'remove', ok: false, text: '节点不存在：[zz]' })
  mount()
  expect(screen.getByTestId('ai-card-1-0')).toHaveTextContent('失败')
})
