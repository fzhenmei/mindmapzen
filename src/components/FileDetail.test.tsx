import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import FileDetail from './FileDetail'
import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'
import type { MapInfo } from '../types/files'

const info: MapInfo = {
  name: '周计划',
  mdPath: '/ws/周计划.md',
  relDir: 'docs',
  modifiedAt: Date.now(),
  createdAt: Date.now(),
  size: 120,
}

// 案头详情态预览面板（容器合并改版）：本组件只剩「读文件 + markdown 渲染 + 兜底」；
// 卡头动作钮（含复制路径）已上移 LibraryView 页首，其行为归 LibraryView.test 覆盖
describe('FileDetail', () => {
  beforeEach(async () => {
    useAppStore.setState({ adapter: new MemoryFsAdapter(), workspaceDir: '/ws' })
    await useAppStore.getState().adapter.writeTextFileAtomic('/ws/周计划.md', '# 周计划\n')
  })
  afterEach(cleanup)

  test('渲染选中 md 的真实预览', async () => {
    render(<FileDetail info={info} />)
    expect(await screen.findByTestId('md-preview')).toHaveTextContent('周计划')
  })

  test('读取失败显示「无法预览」兜底', async () => {
    render(<FileDetail info={{ ...info, mdPath: '/ws/不存在.md' }} />)
    expect(await screen.findByText('无法预览')).toBeInTheDocument()
  })
})
