import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import SettingsDialog from './SettingsDialog'
import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'

// 设置对话框：关闭回调、工作区行、关于区、功能引导。复制行为两开关已于 2026-09
// 移入砚栏复制钮下拉（ZenBar.test 覆盖），此处守卫设置页不再渲染复制开关。
describe('SettingsDialog', () => {
  beforeEach(() => {
    useAppStore.getState().setAdapter(new MemoryFsAdapter())
    useAppStore.setState({ configPath: '/cfg.json' })
  })
  afterEach(cleanup)

  test('复制行为两开关已移入砚栏，设置页不再渲染', () => {
    render(<SettingsDialog onClose={() => {}} />)
    expect(screen.getByTestId('settings-dialog')).toBeInTheDocument()
    expect(screen.queryByTestId('copy-note-toggle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('copy-links-toggle')).not.toBeInTheDocument()
  })

  test('关闭按钮触发 onClose', () => {
    const onClose = vi.fn()
    render(<SettingsDialog onClose={onClose} />)
    fireEvent.click(screen.getByTestId('settings-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // M5d 更换工作区行：注入回调才渲染；点击触发回调并显示当前工作区路径
  test('更换工作区行：默认隐藏，注入回调后显示路径并可点', () => {
    const onChangeWorkspace = vi.fn()
    const { rerender } = render(<SettingsDialog onClose={() => {}} />)
    expect(screen.queryByTestId('settings-workspace-change')).not.toBeInTheDocument()
    rerender(<SettingsDialog onClose={() => {}} onChangeWorkspace={onChangeWorkspace} />)
    expect(useAppStore.getState().workspaceDir).toBeNull()
    expect(screen.getByText('工作区：未设置')).toBeInTheDocument()
    useAppStore.setState({ workspaceDir: '/ws' })
    // setState 后重渲：行内显示当前工作区路径
    rerender(<SettingsDialog onClose={() => {}} onChangeWorkspace={onChangeWorkspace} />)
    expect(screen.getByText('工作区：/ws')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('settings-workspace-change'))
    expect(onChangeWorkspace).toHaveBeenCalledTimes(1)
  })

  // v0.7.0 退出工作区行：注入回调才渲染；点击触发回调（store/持久化链路由 LibraryView/appStore 测试覆盖）
  test('退出工作区行：默认隐藏，注入回调后显示并可点', () => {
    const onExitWorkspace = vi.fn()
    const { rerender } = render(<SettingsDialog onClose={() => {}} />)
    expect(screen.queryByTestId('settings-workspace-exit')).not.toBeInTheDocument()
    rerender(<SettingsDialog onClose={() => {}} onExitWorkspace={onExitWorkspace} />)
    expect(screen.getByText('退出工作区（回到开屏）')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('settings-workspace-exit'))
    expect(onExitWorkspace).toHaveBeenCalledTimes(1)
  })

  // 关于区（2026-09 版本信息批）：产品名 + 版本号（vite define 注入，源自 package.json）
  // + commit 短哈希；commit 是构建环境值，只断言非空存在不断言具体哈希
  test('关于区：显示产品名、版本号与 commit 短哈希', () => {
    render(<SettingsDialog onClose={() => {}} />)
    const about = screen.getByTestId('about-section')
    expect(about).toHaveTextContent('Mind Map Zen')
    expect(about.textContent).toMatch(new RegExp(`v${__APP_VERSION__}`))
    const hash = __GIT_COMMIT__
    expect(hash.length).toBeGreaterThan(0)
    expect(about).toHaveTextContent(hash)
  })

  // 漫游引导重看入口（spec §6）：点击即激活引导并关闭设置（引导遮罩需要完整视口）
  test('重新观看功能引导：点击后激活引导并关闭设置', async () => {
    useAppStore.setState({ tourActive: false })
    const onClose = vi.fn()
    render(<SettingsDialog onClose={onClose} />)
    fireEvent.click(screen.getByTestId('tour-replay'))
    expect(useAppStore.getState().tourActive).toBe(true)
    expect(onClose).toHaveBeenCalled()
  })

  // i18n（Task 4）：语言三态选择器——切 English 即时生效（无需重启），html lang 同步。
  // userEvent 不可用（项目未装 @testing-library/user-event），沿用本文件 fireEvent 惯例；
  // setLanguagePref 为异步（i18next changeLanguage + load-merge-save），act 排空微任务后再断言
  test('语言选择器:切 English 即时生效(无需重启),标题与版本管理行变英文', async () => {
    render(<SettingsDialog onClose={() => {}} />)
    // 默认中文
    expect(screen.getByText('设置')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('lang-en'))
    await act(async () => {}) // 排空 i18next changeLanguage 与 load-merge-save 微任务后重渲完成
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Version control (auto-commit to workspace git repo)')).toBeInTheDocument()
    // html lang 同步
    expect(document.documentElement.lang).toBe('en')
  })
})
