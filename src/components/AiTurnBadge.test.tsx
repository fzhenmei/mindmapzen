// src/components/AiTurnBadge.test.tsx —— 处理中状态签（Task 12）
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import AiTurnBadge from './AiTurnBadge'
import { useChatStore } from '../store/chatStore'

test('idle 不渲染；streaming 渲染；blockedPulse 加红色描边类', () => {
  let view = render(<AiTurnBadge />)
  expect(screen.queryByTestId('ai-badge')).toBeNull()
  view.unmount()
  useChatStore.getState().setPhase('streaming')
  view = render(<AiTurnBadge />)
  expect(screen.getByTestId('ai-badge')).toHaveTextContent('AI 处理中')
  view.unmount()
  useChatStore.getState().notifyBlocked()
  view = render(<AiTurnBadge />)
  expect(screen.getByTestId('ai-badge').className).toContain('border-destructive')
  view.unmount()
})
