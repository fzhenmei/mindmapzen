import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import BasketSortPanel from './BasketSortPanel'
import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'

let fs: MemoryFsAdapter
beforeEach(async () => {
  fs = new MemoryFsAdapter()
  await fs.mkdir('/ws')
  await fs.writeTextFileAtomic('/ws/目标.md', '# 目标\n\n## 甲\n')
  await fs.writeTextFileAtomic('/ws/点子篮子.md', '# 点子篮子\n\n- 点子一\n\n- 点子二\n')
  useAppStore.setState({
    adapter: fs, workspaceDir: '/ws', basketRelPath: '点子篮子.md', basketEngine: null,
    maps: [{ name: '目标', mdPath: '/ws/目标.md', relDir: '', modifiedAt: 2, createdAt: 1, size: 10 }],
  })
})

test('全流程：选目标 → 挂载 → 目标图写入 + 篮子删除 + 结果面板', async () => {
  const loadIdeas = () => [{ text: '点子一' }, { text: '点子二' }]
  render(<BasketSortPanel open onClose={() => {}} loadIdeas={loadIdeas} backup={async () => {}} />)
  await userEvent.click(screen.getAllByTestId('sort-pick')[0]!)
  await userEvent.click(await screen.findByTestId('picker-map-目标'))
  await userEvent.click(await screen.findByTestId('picker-node-甲'))
  // 选中后该行的「选择目标…」按钮消失（目标列变为《目标》› 甲 按钮）；未选行仍可继续选。
  // 简报原文是 queryAllByTestId('sort-pick') 长度 0——与本行注释/参考实现自相矛盾（本例 2 行
  // 只选了第 1 行，应余 1 个按钮），故按注释口径改为逐行断言（更严：钉住是哪一行变了）
  const rowItems = screen.getAllByTestId('sort-row')
  expect(within(rowItems[0]!).queryByTestId('sort-pick')).toBeNull()
  expect(within(rowItems[1]!).getByTestId('sort-pick')).toBeVisible()
  await userEvent.click(screen.getByTestId('sort-mount-selected'))
  await vi.waitFor(async () => {
    expect(await fs.readTextFile('/ws/目标.md')).toContain('点子一')
  })
  expect(await fs.readTextFile('/ws/点子篮子.md')).not.toContain('点子一')
  expect(await screen.findByTestId('sort-result')).toBeVisible()
})

test('撤销本次挂载：目标图节点移除、篮子恢复', async () => {
  const loadIdeas = () => [{ text: '点子一' }]
  render(<BasketSortPanel open onClose={() => {}} loadIdeas={loadIdeas} backup={async () => {}} />)
  await userEvent.click(screen.getAllByTestId('sort-pick')[0]!)
  await userEvent.click(await screen.findByTestId('picker-map-目标'))
  await userEvent.click(await screen.findByTestId('picker-node-甲'))
  await userEvent.click(screen.getByTestId('sort-mount-selected'))
  await screen.findByTestId('sort-result')
  await userEvent.click(screen.getByTestId('sort-undo'))
  await vi.waitFor(async () => {
    expect(await fs.readTextFile('/ws/目标.md')).not.toContain('点子一')
  })
  expect(await fs.readTextFile('/ws/点子篮子.md')).toContain('点子一')
})

test('挂载前调用一次 backup（涉及图备份）', async () => {
  const backup = vi.fn(async () => {})
  render(<BasketSortPanel open onClose={() => {}} loadIdeas={() => [{ text: 'x' }]} backup={backup} />)
  await userEvent.click(screen.getAllByTestId('sort-pick')[0]!)
  await userEvent.click(await screen.findByTestId('picker-map-目标'))
  await userEvent.click(await screen.findByTestId('picker-node-甲'))
  await userEvent.click(screen.getByTestId('sort-mount-selected'))
  await vi.waitFor(() => expect(backup).toHaveBeenCalledTimes(1))
})

// 超简报用例：逐条独立成败（spec §4.5「批量：逐条串行、逐条独立成败；结果面板列出失败行与原因，
// 成功行移出清单」）——一条落盘一条图失联：成功不因失败回滚，失败行留在清单供改选重试
test('逐条独立成败：一条成功一条图失联，失败行留清单并给出原因', async () => {
  await fs.writeTextFileAtomic('/ws/目标二.md', '# 目标二\n\n## 乙\n')
  useAppStore.setState({
    maps: [
      { name: '目标', mdPath: '/ws/目标.md', relDir: '', modifiedAt: 2, createdAt: 1, size: 10 },
      { name: '目标二', mdPath: '/ws/目标二.md', relDir: '', modifiedAt: 2, createdAt: 1, size: 10 },
    ],
  })
  render(<BasketSortPanel open onClose={() => {}} loadIdeas={() => [{ text: '点子一' }, { text: '点子二' }]} backup={async () => {}} />)
  await userEvent.click(screen.getAllByTestId('sort-pick')[0]!)
  await userEvent.click(await screen.findByTestId('picker-map-目标'))
  await userEvent.click(await screen.findByTestId('picker-node-甲'))
  await userEvent.click(screen.getAllByTestId('sort-pick')[0]!) // 剩下未选的行（点子二）
  await userEvent.click(await screen.findByTestId('picker-map-目标二'))
  await userEvent.click(await screen.findByTestId('picker-node-乙'))
  // 挂载前目标图被外部删除（图级失联 → mapMissing）
  await fs.remove('/ws/目标二.md')
  await userEvent.click(screen.getByTestId('sort-mount-selected'))
  const result = await screen.findByTestId('sort-result')
  expect(within(result).getByText('成功 1 条')).toBeVisible()
  expect(within(result).getByText(/目标图已不存在/)).toBeVisible()
  expect(await fs.readTextFile('/ws/目标.md')).toContain('点子一')
  expect(screen.getAllByTestId('sort-row')).toHaveLength(1)
  expect(screen.getByTestId('sort-row')).toHaveTextContent('点子二')
})

// 超简报用例：挂载成功但篮子清理失败（spec §4.5「删除失败 → 该条标记 mountedButNotRemoved
// （目标图已有，用户可手动清篮子），不静默」）——不得谎报全成功
test('挂载成功但篮子写入失败：该条列「已挂载但篮子未清理」', async () => {
  const origWrite = fs.writeTextFileAtomic.bind(fs)
  fs.writeTextFileAtomic = async (p: string, c: string): Promise<void> => {
    if (p === '/ws/点子篮子.md') throw new Error('磁盘错误')
    await origWrite(p, c)
  }
  render(<BasketSortPanel open onClose={() => {}} loadIdeas={() => [{ text: '点子一' }]} backup={async () => {}} />)
  await userEvent.click(screen.getAllByTestId('sort-pick')[0]!)
  await userEvent.click(await screen.findByTestId('picker-map-目标'))
  await userEvent.click(await screen.findByTestId('picker-node-甲'))
  await userEvent.click(screen.getByTestId('sort-mount-selected'))
  const result = await screen.findByTestId('sort-result')
  expect(within(result).getByText('成功 1 条')).toBeVisible()
  expect(within(result).getByText(/已挂载但篮子未清理/)).toBeVisible()
  expect(await fs.readTextFile('/ws/目标.md')).toContain('点子一')
  expect(await fs.readTextFile('/ws/点子篮子.md')).toContain('点子一') // 篮子原样（用户可手动处置）
  expect(screen.getAllByTestId('sort-row')).toHaveLength(1) // 该行留在清单
})

// 超简报用例：清除已选目标（spec §4.3「已选 → 《图名》› 节点路径（可点击重选 / 清除）」）。
// 无此出口则选错目标的行只能改选、不能退回未选态，「挂载全部已选」必然把它一起挂走
test('清除已选目标：该行回到未选态，不计入「挂载全部已选」', async () => {
  render(<BasketSortPanel open onClose={() => {}} loadIdeas={() => [{ text: '点子一' }]} backup={async () => {}} />)
  await userEvent.click(screen.getAllByTestId('sort-pick')[0]!)
  await userEvent.click(await screen.findByTestId('picker-map-目标'))
  await userEvent.click(await screen.findByTestId('picker-node-甲'))
  expect(screen.getByTestId('sort-mount-selected')).toBeEnabled()
  await userEvent.click(screen.getByTestId('sort-clear'))
  expect(await screen.findByTestId('sort-pick')).toBeVisible()
  expect(screen.getByTestId('sort-mount-selected')).toBeDisabled()
})
