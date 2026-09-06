import { render, screen, fireEvent } from '@testing-library/react'
import WelcomeScreen from './WelcomeScreen'

// 首次开屏页（M5d / M14 spec §4 官方 authentication 模式）：全屏 grid 居中 + Card w-96 解剖。
// 2026-09 UI 评审 P2-1：原双入口（创建工作区/选择已有文件夹）同一动作（都走 pickDirectory），
// 措辞差异制造无谓选择（Krug「别让我思考」），合并为单主钮「选择工作区文件夹」
describe('开屏页（M14 官方认证卡）', () => {
  test('官方卡解剖：Card w-96 + 居中卡头（印标/标题/副句）+ 单主钮落位', () => {
    render(<WelcomeScreen onCreateWorkspace={() => {}} />)

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

    // 单主钮 = CardContent 内 size=lg 通栏「选择工作区文件夹」；无次钮（CardFooter 不渲染）
    const create = screen.getByTestId('btn-welcome-create')
    expect(create.closest('[data-slot="card-content"]')).not.toBeNull()
    expect(create).toHaveTextContent('选择工作区文件夹')
    expect(create).toHaveAttribute('data-size', 'lg')
    expect(create.className).toContain('w-full')
    expect(screen.queryByTestId('btn-welcome-pick')).not.toBeInTheDocument()
    expect(card.querySelector('[data-slot="card-footer"]')).toBeNull()
  })

  test('唯一入口触发 onCreateWorkspace（pickDirectory 流）', () => {
    const onCreateWorkspace = vi.fn()
    render(<WelcomeScreen onCreateWorkspace={onCreateWorkspace} />)
    fireEvent.click(screen.getByTestId('btn-welcome-create'))
    expect(onCreateWorkspace).toHaveBeenCalledTimes(1)
  })
})
