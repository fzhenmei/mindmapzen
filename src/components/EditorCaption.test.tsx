import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import EditorCaption from './EditorCaption'

// 题签（2026-09 版本信息批）：导图名 + 脏印 + 统计行（节点数/保存时间）。
// 复制路径钮初版曾挂此处（btn-copy-path），后移砚栏复制钮旁——testid 随迁
describe('EditorCaption', () => {
  afterEach(cleanup)

  test('渲染导图名与脏印（dirty=true）', () => {
    render(<EditorCaption name="周计划" dirty nodeCount={3} savedAt={null} />)
    expect(screen.getByText('周计划')).toBeInTheDocument()
    expect(screen.getByTestId('dirty-badge')).toBeInTheDocument()
  })

  test('dirty=false 无脏印', () => {
    render(<EditorCaption name="周计划" dirty={false} nodeCount={3} savedAt={null} />)
    expect(screen.queryByTestId('dirty-badge')).not.toBeInTheDocument()
  })

  test('统计行：节点数与保存时间（savedAt=null 显示「未保存」）', () => {
    render(<EditorCaption name="周计划" dirty={false} nodeCount={7} savedAt={null} />)
    const stats = screen.getByTestId('caption-stats')
    expect(stats).toHaveTextContent('7 节点')
    expect(stats).toHaveTextContent('未保存')
  })

  test('统计行：savedAt 为今天时刻时显示 HH:mm', () => {
    const now = new Date()
    const savedAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 5).getTime()
    render(<EditorCaption name="周计划" dirty={false} nodeCount={7} savedAt={savedAt} />)
    expect(screen.getByTestId('caption-stats')).toHaveTextContent('09:05')
  })
})
