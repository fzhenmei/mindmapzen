import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import EditorCaption from './EditorCaption'
import { TooltipProvider } from './ui/tooltip'

// 题签（2026-09 版本信息批）：原有 导图名 + 脏印；新增统计行（节点数/保存时间）与
// 复制文件路径小钮（路径与回调经 props，写剪贴板/印记由 EditorView 组合承担）
describe('EditorCaption', () => {
  afterEach(cleanup)

  test('渲染导图名与脏印（dirty=true）', () => {
    render(<TooltipProvider><EditorCaption name="周计划" dirty mdPath="/ws/周计划.md" onCopyPath={() => {}} nodeCount={3} savedAt={null} /></TooltipProvider>)
    expect(screen.getByText('周计划')).toBeInTheDocument()
    expect(screen.getByTestId('dirty-badge')).toBeInTheDocument()
  })

  test('dirty=false 无脏印', () => {
    render(<TooltipProvider><EditorCaption name="周计划" dirty={false} mdPath="/ws/周计划.md" onCopyPath={() => {}} nodeCount={3} savedAt={null} /></TooltipProvider>)
    expect(screen.queryByTestId('dirty-badge')).not.toBeInTheDocument()
  })

  test('统计行：节点数与保存时间（savedAt=null 显示「未保存」）', () => {
    render(<TooltipProvider><EditorCaption name="周计划" dirty={false} mdPath="/ws/周计划.md" onCopyPath={() => {}} nodeCount={7} savedAt={null} /></TooltipProvider>)
    const stats = screen.getByTestId('caption-stats')
    expect(stats).toHaveTextContent('7 节点')
    expect(stats).toHaveTextContent('未保存')
  })

  test('统计行：savedAt 为今天时刻时显示 HH:mm', () => {
    const now = new Date()
    const savedAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 5).getTime()
    render(<TooltipProvider><EditorCaption name="周计划" dirty={false} mdPath="/ws/周计划.md" onCopyPath={() => {}} nodeCount={7} savedAt={savedAt} /></TooltipProvider>)
    expect(screen.getByTestId('caption-stats')).toHaveTextContent('09:05')
  })

  test('复制路径钮：点击触发回调', () => {
    const onCopyPath = vi.fn()
    render(<TooltipProvider><EditorCaption name="周计划" dirty={false} mdPath="/ws/周计划.md" onCopyPath={onCopyPath} nodeCount={1} savedAt={null} /></TooltipProvider>)
    fireEvent.click(screen.getByTestId('btn-copy-path'))
    expect(onCopyPath).toHaveBeenCalledTimes(1)
  })
})
