import { render, screen, fireEvent } from '@testing-library/react'
import WelcomeScreen from './WelcomeScreen'

const renderWelcome = () =>
  render(<WelcomeScreen onCreateWorkspace={() => {}} onCloneFromGit={() => {}} />)

// 首次开屏页（M14 官方认证卡）：全屏 grid 居中 + Card w-96 解剖。
// 2026-09 UI 评审 P2-1：原双入口（创建工作区/选择已有文件夹）同一动作（都走 pickDirectory），
// 措辞差异制造无谓选择（Krug「别让我思考」），合并为单主钮「选择工作区文件夹」。
// 2026-09「从 Git 库打开」：恢复双入口——这次两钮是真正不同的动作（选目录 ≠ clone），
// 主次靠 variant 区分（主=默认、次=outline），不违背 P2-1 的「同动作不重复」裁定
describe('开屏页（M14 官方认证卡）', () => {
  test('官方卡解剖：Card w-96 + 居中卡头（印标/标题/副句）+ 主钮落位', () => {
    renderWelcome()

    // 外层 = 全屏 grid 居中壳（官方 authentication 布局）
    const root = screen.getByTestId('welcome-screen')
    expect(root.className).toMatch(/grid/)
    expect(root.className).toMatch(/place-items-center/)
    expect(root.className).toMatch(/min-h-screen/)

    // Card w-96 + 居中卡头：CardTitle text-2xl tracking-tight、CardDescription 副句
    const card = root.querySelector('[data-slot="card"]')!
    expect(card).not.toBeNull()
    expect(card.className).toContain('w-96')
    const header = card.querySelector('[data-slot="card-header"]')!
    expect(header.className).toContain('text-center')
    expect(header.querySelector('svg')).toBeInTheDocument()
    const title = card.querySelector('[data-slot="card-title"]')!
    expect(title).toHaveTextContent('Mind Map Zen')
    expect(title).toHaveClass('text-2xl', 'font-semibold', 'tracking-tight')
    expect(card.querySelector('[data-slot="card-description"]')).toHaveTextContent('想法落成 .md')

    // 主钮 = CardContent 内 size=lg 通栏「选择工作区文件夹」（默认 variant）
    const create = screen.getByTestId('btn-welcome-create')
    expect(create.closest('[data-slot="card-content"]')).not.toBeNull()
    expect(create).toHaveTextContent('选择工作区文件夹')
    expect(create).toHaveAttribute('data-size', 'lg')
    expect(create.className).toContain('w-full')
    expect(screen.queryByTestId('btn-welcome-pick')).not.toBeInTheDocument()
    expect(card.querySelector('[data-slot="card-footer"]')).toBeNull()
  })

  test('次钮「从 Git 库打开」：outline 变体、通栏、CardContent 内主钮之后', () => {
    renderWelcome()
    const clone = screen.getByTestId('btn-welcome-clone')
    expect(clone).toHaveTextContent('从 Git 库打开')
    expect(clone.className).toContain('w-full')
    expect(clone.className).toMatch(/outline/)
    expect(clone.closest('[data-slot="card-content"]')).not.toBeNull()
    // 主钮在前（DOM 顺序 = 视觉顺序）
    expect(screen.getByTestId('btn-welcome-create').compareDocumentPosition(clone)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  test('两入口各自触发：主钮 onCreateWorkspace / 次钮 onCloneFromGit', () => {
    const onCreateWorkspace = vi.fn()
    const onCloneFromGit = vi.fn()
    render(<WelcomeScreen onCreateWorkspace={onCreateWorkspace} onCloneFromGit={onCloneFromGit} />)
    fireEvent.click(screen.getByTestId('btn-welcome-create'))
    expect(onCreateWorkspace).toHaveBeenCalledTimes(1)
    expect(onCloneFromGit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('btn-welcome-clone'))
    expect(onCloneFromGit).toHaveBeenCalledTimes(1)
    expect(onCreateWorkspace).toHaveBeenCalledTimes(1)
  })
})
