import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SettingsDialog from './SettingsDialog'
import { useAppStore } from '../store/appStore'
import { useChatStore } from '../store/chatStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'

// 设置对话框（2026-09 手风琴批）：五分区收进单展开手风琴——默认全收起（Content 不挂载），
// 点分区 trigger 展开；底部固定区为工作区操作与「关于」行。分区 testid 挂 trigger。
// 复制行为两开关已于 2026-09 移入砚栏复制钮下拉（ZenBar.test 覆盖），此处守卫设置页不再渲染。
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

  // 手风琴语义守卫：收起时 Content 不挂载（Radix 默认卸载），点 trigger 展开；单展开互斥
  test('手风琴默认全收起，点分区标题展开且互斥', () => {
    render(<SettingsDialog onClose={() => {}} />)
    expect(screen.queryByTestId('git-enabled-toggle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('set-ai-baseurl')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('git-section'))
    expect(screen.getByTestId('git-enabled-toggle')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('settings-ai-section'))
    expect(screen.getByTestId('set-ai-baseurl')).toBeInTheDocument()
    expect(screen.queryByTestId('git-enabled-toggle')).not.toBeInTheDocument()
  })

  test('关闭按钮触发 onClose', () => {
    const onClose = vi.fn()
    render(<SettingsDialog onClose={onClose} />)
    fireEvent.click(screen.getByTestId('settings-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // M5d 更换工作区行：注入回调才渲染；点击触发回调并显示当前工作区路径（底部固定区，无折叠）
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

  // 关于行（2026-09 手风琴批）：底部留版本短摘要，「关于」钮打开 AboutDialog（详情断言在
  // AboutDialog.test；此处守卫设置窗装配链）
  test('关于行：显示产品名与版本号，「关于」钮打开关于对话框', () => {
    render(<SettingsDialog onClose={() => {}} />)
    const about = screen.getByTestId('about-section')
    expect(about).toHaveTextContent('Mind Map Zen')
    expect(about).toHaveTextContent(`v${__APP_VERSION__}`)
    expect(screen.queryByTestId('about-dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('about-open'))
    expect(screen.getByTestId('about-dialog')).toBeInTheDocument()
    // 关关于回设置：设置窗仍在
    fireEvent.click(screen.getByTestId('about-close'))
    expect(screen.queryByTestId('about-dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('settings-dialog')).toBeInTheDocument()
  })

  // 漫游引导重看入口（spec §6）：经关于对话框触发——点击即激活引导并关闭整个设置栈
  // （引导遮罩需要完整视口）
  test('重新观看功能引导：关于框内点击后激活引导并关闭设置', async () => {
    useAppStore.setState({ tourActive: false })
    const onClose = vi.fn()
    render(<SettingsDialog onClose={onClose} />)
    fireEvent.click(screen.getByTestId('about-open'))
    fireEvent.click(screen.getByTestId('tour-replay'))
    expect(useAppStore.getState().tourActive).toBe(true)
    expect(onClose).toHaveBeenCalled()
  })

  // i18n（Task 4）：语言三态选择器——切 English 即时生效（无需重启），html lang 同步。
  // userEvent 不可用（项目未装 @testing-library/user-event），沿用本文件 fireEvent 惯例；
  // setLanguagePref 为异步（i18next changeLanguage + load-merge-save），act 排空微任务后再断言。
  // 断言 trigger 文案（收起态也可见，不依赖展开）
  test('语言选择器:切 English 即时生效(无需重启),标题与 git 分区标题变英文', async () => {
    render(<SettingsDialog onClose={() => {}} />)
    // 默认中文
    expect(screen.getByText('设置')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('lang-section'))
    fireEvent.click(screen.getByTestId('lang-en'))
    await act(async () => {}) // 排空 i18next changeLanguage 与 load-merge-save 微任务后重渲完成
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByTestId('git-section')).toHaveTextContent('Version control')
    // html lang 同步
    expect(document.documentElement.lang).toBe('en')
  })

  // AI 分区（2026-09 AI Agent v1，spec §1 BYOK）：填写三项保存 → 整包 patch 调 setAiConfig
  // （持久化链路本身由 appStore.test 覆盖，此处守卫对话框装配与收集口径）。
  // harness 对齐本文件既有 fireEvent 惯例
  test('AI 分区：填写三项保存并持久化', async () => {
    const setAiConfig = vi.fn(async () => {})
    useAppStore.setState({ aiConfig: { baseUrl: '', apiKey: '', model: '' }, setAiConfig } as never)
    render(<SettingsDialog onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('settings-ai-section'))
    fireEvent.change(screen.getByTestId('set-ai-baseurl'), { target: { value: 'https://api.deepseek.com/v1' } })
    fireEvent.change(screen.getByTestId('set-ai-key'), { target: { value: 'sk-test' } })
    fireEvent.change(screen.getByTestId('set-ai-model'), { target: { value: 'deepseek-chat' } })
    fireEvent.click(screen.getByTestId('set-ai-save'))
    await waitFor(() =>
      expect(setAiConfig).toHaveBeenCalledWith({
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'sk-test',
        model: 'deepseek-chat',
      }),
    )
  })

  // 保存失败必须有显式出口（吞异常禁令）：setAiConfig 经 fs 端口可 reject（工作区丢失/权限），
  // 失败时渲染 set-ai-error（errors.saveFailed 包 reason），"已保存"提示不出现
  test('AI 分区：保存失败显示错误且不亮已保存', async () => {
    const setAiConfig = vi.fn(async () => {
      throw new Error('workspace gone')
    })
    useAppStore.setState({ aiConfig: { baseUrl: '', apiKey: '', model: '' }, setAiConfig } as never)
    render(<SettingsDialog onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('settings-ai-section'))
    fireEvent.change(screen.getByTestId('set-ai-baseurl'), { target: { value: 'https://api.deepseek.com/v1' } })
    fireEvent.click(screen.getByTestId('set-ai-save'))
    await waitFor(() => expect(screen.getByTestId('set-ai-error')).toBeInTheDocument())
    expect(screen.getByTestId('set-ai-error')).toHaveTextContent('workspace gone')
    expect(screen.queryByText('AI 配置已保存')).not.toBeInTheDocument()
  })

  // ═══ 技能小节（2026-09 skill 接入，spec §4.6/§4.7）：遍历 SKILLS 注册表渲染输入框；
  // onBlur 即存（真实 setSkillApiKey 走 MemoryFsAdapter 持久化链）；「未启用→启用」转变
  // 才推编辑器会话引导 notice（模板句来自 manifest examples） ═══

  test('技能小节：配置 skill key 保存凭据并触发引导 notice', async () => {
    useAppStore.setState({ skillsConfig: {} }) // 跨用例隔离（真实 setSkillApiKey 写内存态）
    useChatStore.getState().reset()
    render(<SettingsDialog onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('settings-ai-section'))
    // 注册表遍历渲染：weread 在列（名称/描述/获取 Key 链接同屏）
    expect(screen.getByLabelText('微信读书')).toBeInTheDocument()
    expect(screen.getByText('搜索书籍、查看书架与笔记划线、浏览书评、阅读统计与推荐')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '获取 API Key' })).toHaveAttribute('href', 'https://weread.qq.com/r/weread-skills')
    fireEvent.change(screen.getByTestId('set-skill-weread'), { target: { value: 'wrk-e2e' } })
    fireEvent.blur(screen.getByTestId('set-skill-weread')) // onBlur 即存
    await waitFor(() => expect(useAppStore.getState().skillsConfig).toEqual({ weread: { apiKey: 'wrk-e2e' } }))
    // 引导 notice 进编辑器会话：文案 + manifest 模板句（前 3 条）
    const msgs = useChatStore.getState().messages
    expect(msgs.some((m) => m.role === 'notice' && m.text.includes('AI 已接入「微信读书」'))).toBe(true)
    expect(msgs.some((m) => m.role === 'notice' && m.actions?.includes('看看我的书架'))).toBe(true)
  })

  test('技能小节：已启用态重复保存不重复触发引导', async () => {
    // 预置已启用（直接走 store：引导是 SettingsDialog 层职责，预置本身不产生 notice）
    await useAppStore.getState().setSkillApiKey('weread', 'wrk-a')
    useChatStore.getState().reset()
    render(<SettingsDialog onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('settings-ai-section'))
    // 打开即可见已配 key（草稿优先、回退已存值）
    expect((screen.getByTestId('set-skill-weread') as HTMLInputElement).value).toBe('wrk-a')
    // 未编辑直接失焦 = 重复保存同值（提交值与显示同口径回退已存，幂等不清凭据）
    fireEvent.focus(screen.getByTestId('set-skill-weread'))
    fireEvent.blur(screen.getByTestId('set-skill-weread'))
    await act(async () => {}) // 排空 setSkillApiKey 持久化微任务
    expect(useAppStore.getState().skillsConfig).toEqual({ weread: { apiKey: 'wrk-a' } })
    expect(useChatStore.getState().messages.filter((m) => m.role === 'notice')).toHaveLength(0) // 无引导
  })
})
