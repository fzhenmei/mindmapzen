// src/views/WorkbenchView.test.tsx
// 挂载模式对齐 LibraryView.test.tsx：真实 zustand store setState 预置 + MemoryFsAdapter。
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'
import { useAppStore } from '../store/appStore'
import { changeUiLanguage } from '../i18n'
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

  test('看板四列分组与跨图跳转：openMap + pendingLocate 置位（spec §5）', async () => {
    await fs.writeTextFileAtomic('/ws/工作/图A.md', '# 图A\n\n## 任务甲 @todo\n\n## 任务乙 @doing\n')
    await fs.writeTextFileAtomic('/ws/工作/图B.md', '# 图B\n\n## 任务丙 @blocked\n')
    const openMap = vi.fn()
    useAppStore.setState({ openMap: openMap as never, pendingLocate: null })
    render(<WorkbenchView />)
    await screen.findByText('任务甲')
    expect(screen.getByTestId('workbench-col-todo').textContent).toContain('任务甲')
    expect(screen.getByTestId('workbench-col-todo').textContent).not.toContain('任务乙')
    expect(screen.getByTestId('workbench-col-doing').textContent).toContain('任务乙')
    expect(screen.getByTestId('workbench-col-blocked').textContent).toContain('任务丙')
    // 点击任务丙卡片（跨图）：openMap 收到图B路径 + pendingLocate 已置文本寻址器（path+text）
    const card = screen.getAllByTestId('workbench-card').find((el) => el.textContent?.includes('任务丙'))!
    await card.click()
    expect(openMap).toHaveBeenCalledWith('/ws/工作/图B.md')
    expect(useAppStore.getState().pendingLocate).not.toBeNull()
  })

  test('failed-bar 标点随语言：词条含冒号，en 侧不渗全角正字法', async () => {
    // 无根标题 → parse ok:false 进 failed（services/workbench 单文件失败口径）
    await fs.writeTextFileAtomic('/ws/工作/坏图.md', '没有根标题的段落\n')
    await fs.writeTextFileAtomic('/ws/工作/另坏图.md', '也没有根标题\n')
    render(<WorkbenchView />)
    expect(await screen.findByTestId('workbench-failed-bar')).toHaveTextContent('2 张图读取失败：坏图、另坏图')
    try {
      await changeUiLanguage('en')
      expect(screen.getByTestId('workbench-failed-bar')).toHaveTextContent('2 map(s) failed to load: 坏图, 另坏图')
    } finally {
      await changeUiLanguage('zh-CN') // 恢复本文件其余用例的 zh 预热
    }
  })

  test('创建工作目录失败：横幅可见（workbench 路由内渲染 error，不吞异常红线）', async () => {
    render(<WorkbenchView />)
    expect(await screen.findByTestId('workbench-empty-create')).toBeInTheDocument()
    vi.spyOn(fs, 'ensureDir').mockRejectedValue(new Error('disk full'))
    await screen.getByTestId('workbench-empty-create').click()
    // 断言可见文本而非 store 置位：error 唯一渲染出口在 LibraryView，本路由须自渲染
    expect(await screen.findByText('创建工作目录失败')).toBeInTheDocument()
  })

  test('建议区：规则建议渲染 + task 级点击跳转（spec §6）', async () => {
    await fs.writeTextFileAtomic('/ws/工作/图A.md', '# 图A\n\n## 进行中事 @doing\n')
    const openMap = vi.fn()
    useAppStore.setState({ openMap: openMap as never, pendingLocate: null })
    render(<WorkbenchView />)
    const sug = await screen.findAllByTestId('workbench-suggestion')
    expect(sug[0]!.textContent).toContain('进行中的事，先收尾')
    expect(sug[0]!.textContent).toContain('进行中事')
    await sug[0]!.click()
    expect(openMap).toHaveBeenCalledWith('/ws/工作/图A.md')
    expect(useAppStore.getState().pendingLocate).not.toBeNull()
  })

  test('最近 chip：recentOpened 渲染 + 点击 openMap（不带 pendingLocate，spec §5）', async () => {
    await fs.writeTextFileAtomic('/ws/工作/图A.md', '# 图A\n\n## 任务 @todo\n')
    await fs.writeTextFileAtomic('/ws/昨日图.md', '# 昨\n')
    const openMap = vi.fn()
    useAppStore.setState({ openMap: openMap as never, recentOpened: ['/ws/昨日图.md'], pendingLocate: null })
    render(<WorkbenchView />)
    const chip = await screen.findByTestId('workbench-recent-chip')
    expect(chip.textContent).toContain('昨日图')
    await chip.click()
    expect(openMap).toHaveBeenCalledWith('/ws/昨日图.md')
    expect(useAppStore.getState().pendingLocate).toBeNull()
  })
})
