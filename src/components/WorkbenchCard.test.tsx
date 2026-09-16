import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import WorkbenchCard from './WorkbenchCard'
import type { WorkTask } from '../services/workbench'

const task: WorkTask = {
  uid: 'u1', text: '任务甲', status: 'todo', path: ['分支'], icons: [], tags: [], hasBody: false, childCount: 2, outline: [],
  mapPath: '/ws/工作/图A.md', mapName: '图A', dirRel: '', mtime: 1,
}

describe('WorkbenchCard', () => {
  test('来源徽标 + 文本 + 路径段 + 后代计数；点击回调带 task', async () => {
    const onOpen = vi.fn()
    render(<WorkbenchCard task={task} onOpen={onOpen} />)
    expect(screen.getByText('图A')).toBeInTheDocument()   // 来源徽标
    expect(screen.getByText('任务甲')).toBeInTheDocument()
    expect(screen.getByText('分支')).toBeInTheDocument()  // 大纲路径段
    expect(screen.getByText('+2')).toBeInTheDocument()    // 无状态后代计数
    await screen.getByTestId('workbench-card').click()
    expect(onOpen).toHaveBeenCalledWith(task)
  })
})
