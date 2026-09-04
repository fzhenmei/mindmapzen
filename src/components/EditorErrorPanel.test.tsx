// src/components/EditorErrorPanel.test.tsx —— 打开失败错误面板（2026-09 优雅恢复）：
// 读文件失败（被删/移动）与解析失败（内容坏）分型给文案与操作；无论何型都留逃生门
// （返回案头 / 打开其他导图），修复路径（纯文本打开）仅解析失败提供
import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import EditorErrorPanel from './EditorErrorPanel'

/** 每用例独立桩（mocks 不得跨用例共享，断言次数才可信） */
const makeProps = () => ({
  error: 'boom',
  mdPath: '/ws/missing.md',
  onRawEdit: vi.fn(),
  onBack: vi.fn(),
  onSwitch: vi.fn(),
})

test('读文件失败：说明文件可能被移动或删除并显示路径，仅留返回案头/打开其他导图两出路', () => {
  const p = makeProps()
  render(<EditorErrorPanel {...p} kind="read" raw="" />)
  expect(screen.getByText('无法打开此文件')).toBeInTheDocument()
  expect(screen.getByText(/文件可能已被移动、删除或没有访问权限/)).toBeInTheDocument()
  expect(screen.getByText('/ws/missing.md')).toBeInTheDocument()
  expect(screen.queryByTestId('btn-raw-edit')).not.toBeInTheDocument() // 文件不在，修复无从谈起
  fireEvent.click(screen.getByTestId('btn-error-back'))
  expect(p.onBack).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByTestId('btn-error-switch'))
  expect(p.onSwitch).toHaveBeenCalledTimes(1)
})

test('解析失败：显示错误与原文，额外提供以纯文本打开修复', () => {
  const p = makeProps()
  render(<EditorErrorPanel {...p} kind="parse" raw="# 坏内容" />)
  expect(screen.getByText('无法打开此导图')).toBeInTheDocument()
  expect(screen.getByText('boom')).toBeInTheDocument()
  expect(screen.getByText('# 坏内容')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('btn-raw-edit'))
  expect(p.onRawEdit).toHaveBeenCalledWith('/ws/missing.md')
  fireEvent.click(screen.getByTestId('btn-error-back'))
  expect(p.onBack).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByTestId('btn-error-switch'))
  expect(p.onSwitch).toHaveBeenCalledTimes(1)
})
