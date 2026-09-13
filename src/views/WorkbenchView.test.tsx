// src/views/WorkbenchView.test.tsx
// 挂载模式对齐 LibraryView.test.tsx：真实 zustand store setState 预置 + MemoryFsAdapter。
import { beforeEach, describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'
import { useAppStore } from '../store/appStore'
import WorkbenchView from './WorkbenchView'

let fs: MemoryFsAdapter
beforeEach(() => {
  fs = new MemoryFsAdapter()
  useAppStore.setState({ adapter: fs, workspaceDir: '/ws', currentMdPath: null, route: 'workbench', error: null })
})

describe('WorkbenchView 骨架（spec §4/§8）', () => {
  test('工作目录不存在：空态引导 + 一键创建后重扫出任务', async () => {
    render(<WorkbenchView />)
    expect(await screen.findByTestId('workbench-empty-create')).toBeInTheDocument()
    expect(screen.getByText('还没有工作目录')).toBeInTheDocument()
    await screen.getByTestId('workbench-empty-create').click()
    // 一键创建（ensureDir）+ 重扫：目录已存在但无任务 → 切换到「打标记」空态
    expect(await screen.findByText(/还没有带状态标记的任务/)).toBeInTheDocument()
  })

  test('有任务：头部去案头钮可达；扫描期间有确定性 loading', async () => {
    await fs.writeTextFileAtomic('/ws/工作/图A.md', '# 图A\n\n## 任务一 @todo\n')
    render(<WorkbenchView />)
    expect(screen.getByTestId('workbench-loading')).toBeInTheDocument() // 首帧即 loading（不闪空 UI）
    expect(await screen.findByText('任务一')).toBeInTheDocument() // 看板区在 Task 5 完整化，此处仅断言任务可见
    expect(screen.getByText('去案头')).toBeInTheDocument()
  })
})
