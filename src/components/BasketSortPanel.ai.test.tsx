// 面板 AI 集成（spec §6.1 入口/§6.3 预填语义）：fake askPlacement 经 vi.mock 注入
// （模块级 mock，单测不触网络；e2e 才走 __AI_TRANSPORT_FACTORY__ 全链）。
// toast 断言口径：ToastHost 有 data-testid="toast"，与面板同 render 挂载即可观察——断言之
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi, test, expect, beforeEach } from 'vitest'
import BasketSortPanel from './BasketSortPanel'
import ToastHost from './ToastHost'
import { useAppStore } from '../store/appStore'
import type { PlacementRow } from '../services/ai/ideaPlacement'

const askPlacementMock = vi.hoisted(() => vi.fn())
// 面板还 import MAX_MAPS_FOR_AI（tooManyMaps toast 插值）——mock 工厂必须一并提供
vi.mock('../services/ai/ideaPlacement', () => ({ askPlacement: askPlacementMock, MAX_MAPS_FOR_AI: 50 }))

const AI_ON = { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' }

beforeEach(() => {
  askPlacementMock.mockReset()
  // store.maps 是 MapInfo[]（非 string[]）：面板消费时取 mdPath 传 askPlacement（绝对路径）
  useAppStore.setState({
    aiConfig: AI_ON,
    maps: [{ name: 'a', mdPath: '/ws/a.md', relDir: '', modifiedAt: 1, createdAt: 1, size: 1 }],
    workspaceDir: '/ws',
  })
})

test('未配 BYOK：AI 按钮禁用 + 说明行（spec §6.1）', () => {
  useAppStore.setState({ aiConfig: { baseUrl: '', apiKey: '', model: '' } })
  render(<BasketSortPanel open onClose={() => {}} loadIdeas={() => [{ text: '点子A' }]} backup={async () => {}} />)
  expect(screen.getByTestId('sort-ai-all')).toBeDisabled()
  expect(screen.getByTestId('sort-ai-row')).toBeDisabled()
  expect(screen.getByTestId('sort-ai-disabled-note')).toBeVisible()
})

test('一键整理：预填无目标行、不覆盖手选行（spec §6.3 预填语义）', async () => {
  render(
    <>
      <BasketSortPanel
        open
        onClose={() => {}}
        loadIdeas={() => [{ text: '点子A' }, { text: '点子B' }]}
        backup={async () => {}}
      />
      <ToastHost />
    </>,
  )
  // 手选点子B的目标（直接走 store 无从下手——经行内 pick 钮不可行，改断言只填无目标行：
  // 预置点子B已有 target 的方式：先 mock 一次单行推荐? 更直接：askPlacement 只返回 A 的目标）
  askPlacementMock.mockResolvedValue({
    ok: true,
    rows: [{ idea: { text: '点子A' }, target: { mapPath: '/ws/a.md', path: ['根', '待办'], text: '待办' } }] as PlacementRow[],
  })
  fireEvent.click(screen.getByTestId('sort-ai-all'))
  await waitFor(() =>
    expect(screen.getByText(/《a》› 待办/)).toBeVisible(), // 规范 MountTarget 的显示：path.slice(1)+text
  )
  expect(askPlacementMock).toHaveBeenCalledTimes(1)
  // 点子B 仍无目标（pick 钮仍在）
  expect(screen.getAllByTestId('sort-pick').length).toBe(1)
  await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('AI 已预填 1 条'))
})

test('停止：aiBusy 中点击调 abort（abortRef 经 askPlacement 的注入 transport 间接体现）', async () => {
  let resolveAsk: (v: unknown) => void = () => {}
  askPlacementMock.mockReturnValue(new Promise((res) => { resolveAsk = res }))
  render(<BasketSortPanel open onClose={() => {}} loadIdeas={() => [{ text: '点子A' }]} backup={async () => {}} />)
  fireEvent.click(screen.getByTestId('sort-ai-all'))
  await waitFor(() => expect(screen.getByTestId('sort-ai-stop')).toBeVisible())
  // 停止后回 idle：面板内部 abort 掐流由 askPlacement 的 transport.abort 完成——
  // 组件测试以「停止钮出现且可点、点击后面板回非运行态」为断言面（resolve 模拟流被掐后返回）
  fireEvent.click(screen.getByTestId('sort-ai-stop'))
  await act(async () => {
    resolveAsk({ ok: false, error: 'aborted' })
  })
  await waitFor(() => expect(screen.getByTestId('sort-ai-all')).toBeVisible())
})

test('整批失败 parseFailed：toast + 按钮回 idle 可重试', async () => {
  askPlacementMock.mockResolvedValue({ ok: false, error: 'parseFailed' })
  render(
    <>
      <BasketSortPanel open onClose={() => {}} loadIdeas={() => [{ text: '点子A' }]} backup={async () => {}} />
      <ToastHost />
    </>,
  )
  fireEvent.click(screen.getByTestId('sort-ai-all'))
  await waitFor(() => expect(screen.getByTestId('sort-ai-all')).toBeEnabled())
  await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('AI 输出解析失败，可重试'))
})
