import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import FileDetail from './FileDetail'
import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'
import { TooltipProvider } from './ui/tooltip'
import type { MapInfo } from '../types/files'

const info: MapInfo = {
  name: '周计划',
  mdPath: '/ws/周计划.md',
  relDir: 'docs',
  modifiedAt: Date.now(),
  createdAt: Date.now(),
  size: 120,
}

// 文件详情卡（2026-09 复制路径批）：操作组含移动/重命名/删除/打开 + 复制路径
// （写剪贴板端口注入，与 EditorView 的 writeClipboard prop 同构）
describe('FileDetail', () => {
  beforeEach(async () => {
    useAppStore.setState({ adapter: new MemoryFsAdapter(), workspaceDir: '/ws' })
    await useAppStore.getState().adapter.writeTextFileAtomic('/ws/周计划.md', '# 周计划\n')
  })
  afterEach(cleanup)

  test('复制路径钮：点击以 mdPath 调剪贴板端口', () => {
    const writeClipboard = vi.fn(async () => {})
    render(
      <TooltipProvider>
        <FileDetail info={info} onBack={() => {}} onAction={() => {}} onCopyPath={writeClipboard} />
      </TooltipProvider>,
    )
    fireEvent.click(screen.getByTestId('btn-copy-path'))
    expect(writeClipboard).toHaveBeenCalledTimes(1)
    expect(writeClipboard).toHaveBeenCalledWith('/ws/周计划.md')
  })
})
