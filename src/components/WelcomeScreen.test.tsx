import { render, screen, fireEvent } from '@testing-library/react'
import WelcomeScreen from './WelcomeScreen'

// 首次开屏页（M5d Task 3 / spec §2）：无工作区时的品牌化引导，替代旧 hint 文案
describe('开屏页（M5d）', () => {
  test('渲染印章 logo、标题副句与两个入口', () => {
    render(<WelcomeScreen onCreateWorkspace={() => {}} />)
    expect(screen.getByTestId('welcome-screen')).toBeInTheDocument()
    expect(screen.getByText('Mind Map Zen')).toBeInTheDocument()
    expect(screen.getByText('想法落成 .md')).toBeInTheDocument()
    expect(screen.getByTestId('btn-welcome-create')).toHaveTextContent('创建工作区')
    expect(screen.getByTestId('btn-welcome-pick')).toHaveTextContent('选择已有文件夹')
  })

  test('两入口同一语义：均触发 onCreateWorkspace（pickDirectory 流）', () => {
    const onCreateWorkspace = vi.fn()
    render(<WelcomeScreen onCreateWorkspace={onCreateWorkspace} />)
    fireEvent.click(screen.getByTestId('btn-welcome-create'))
    fireEvent.click(screen.getByTestId('btn-welcome-pick'))
    expect(onCreateWorkspace).toHaveBeenCalledTimes(2)
  })
})
