// src/components/BasketSortLayer.test.tsx —— 整理浮层装配的 backup 端口（终审 M4）：
// 原实现直接 `await checkAndBackup(...)` 丢弃 BackupOutcome（该函数以结果对象返回、不抛），
// 备份真失败时用户无提示、lastBackup 也无记录。改为走 store.backupNow（结果落 lastBackup
// + 刷新仓库状态），未启用时保留会话级一次信息卡
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import type { RefObject } from 'react'
import BasketSortLayer from './BasketSortLayer'
import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'
import { DEFAULT_GIT_CONFIG } from '../types/files'
import { showToast, subscribeToast } from '../services/toast'
import type { MindMapHandle } from '../types/engine'

let fs: MemoryFsAdapter
beforeEach(async () => {
  fs = new MemoryFsAdapter()
  await fs.mkdir('/ws')
  await fs.writeTextFileAtomic('/ws/目标.md', '# 目标\n\n## 甲\n')
  await fs.writeTextFileAtomic('/ws/点子篮子.md', '# 点子篮子\n\n- 点子一\n')
  useAppStore.setState({
    adapter: fs, workspaceDir: '/ws', basketRelPath: '点子篮子.md', basketEngine: null,
    maps: [{ name: '目标', mdPath: '/ws/目标.md', relDir: '', modifiedAt: 2, createdAt: 1, size: 10 }],
    lastBackup: null, gitStatus: { lastCommit: null, aheadCount: null }, gitConfig: { ...DEFAULT_GIT_CONFIG, enabled: true },
  })
})

/** 引擎句柄桩：loadIdeas 只取 renderer.root.nodeData.children（节点实例形态，见 basket.ts 注） */
const mmRef = { current: { renderer: { root: { nodeData: { children: [{ data: { text: '点子一' } }] } } } } } as unknown as RefObject<MindMapHandle | null>

/** 走完一轮「选目标 → 挂载」（backup 端口在批量挂载前被调用） */
async function mountSelected(): Promise<void> {
  render(<BasketSortLayer open onClose={() => {}} mmRef={mmRef} />)
  await userEvent.click(screen.getByTestId('sort-pick'))
  await userEvent.click(await screen.findByTestId('picker-map-目标'))
  await userEvent.click(await screen.findByTestId('picker-node-甲'))
  await userEvent.click(screen.getByTestId('sort-mount-selected'))
  await screen.findByTestId('sort-result')
}

test('启用版本管理：备份走 git 端口且结果落 lastBackup（不丢 BackupOutcome）', async () => {
  const run = vi.fn(async () => ({ ok: true, out: '', err: '' }))
  useAppStore.setState({ gitRun: run })
  await mountSelected()
  await vi.waitFor(() => expect(useAppStore.getState().lastBackup).not.toBeNull())
  expect(run).toHaveBeenCalledWith('/ws', ['rev-parse', '--git-dir']) // 确经 backupNow → checkAndBackup
})

test('未启用版本管理：会话级一次信息卡，不触发备份、lastBackup 保持 null', async () => {
  useAppStore.setState({ gitRun: null, gitConfig: { ...DEFAULT_GIT_CONFIG, enabled: false } })
  const seen: string[] = []
  const off = subscribeToast((toast) => { if (toast !== null) seen.push(toast.text) })
  showToast('') // 清残留
  try {
    await mountSelected()
    await vi.waitFor(() => expect(seen).toHaveLength(1))
    expect(useAppStore.getState().lastBackup).toBeNull()
  } finally {
    off()
  }
})
