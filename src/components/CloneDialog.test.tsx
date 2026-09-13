import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CloneDialog, { type CloneRequest } from './CloneDialog'

/** 默认桩装配：pickDirectory 固定返回 /picked（显式传 null 模拟取消）；onConfirm 记录载荷 */
function setup(over: Partial<{ pickDir: string | null; onConfirm: (req: CloneRequest) => Promise<void> }> = {}) {
  const calls: CloneRequest[] = []
  const pickDirectory = vi.fn(async () => (over.pickDir === undefined ? '/picked' : over.pickDir))
  const onConfirm = over.onConfirm ?? (async (req: CloneRequest) => { calls.push(req) })
  render(<CloneDialog pickDirectory={pickDirectory} onConfirm={onConfirm} onCancel={() => {}} />)
  return { calls, pickDirectory }
}

// 「从 Git 库打开」克隆对话框：URL + 可选凭证 + 位置浏览 + 目标路径预览 +
// busy 锁（克隆是网络长操作，600s 超时兜底在 Rust 侧）
describe('CloneDialog（从 Git 库打开）', () => {
  test('解剖：标题/地址/凭证/位置浏览齐全，确认钮初始禁用（缺 URL 与位置）', () => {
    setup()
    expect(screen.getByText('从 Git 库打开')).toBeInTheDocument()
    expect(screen.getByTestId('clone-url')).toBeInTheDocument()
    expect(screen.getByTestId('clone-user')).toBeInTheDocument()
    expect(screen.getByTestId('clone-pass')).toBeInTheDocument()
    expect(screen.getByTestId('clone-browse')).toHaveTextContent('浏览…')
    expect(screen.getByTestId('btn-confirm')).toBeDisabled()
  })

  test('目标路径实时预览：URL + 浏览选定父目录后拼出 <父目录>/<仓库名>', async () => {
    setup()
    fireEvent.change(screen.getByTestId('clone-url'), { target: { value: 'https://git.local/scm/我的库.git' } })
    // URL 已入、位置未选：预览仍空（repoName 可解析但无父目录）
    expect(screen.getByTestId('clone-target')).toHaveTextContent('')
    fireEvent.click(screen.getByTestId('clone-browse'))
    await waitFor(() => expect(screen.getByTestId('clone-parent')).toHaveTextContent('/picked'))
    expect(screen.getByTestId('clone-target')).toHaveTextContent('将克隆到：/picked/我的库')
    expect(screen.getByTestId('btn-confirm')).toBeEnabled()
  })

  test('浏览取消（返回 null）：不落位置，确认仍禁用', async () => {
    setup({ pickDir: null })
    fireEvent.change(screen.getByTestId('clone-url'), { target: { value: 'https://git.local/repo.git' } })
    fireEvent.click(screen.getByTestId('clone-browse'))
    await waitFor(() => expect(screen.getByTestId('clone-parent')).toHaveTextContent(''))
    expect(screen.getByTestId('btn-confirm')).toBeDisabled()
  })

  test('确认：载荷四元组原样上送（含凭证）', async () => {
    const { calls } = setup()
    fireEvent.change(screen.getByTestId('clone-url'), { target: { value: 'https://git.local/repo.git' } })
    fireEvent.change(screen.getByTestId('clone-user'), { target: { value: 'user' } })
    fireEvent.change(screen.getByTestId('clone-pass'), { target: { value: 'pass' } })
    fireEvent.click(screen.getByTestId('clone-browse'))
    await waitFor(() => expect(screen.getByTestId('btn-confirm')).toBeEnabled())
    fireEvent.click(screen.getByTestId('btn-confirm'))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toEqual({ url: 'https://git.local/repo.git', username: 'user', password: 'pass', parentDir: '/picked' })
  })

  test('onConfirm 抛错：就地显示 error.message，不关框不外溢', async () => {
    setup({
      onConfirm: async () => {
        throw new Error('克隆失败：fatal: 无法访问')
      },
    })
    fireEvent.change(screen.getByTestId('clone-url'), { target: { value: 'https://git.local/repo.git' } })
    fireEvent.click(screen.getByTestId('clone-browse'))
    await waitFor(() => expect(screen.getByTestId('btn-confirm')).toBeEnabled())
    fireEvent.click(screen.getByTestId('btn-confirm'))
    await waitFor(() => expect(screen.getByTestId('dialog-error')).toHaveTextContent('克隆失败：fatal: 无法访问'))
  })

  test('busy 态：克隆中锁按钮并切文案「正在克隆…」，完成后恢复', async () => {
    let release: (() => void) | null = null
    const gate = new Promise<void>((res) => { release = res })
    setup({
      onConfirm: async () => {
        await gate
      },
    })
    fireEvent.change(screen.getByTestId('clone-url'), { target: { value: 'https://git.local/repo.git' } })
    fireEvent.click(screen.getByTestId('clone-browse'))
    await waitFor(() => expect(screen.getByTestId('btn-confirm')).toBeEnabled())
    fireEvent.click(screen.getByTestId('btn-confirm'))
    await waitFor(() => {
      expect(screen.getByTestId('btn-confirm')).toBeDisabled()
      expect(screen.getByTestId('btn-confirm')).toHaveTextContent('正在克隆…')
    })
    release!()
    await waitFor(() => expect(screen.getByTestId('btn-confirm')).toHaveTextContent('克隆'))
  })
})
