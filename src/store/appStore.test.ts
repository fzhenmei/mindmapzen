import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import { useAppStore } from './appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'
import { DEFAULT_COPY_SETTINGS } from '../types/files'

let fs: MemoryFsAdapter
beforeEach(async () => {
  fs = new MemoryFsAdapter()
  await fs.writeTextFileAtomic('/ws/已有.md', '# 旧图\n')
  const s = useAppStore.getState()
  s.setAdapter(fs)
  useAppStore.setState({ route: 'library', workspaceDir: null, maps: [], currentMdPath: null, dirty: false, error: null, themePref: 'auto', resolvedTheme: 'light', languagePref: 'auto', resolvedLanguage: 'zh-CN', settings: { ...DEFAULT_COPY_SETTINGS }, sessionRecent: [], recentOpened: [], mapTabs: [], favorites: [], librarySort: 'modified', tourActive: false, tourStep: 0, tourDone: false , aiAdvice: null, appDialog: null, pendingWorkspaceAction: null, pickDirPort: null, lastNewMapDir: '', basketRelPath: null, basketEngine: null })
})

describe('appStore', () => {
  test('setWorkspace 建立工作区并刷新列表', async () => {
    await useAppStore.getState().setWorkspace('/ws')
    expect(useAppStore.getState().workspaceDir).toBe('/ws')
    expect(useAppStore.getState().maps.map((m) => m.name)).toEqual(['已有'])
  })

  // v0.7.0 验收：设置页「退出工作区（回到开屏）」的 store 面——清内存态 + load-merge-save 持久化 null
  test('exitWorkspace 清工作区内存态并持久化 workspaceDir:null（其他字段保留）', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().setWorkspace('/ws')
    await useAppStore.getState().setPreferredLayout('logic') // 预置另一字段：合并保存不得覆盖
    await useAppStore.getState().openMap('/ws/已有.md')
    await useAppStore.getState().exitWorkspace()
    const s = useAppStore.getState()
    expect(s.workspaceDir).toBeNull()
    expect(s.maps).toEqual([])
    expect(s.selectedDir).toBe('')
    expect(s.currentMdPath).toBeNull()
    const cfg = JSON.parse(await fs.readTextFile('/cfg.json'))
    expect(cfg.workspaceDir).toBeNull()
    expect(cfg.lastOpened).toBeNull()
    expect(cfg.preferredLayout).toBe('logic')
    // 退出后 init 停在开屏（文件库态，不因残留指针劫持进编辑器）
    await useAppStore.getState().init()
    expect(useAppStore.getState().route).toBe('library')
    expect(useAppStore.getState().workspaceDir).toBeNull()
  })

  test('init 无配置时停在文件库', async () => {
    await useAppStore.getState().init()
    expect(useAppStore.getState().route).toBe('library')
  })

  // v2.4 验收：不自动回上次导图（lastOpened 不劫持进编辑器；上次内容在欢迎页「最近打开」可达）。
  // 2026-09 画布三态 M3：工作台并入案头（DeskOverview 挂欢迎页），启动落点恒案头——
  // 核心口径不变（落点不是编辑器）
  test('init 有 lastOpened 也不回编辑器，落案头，booted 置位', async () => {
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: '/ws', lastOpened: '/ws/已有.md' }))
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().init()
    expect(useAppStore.getState().route).toBe('library')
    expect(useAppStore.getState().booted).toBe(true)
  })

  test('createAndOpen 创建文件并进入编辑器', async () => {
    await useAppStore.getState().setWorkspace('/ws')
    await useAppStore.getState().createAndOpen('新图')
    const s = useAppStore.getState()
    expect(s.route).toBe('editor')
    expect(s.currentMdPath).toBe('/ws/新图.md')
    expect(await fs.readTextFile('/ws/新图.md')).toBe('# 新图\n')
  })

  test('createAndOpen 重名抛中文错误（M16 起抛错语义，由对话框就地显示）', async () => {
    await useAppStore.getState().setWorkspace('/ws')
    await expect(useAppStore.getState().createAndOpen('已有')).rejects.toThrow('已存在同名导图')
    expect(useAppStore.getState().route).toBe('library')
  })

  // 2026-09 新建导图目录选择：createAndOpen 记住 relDir（含根 ''），cfg.json 持久化，init 装载
  test('createAndOpen relDir 记入 lastNewMapDir 并持久化，init 装载（重启仍记得）', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().setWorkspace('/ws')
    await fs.mkdir('/ws/项目')
    await useAppStore.getState().createAndOpen('子图', undefined, '项目')
    expect(useAppStore.getState().lastNewMapDir).toBe('项目')
    expect(JSON.parse(await fs.readTextFile('/cfg.json')).lastNewMapDir).toBe('项目')
    await useAppStore.getState().init()
    expect(useAppStore.getState().lastNewMapDir).toBe('项目')
  })

  test('markDirty/clearDirty 与 backToLibrary', async () => {
    await useAppStore.getState().setWorkspace('/ws')
    await useAppStore.getState().openMap('/ws/已有.md')
    useAppStore.getState().markDirty()
    expect(useAppStore.getState().dirty).toBe(true)
    await useAppStore.getState().backToLibrary()
    const s = useAppStore.getState()
    expect(s.route).toBe('library')
    expect(s.dirty).toBe(false)
    expect(s.currentMdPath).toBeNull()
  })

  // 2026-09 导航系统 spec §3 R1 → 画布三态 M3（工作台并入案头）:exitEditor 不再有来路
  // 分派,两空间收敛后返回恒回案头（refreshMaps + 清编辑态）
  describe('导航返回（两空间）', () => {
    test('exitEditor 恒回案头:route=library、清编辑态、refreshMaps 被调', async () => {
      // 覆盖桩须即用即还（同「设置全局化」describe 的 originalExitWorkspace 先例）:
      // zustand setState 浅拷贝会把桩带进后续用例,断言失败即泄漏
      const originalRefreshMaps = useAppStore.getState().refreshMaps
      const refreshMaps = vi.fn(originalRefreshMaps)
      useAppStore.setState({ refreshMaps })
      try {
        await useAppStore.getState().setWorkspace('/ws')
        await useAppStore.getState().openMap('/ws/已有.md')
        expect(useAppStore.getState().route).toBe('editor')
        await useAppStore.getState().exitEditor()
        const s = useAppStore.getState()
        expect(s.route).toBe('library')
        expect(s.currentMdPath).toBeNull()
        expect(s.dirty).toBe(false)
        expect(refreshMaps).toHaveBeenCalled()
      } finally {
        useAppStore.setState({ refreshMaps: originalRefreshMaps })
      }
    })
  })

  // 2026-09 导航系统 spec §6:设置全局化——App 级对话框态 + 工作区动作安全网
  describe('设置全局化', () => {
    // exitWorkspace 覆盖桩的兜底恢复:zustand setState 浅拷贝会把桩带进后续 state 对象,
    // 只在测试末尾恢复不够(断言失败即泄漏),afterEach 无条件还原原始函数
    const originalExitWorkspace = useAppStore.getState().exitWorkspace
    afterEach(() => {
      useAppStore.setState({ exitWorkspace: originalExitWorkspace })
    })

    test('openAppDialog/closeAppDialog 开合设置与历史框', () => {
      useAppStore.getState().openAppDialog('settings')
      expect(useAppStore.getState().appDialog).toBe('settings')
      useAppStore.getState().openAppDialog('history')
      expect(useAppStore.getState().appDialog).toBe('history')
      useAppStore.getState().closeAppDialog()
      expect(useAppStore.getState().appDialog).toBeNull()
    })

    test('requestWorkspaceAction 编辑器脏态:关框并记 pending(不立即执行)', async () => {
      await useAppStore.getState().setWorkspace('/ws')
      useAppStore.setState({ route: 'editor', dirty: true, appDialog: 'settings' })
      useAppStore.getState().requestWorkspaceAction('exit')
      expect(useAppStore.getState().appDialog).toBeNull()
      expect(useAppStore.getState().pendingWorkspaceAction).toBe('exit')
      expect(useAppStore.getState().workspaceDir).toBe('/ws') // 未动
    })

    // 终审修复:编辑器路由不分脏净统一记 pending——AI 回合流式窗口内 dirty 尚未置位,
    // 干净图直通会绕过 EditorView 安全网(chatStore.reset 不 abort 在途流)
    test('requestWorkspaceAction 编辑器干净态:同样记 pending(不立即执行)', async () => {
      await useAppStore.getState().setWorkspace('/ws')
      useAppStore.setState({ route: 'editor', dirty: false, appDialog: 'settings' })
      useAppStore.getState().requestWorkspaceAction('exit')
      expect(useAppStore.getState().appDialog).toBeNull()
      expect(useAppStore.getState().pendingWorkspaceAction).toBe('exit')
      expect(useAppStore.getState().workspaceDir).toBe('/ws') // 未动
    })

    test('requestWorkspaceAction 非编辑器路由:直接执行 exit(清工作区)', async () => {
      await useAppStore.getState().setWorkspace('/ws')
      useAppStore.setState({ route: 'library', appDialog: 'settings' })
      useAppStore.getState().requestWorkspaceAction('exit')
      await waitFor(() => expect(useAppStore.getState().workspaceDir).toBeNull())
      expect(useAppStore.getState().appDialog).toBeNull()
    })

    // Important 修复轮:exit 分支包 try/catch——exitWorkspace(配置 IO)reject 时走全局
    // 横幅留线索,不再 unhandled rejection(不吞异常约束);vitest 把 unhandled rejection
    // 记为错误,本用例通过即证明出口存在
    test('requestWorkspaceAction exit 失败:走全局横幅不吞异常', async () => {
      await useAppStore.getState().setWorkspace('/ws')
      useAppStore.setState({ exitWorkspace: async () => { throw new Error('退出故障') }, route: 'library', appDialog: 'settings' })
      useAppStore.getState().requestWorkspaceAction('exit')
      await waitFor(() => expect(useAppStore.getState().error).toContain('退出故障'))
    })

    test('executeWorkspaceAction change:选目录后清编辑态落案头并切换', async () => {
      await useAppStore.getState().setWorkspace('/ws')
      useAppStore.setState({ route: 'editor', currentMdPath: '/ws/已有.md', dirty: true })
      useAppStore.getState().setPickDirPort(async () => '/new-ws')
      await useAppStore.getState().executeWorkspaceAction('change')
      const s = useAppStore.getState()
      expect(s.workspaceDir).toBe('/new-ws')
      expect(s.route).toBe('library')
      expect(s.currentMdPath).toBeNull()
      expect(s.dirty).toBe(false)
    })

    test('executeWorkspaceAction change:取消选择(端口返 null)留在原地', async () => {
      await useAppStore.getState().setWorkspace('/ws')
      useAppStore.setState({ route: 'editor', currentMdPath: '/ws/已有.md' })
      useAppStore.getState().setPickDirPort(async () => null)
      await useAppStore.getState().executeWorkspaceAction('change')
      expect(useAppStore.getState().route).toBe('editor')
      expect(useAppStore.getState().currentMdPath).toBe('/ws/已有.md')
      expect(useAppStore.getState().workspaceDir).toBe('/ws')
    })

    test('executeWorkspaceAction change:端口抛错走全局横幅不吞异常', async () => {
      await useAppStore.getState().setWorkspace('/ws')
      useAppStore.getState().setPickDirPort(async () => {
        throw new Error('端口故障')
      })
      await useAppStore.getState().executeWorkspaceAction('change')
      expect(useAppStore.getState().error).toContain('端口故障')
    })
  })
})

// 快速切换（v2.5 编辑器内切换导图）：sessionRecent = 会话内打开 MRU（内存态，不落盘），
// Ctrl+Tab ping-pong 的数据源（「上一张」= 首个 ≠ 当前图的项）
describe('sessionRecent（会话内打开 MRU）', () => {
  test('openMap 置顶去重维护', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().openMap('/ws/a.md')
    await useAppStore.getState().openMap('/ws/b.md')
    expect(useAppStore.getState().sessionRecent).toEqual(['/ws/b.md', '/ws/a.md'])
    await useAppStore.getState().openMap('/ws/a.md') // 重复打开：去重置顶
    expect(useAppStore.getState().sessionRecent).toEqual(['/ws/a.md', '/ws/b.md'])
  })
  test('createAndOpen 记入 sessionRecent', async () => {
    await useAppStore.getState().setWorkspace('/ws')
    await useAppStore.getState().createAndOpen('新图')
    expect(useAppStore.getState().sessionRecent).toEqual(['/ws/新图.md'])
  })
  test('createAndOpen 维护 recentOpened 并持久化（新建即最近，Ctrl+P 候选含新图）', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().setWorkspace('/ws')
    await useAppStore.getState().createAndOpen('新图')
    expect(useAppStore.getState().recentOpened).toEqual(['/ws/新图.md'])
    const cfg = JSON.parse(await fs.readTextFile('/cfg.json'))
    expect(cfg.recentOpened).toEqual(['/ws/新图.md'])
  })
  test('exitWorkspace 清空（换工作区后路径无意义）', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().openMap('/ws/已有.md')
    await useAppStore.getState().exitWorkspace()
    expect(useAppStore.getState().sessionRecent).toEqual([])
  })
})

// 打开失败清理（2026-09 优雅恢复）：文件读不到（被删/移动/权限）时移出最近清单——
// recentOpened 持久化 + sessionRecent 内存（Ctrl+Tab 数据源）；解析失败不清理（文件仍在）
describe('aiAdvice（工作台 AI 建议缓存，2026-09-14）', () => {
  test('setAiAdvice 即时生效 + load-merge-save 持久化；null 覆盖清除', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().setPreferredLayout('logic') // 预置另一字段：合并保存不得覆盖
    const advice = { text: '建议正文', at: 1700000000000, fingerprint: 'fp1' }
    await useAppStore.getState().setAiAdvice(advice)
    expect(useAppStore.getState().aiAdvice).toEqual(advice)
    const cfg = JSON.parse(await fs.readTextFile('/cfg.json'))
    expect(cfg.aiAdvice).toEqual(advice)
    expect(cfg.preferredLayout).toBe('logic') // 合并未覆盖他人
    await useAppStore.getState().setAiAdvice(null)
    expect(useAppStore.getState().aiAdvice).toBeNull()
    expect(JSON.parse(await fs.readTextFile('/cfg.json')).aiAdvice).toBeNull()
  })
})

describe('dropRecent（打开失败清理）', () => {
  test('从 recentOpened 与 sessionRecent 移除并持久化', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().openMap('/ws/a.md')
    await useAppStore.getState().openMap('/ws/b.md')
    await useAppStore.getState().dropRecent('/ws/b.md')
    const s = useAppStore.getState()
    expect(s.recentOpened).toEqual(['/ws/a.md'])
    expect(s.sessionRecent).toEqual(['/ws/a.md'])
    const cfg = JSON.parse(await fs.readTextFile('/cfg.json'))
    expect(cfg.recentOpened).toEqual(['/ws/a.md'])
  })
  test('清单中不存在的路径 no-op（不写盘不报错）', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().openMap('/ws/a.md')
    await useAppStore.getState().dropRecent('/ws/无此路径.md')
    expect(useAppStore.getState().recentOpened).toEqual(['/ws/a.md'])
    expect(useAppStore.getState().sessionRecent).toEqual(['/ws/a.md'])
  })
})

// 顶部导图胶囊条（2026-09 鼠标流切换）：mapTabs = 会话内 tab 稳定序（内存态不落盘）。
// 区别于 recentOpened/sessionRecent 的 MRU 置顶（切换即跳动，连点翻图时鼠标记忆失效）：
// 已在列不重排、新开尾部追加，胶囊位置恒定防误触；init 自 recentOpened 初始化——
// 重启后胶囊仍在（跨会话保留口径），顺序取上次的 MRU 序
describe('mapTabs（会话内 tab 稳定序——顶部胶囊条数据源）', () => {
  test('openMap 尾部追加、重复打开不重排（稳定序，区别于 sessionRecent 置顶）', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().openMap('/ws/a.md')
    await useAppStore.getState().openMap('/ws/b.md')
    expect(useAppStore.getState().mapTabs).toEqual(['/ws/a.md', '/ws/b.md'])
    await useAppStore.getState().openMap('/ws/a.md') // 重复打开：位置不动
    expect(useAppStore.getState().mapTabs).toEqual(['/ws/a.md', '/ws/b.md'])
  })
  test('createAndOpen 新图记入尾部（新建即打开）', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().openMap('/ws/a.md')
    await useAppStore.getState().setWorkspace('/ws')
    await useAppStore.getState().createAndOpen('新图')
    expect(useAppStore.getState().mapTabs).toEqual(['/ws/a.md', '/ws/新图.md'])
  })
  test('init 自 recentOpened 初始化（跨会话保留）', async () => {
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: '/ws', recentOpened: ['/ws/b.md', '/ws/a.md'] }))
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().init()
    expect(useAppStore.getState().mapTabs).toEqual(['/ws/b.md', '/ws/a.md'])
  })
  test('超 5 淘汰最早（头部，2026-09 用户裁定上限 5）', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    for (let i = 0; i < 6; i++) await useAppStore.getState().openMap(`/ws/${i}.md`)
    const tabs = useAppStore.getState().mapTabs
    expect(tabs).toHaveLength(5)
    expect(tabs[0]).toBe('/ws/1.md') // 最早打开的让位
    expect(tabs[4]).toBe('/ws/5.md')
  })
  test('dropRecent 一并过滤（打开失败移出胶囊条）', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().openMap('/ws/a.md')
    await useAppStore.getState().openMap('/ws/b.md')
    await useAppStore.getState().dropRecent('/ws/b.md')
    expect(useAppStore.getState().mapTabs).toEqual(['/ws/a.md'])
  })
  test('exitWorkspace 清空（换工作区后路径无意义，同 sessionRecent）', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().openMap('/ws/已有.md')
    await useAppStore.getState().exitWorkspace()
    expect(useAppStore.getState().mapTabs).toEqual([])
  })
})

describe('preferredLayout（验收轮三）', () => {
  test('setPreferredLayout 更新状态并持久化', async () => {
    useAppStore.getState().setPreferredLayout('org')
    await waitFor(() => expect(useAppStore.getState().preferredLayout).toBe('org'))
    const cfg = JSON.parse(await (useAppStore.getState().adapter as MemoryFsAdapter).readTextFile('/cfg.json'))
    expect(cfg.preferredLayout).toBe('org')
  })
  test('createAndOpen 用偏好布局建 sidecar', async () => {
    await useAppStore.getState().setWorkspace('/ws')
    await useAppStore.getState().setPreferredLayout('logic')
    await useAppStore.getState().createAndOpen('偏好图')
    const sc = JSON.parse(await (useAppStore.getState().adapter as MemoryFsAdapter).readTextFile('/ws/偏好图.zen.json'))
    expect(sc.layout).toBe('logic')
  })
})

describe('theme（M4 禅意视觉）', () => {
  test('setThemePref 持久化并应用 document 主题', async () => {
    await useAppStore.getState().setThemePref('dark')
    expect(useAppStore.getState().themePref).toBe('dark')
    expect(useAppStore.getState().resolvedTheme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    const cfg = JSON.parse(await (useAppStore.getState().adapter as MemoryFsAdapter).readTextFile('/cfg.json'))
    expect(cfg.theme).toBe('dark')
  })
  test('init 读配置的显式主题', async () => {
    await useAppStore.getState().adapter.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: null, lastOpened: null, preferredLayout: null, theme: 'light' }))
    await useAppStore.getState().init()
    expect(useAppStore.getState().themePref).toBe('light')
  })
})

describe('language（2026-09 i18n 界面语言）', () => {
  test('setLanguagePref:切 en 即时生效并落盘,切回 auto 归系统', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().init()
    await useAppStore.getState().setLanguagePref('en')
    expect(useAppStore.getState().languagePref).toBe('en')
    expect(useAppStore.getState().resolvedLanguage).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    const cfg = JSON.parse(await (useAppStore.getState().adapter as MemoryFsAdapter).readTextFile('/cfg.json'))
    expect(cfg.language).toBe('en')
    await useAppStore.getState().setLanguagePref('auto')
    expect(useAppStore.getState().languagePref).toBe('auto')
    // jsdom navigator.language 默认 en-US → auto 归系统解析为 en
    expect(useAppStore.getState().resolvedLanguage).toBe('en')
  })
})

describe('previewOutline（预览大纲三态偏好）', () => {
  test('setPreviewOutline 更新状态并 load-merge-save 持久化', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().setPreviewOutline('off')
    expect(useAppStore.getState().previewOutline).toBe('off')
    const cfg = JSON.parse(await (useAppStore.getState().adapter as MemoryFsAdapter).readTextFile('/cfg.json'))
    expect(cfg.previewOutline).toBe('off')
  })
  test('init 读配置的 previewOutline（缺失回退 auto）', async () => {
    await useAppStore.getState().adapter.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: null, previewOutline: 'on' }))
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().init()
    expect(useAppStore.getState().previewOutline).toBe('on')
    await useAppStore.getState().adapter.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: null }))
    await useAppStore.getState().init()
    expect(useAppStore.getState().previewOutline).toBe('auto')
  })
})

describe('settings（M5b Task 4：复制行为）', () => {
  test('初始默认 {copyIncludeLinks:true, copyIncludeBody:true, copyIncludeIconStatus:false}（2026-09 粘 AI 防干扰默认剥图标状态）', () => {
    expect(useAppStore.getState().settings).toEqual(DEFAULT_COPY_SETTINGS)
    expect(DEFAULT_COPY_SETTINGS).toEqual({ copyIncludeLinks: true, copyIncludeBody: true, copyIncludeIconStatus: false })
  })
  test('init 读配置的 settings', async () => {
    await useAppStore.getState().adapter.writeTextFileAtomic('/cfg.json', JSON.stringify({ settings: { copyIncludeLinks: false } }))
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().init()
    expect(useAppStore.getState().settings).toEqual({ copyIncludeLinks: false, copyIncludeBody: true, copyIncludeIconStatus: false })
  })
  test('旧配置含 copyIncludeNote 键：加载不炸且静默忽略（引用块已是正文，「剥备注」语义消失）', async () => {
    await useAppStore.getState().adapter.writeTextFileAtomic('/cfg.json', JSON.stringify({ settings: { copyIncludeNote: true, copyIncludeLinks: false } }))
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().init()
    expect(useAppStore.getState().settings).toEqual({ copyIncludeLinks: false, copyIncludeBody: true, copyIncludeIconStatus: false })
  })
  test('旧配置含 copyIncludeNote 键：setSetting 落盘不写回（load-merge-save 不使退役键复活）', async () => {
    await useAppStore.getState().adapter.writeTextFileAtomic('/cfg.json', JSON.stringify({ settings: { copyIncludeNote: true, copyIncludeLinks: true } }))
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().setSetting('copyIncludeBody', false)
    const cfg = JSON.parse(await (useAppStore.getState().adapter as MemoryFsAdapter).readTextFile('/cfg.json'))
    expect(cfg.settings).toEqual({ copyIncludeLinks: true, copyIncludeBody: false, copyIncludeIconStatus: false })
    expect(cfg.settings).not.toHaveProperty('copyIncludeNote')
  })
  test('setSetting 更新状态并 load-merge-save 持久化（单字段不覆盖另一字段）', async () => {
    useAppStore.setState({ configPath: '/cfg.json', settings: { ...DEFAULT_COPY_SETTINGS } })
    await useAppStore.getState().setSetting('copyIncludeBody', false)
    expect(useAppStore.getState().settings).toEqual({ copyIncludeLinks: true, copyIncludeBody: false, copyIncludeIconStatus: false })
    const cfg = JSON.parse(await (useAppStore.getState().adapter as MemoryFsAdapter).readTextFile('/cfg.json'))
    expect(cfg.settings).toEqual({ copyIncludeLinks: true, copyIncludeBody: false, copyIncludeIconStatus: false })
    await useAppStore.getState().setSetting('copyIncludeLinks', false)
    const cfg2 = JSON.parse(await (useAppStore.getState().adapter as MemoryFsAdapter).readTextFile('/cfg.json'))
    expect(cfg2.settings).toEqual({ copyIncludeLinks: false, copyIncludeBody: false, copyIncludeIconStatus: false })
    expect(useAppStore.getState().settings).toEqual({ copyIncludeLinks: false, copyIncludeBody: false, copyIncludeIconStatus: false })
  })
})

describe('漫游引导状态（onboarding tour）', () => {
  test('startTour 激活并回到第 0 步', () => {
    useAppStore.setState({ tourStep: 5 })
    useAppStore.getState().startTour()
    const s = useAppStore.getState()
    expect(s.tourActive).toBe(true)
    expect(s.tourStep).toBe(0)
  })
  test('setTourStep 仅改步号（before 钩子切视图后由组件调用）', () => {
    useAppStore.getState().startTour()
    useAppStore.getState().setTourStep(3)
    expect(useAppStore.getState().tourStep).toBe(3)
  })
  test('finishTour 关闭引导并持久化 tourDone:true（load-merge-save 不丢其他字段）', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().setWorkspace('/ws')
    useAppStore.getState().startTour()
    useAppStore.getState().setTourStep(2)
    await useAppStore.getState().finishTour()
    const s = useAppStore.getState()
    expect(s.tourActive).toBe(false)
    expect(s.tourStep).toBe(0)
    expect(s.tourDone).toBe(true)
    const cfg = JSON.parse(await fs.readTextFile('/cfg.json'))
    expect(cfg.tourDone).toBe(true)
    expect(cfg.workspaceDir).toBe('/ws') // merge 未覆盖
  })
  test('init 自 config 载入 tourDone', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: null, tourDone: true }))
    await useAppStore.getState().init()
    expect(useAppStore.getState().tourDone).toBe(true)
  })
})

describe('分区拖拽宽度（2026-09 左栏/大纲）', () => {
  test('setSidebarWidth/setOutlineWidth 更新内存并 load-merge-save 持久化', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().setWorkspace('/ws')
    await useAppStore.getState().setSidebarWidth(320)
    await useAppStore.getState().setOutlineWidth(260)
    expect(useAppStore.getState().sidebarWidth).toBe(320)
    expect(useAppStore.getState().outlineWidth).toBe(260)
    const cfg = JSON.parse(await fs.readTextFile('/cfg.json'))
    expect(cfg.sidebarWidth).toBe(320)
    expect(cfg.outlineWidth).toBe(260)
    expect(cfg.workspaceDir).toBe('/ws') // merge 未覆盖
  })
  test('设 null 即恢复默认（双击手柄路径）：内存与盘面同步清', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().setWorkspace('/ws')
    await useAppStore.getState().setSidebarWidth(320)
    await useAppStore.getState().setSidebarWidth(null)
    expect(useAppStore.getState().sidebarWidth).toBeNull()
    expect(JSON.parse(await fs.readTextFile('/cfg.json')).sidebarWidth).toBeNull()
  })
  test('init 自 config 载入两栏宽度', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: '/ws', sidebarWidth: 300, outlineWidth: 240 }))
    await useAppStore.getState().init()
    expect(useAppStore.getState().sidebarWidth).toBe(300)
    expect(useAppStore.getState().outlineWidth).toBe(240)
  })
})

// 收藏置顶与列表排序（2026-09）：favorites = mdPath 寻址的收藏清单 + librarySort 排序偏好，
// 均走 load-merge-save 持久化；relocate 系动作让收藏在重命名/移动后跟随（保住「永远置顶」）
describe('favorites + librarySort（收藏与排序）', () => {
  test('toggleFavorite 收藏→取消：内存与盘面同步，load-merge 不覆盖他字段', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().setWorkspace('/ws')
    await useAppStore.getState().toggleFavorite('/ws/已有.md')
    expect(useAppStore.getState().favorites).toEqual(['/ws/已有.md'])
    const cfg = JSON.parse(await fs.readTextFile('/cfg.json'))
    expect(cfg.favorites).toEqual(['/ws/已有.md'])
    expect(cfg.workspaceDir).toBe('/ws') // merge 未覆盖
    await useAppStore.getState().toggleFavorite('/ws/已有.md') // 再点即取消
    expect(useAppStore.getState().favorites).toEqual([])
    expect(JSON.parse(await fs.readTextFile('/cfg.json')).favorites).toEqual([])
  })
  test('relocateFavorite 已收藏路径换址跟随（改名/移动不丢星标）', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().toggleFavorite('/ws/旧名.md')
    await useAppStore.getState().relocateFavorite('/ws/旧名.md', '/ws/新名.md')
    expect(useAppStore.getState().favorites).toEqual(['/ws/新名.md'])
    expect(JSON.parse(await fs.readTextFile('/cfg.json')).favorites).toEqual(['/ws/新名.md'])
  })
  test('relocateFavorite 未收藏路径 no-op（不写盘）', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().setWorkspace('/ws')
    const before = await fs.readTextFile('/cfg.json')
    await useAppStore.getState().relocateFavorite('/ws/无关.md', '/ws/别处.md')
    expect(useAppStore.getState().favorites).toEqual([])
    expect(await fs.readTextFile('/cfg.json')).toBe(before) // 盘面原样
  })
  test('relocateFavoritesUnder 前缀重写（目录整子树移动，子内收藏随迁）', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().toggleFavorite('/ws/a/图1.md')
    await useAppStore.getState().toggleFavorite('/ws/b/图2.md')
    await useAppStore.getState().relocateFavoritesUnder('/ws/a', '/ws/c/a')
    expect(useAppStore.getState().favorites).toEqual(['/ws/c/a/图1.md', '/ws/b/图2.md'])
    expect(JSON.parse(await fs.readTextFile('/cfg.json')).favorites).toEqual(['/ws/c/a/图1.md', '/ws/b/图2.md'])
  })
  test('relocateFavoritesUnder 无命中 no-op', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().toggleFavorite('/ws/b/图2.md')
    await useAppStore.getState().relocateFavoritesUnder('/ws/a', '/ws/c/a')
    expect(useAppStore.getState().favorites).toEqual(['/ws/b/图2.md'])
  })
  test('setLibrarySort 更新内存并持久化', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().setLibrarySort('name')
    expect(useAppStore.getState().librarySort).toBe('name')
    expect(JSON.parse(await fs.readTextFile('/cfg.json')).librarySort).toBe('name')
  })
  test('init 自 config 载入收藏与排序偏好（缺失回退默认）', async () => {
    useAppStore.setState({ configPath: '/cfg.json' })
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: '/ws', favorites: ['/ws/已有.md'], librarySort: 'name' }))
    await useAppStore.getState().init()
    expect(useAppStore.getState().favorites).toEqual(['/ws/已有.md'])
    expect(useAppStore.getState().librarySort).toBe('name')
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: '/ws' }))
    await useAppStore.getState().init()
    expect(useAppStore.getState().favorites).toEqual([])
    expect(useAppStore.getState().librarySort).toBe('modified')
  })
})

// 路由与启动落点（2026-09 画布三态 M3：工作台并入案头）：route 收窄两空间
// （library/editor，'workbench' 退役——类型由 tsc 把关）；有工作区启动也落案头
// （跨图总览由欢迎页 DeskOverview 承接）；pendingLocate 为文本寻址器
// { mapPath, path, text }——md 不序列化 uid，跨图跳转只能以路径+文本定位
// （spec §11 Ruling）；mapPath 绑定目标图（终审 Important-1 错图消费修复），
// EditorView 消费即清
describe('路由与启动落点（两空间，工作台已退役）', () => {
  test('工作台路由已退役：setViewMode 三态不受影响，route 仅 library/editor', () => {
    // route 类型收窄由 tsc 把关；运行时断言现状不变的部分
    expect(useAppStore.getState().route).toBe('library')
  })

  test('init 有工作区：启动落案头（总览由欢迎页承接，不再落工作台）', async () => {
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: '/ws' }))
    useAppStore.setState({ adapter: fs, workspaceDir: null })
    await useAppStore.getState().init()
    expect(useAppStore.getState().route).toBe('library')
  })

  test('init 无工作区：维持落案头（onboarding 不抢）', async () => {
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({}))
    useAppStore.setState({ adapter: fs, workspaceDir: null })
    await useAppStore.getState().init()
    expect(useAppStore.getState().route).toBe('library')
  })

  test('setPendingLocate 置/清（案头总览跨图跳转的文本寻址器）', () => {
    const locate = { mapPath: '/ws/a.md', path: ['分支'], text: '任务甲' }
    useAppStore.getState().setPendingLocate(locate)
    expect(useAppStore.getState().pendingLocate).toEqual(locate)
    useAppStore.getState().setPendingLocate(null)
    expect(useAppStore.getState().pendingLocate).toBeNull()
  })
})

// 画布三态（2026-09）：viewMode 从 导图/看板 二态扩为 导图/Markdown/看板
test('setViewMode 支持三态：markdown 直设', () => {
  useAppStore.getState().setViewMode('markdown')
  expect(useAppStore.getState().viewMode).toBe('markdown')
  useAppStore.getState().setViewMode('mindmap')
  expect(useAppStore.getState().viewMode).toBe('mindmap')
})

describe('点子篮子：captureIdea', () => {
  const idea = { text: '新点子', body: '说明' }

  test('无引擎端口时文件层写入：新点子在根下首位；篮子丢失自动重建', async () => {
    const { MemoryFsAdapter } = await import('../services/fs/MemoryFsAdapter')
    const fs = new MemoryFsAdapter()
    await fs.mkdir('/ws')
    useAppStore.setState({ adapter: fs, workspaceDir: '/ws', basketRelPath: '点子篮子.md', basketEngine: null, resolvedLanguage: 'zh-CN' })
    const r = await useAppStore.getState().captureIdea(idea)
    expect(r).toEqual({ ok: true })
    const md = await fs.readTextFile('/ws/点子篮子.md')
    expect(md).toContain('# 点子篮子')
    expect(md).toContain('新点子')
    // 再记一条 → 新的在最上
    await useAppStore.getState().captureIdea({ text: '第二条' })
    const lines = (await fs.readTextFile('/ws/点子篮子.md')).split('\n')
    expect(lines.findIndex((l) => l.includes('第二条'))).toBeLessThan(lines.findIndex((l) => l.includes('新点子')))
  })

  test('引擎端口存在时走引擎（文件不动）', async () => {
    const { MemoryFsAdapter } = await import('../services/fs/MemoryFsAdapter')
    const fs = new MemoryFsAdapter()
    await fs.mkdir('/ws')
    await fs.writeTextFileAtomic('/ws/点子篮子.md', '# 点子篮子\n')
    const insertIdea = vi.fn(() => true)
    useAppStore.setState({ adapter: fs, workspaceDir: '/ws', basketRelPath: '点子篮子.md', basketEngine: { insertIdea, removeIdeaByText: vi.fn(() => true) } })
    expect(await useAppStore.getState().captureIdea(idea)).toEqual({ ok: true })
    expect(insertIdea).toHaveBeenCalledWith(idea)
    expect(await fs.readTextFile('/ws/点子篮子.md')).not.toContain('新点子')
  })

  test('未设工作区 → 显式失败', async () => {
    useAppStore.setState({ workspaceDir: null, basketEngine: null })
    const r = await useAppStore.getState().captureIdea(idea)
    expect(r.ok).toBe(false)
  })

  // 引擎分支异常不得逃出 CaptureResult 边界（审查 Important）：与文件层对称——失败一律
  // 转 {ok:false} + console.error 出口；且**不落文件层兜底**（引擎可能已部分应用，回落双写）
  test('引擎端口抛错 → 显式失败且不落文件层（磁盘未动）', async () => {
    const { MemoryFsAdapter } = await import('../services/fs/MemoryFsAdapter')
    const fs = new MemoryFsAdapter()
    await fs.mkdir('/ws')
    await fs.writeTextFileAtomic('/ws/点子篮子.md', '# 点子篮子\n')
    const before = await fs.readTextFile('/ws/点子篮子.md')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      useAppStore.setState({ adapter: fs, workspaceDir: '/ws', basketRelPath: '点子篮子.md', basketEngine: { insertIdea: () => { throw new Error('引擎故障') }, removeIdeaByText: vi.fn(() => true) } })
      const r = await useAppStore.getState().captureIdea(idea)
      expect(r.ok).toBe(false)
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('篮子引擎'), expect.any(Error))
      expect(await fs.readTextFile('/ws/点子篮子.md')).toBe(before) // 文件层未被兜底写入
    } finally {
      errSpy.mockRestore()
    }
  })
})

// 挂载成功后从篮子删除（spec §4.6 撤销链的一环）：与捕获同款就近引擎规则（§4.2），
// 文本寻址根下首个命中（md 不序列化 uid，删除只能按文本）
describe('点子篮子：removeBasketIdeaByText', () => {
  test('无引擎端口时文件层删除：根下首个文本命中，余项保留', async () => {
    const { MemoryFsAdapter } = await import('../services/fs/MemoryFsAdapter')
    const fs = new MemoryFsAdapter()
    await fs.mkdir('/ws')
    await fs.writeTextFileAtomic('/ws/点子篮子.md', '# 点子篮子\n\n- 甲\n- 乙\n')
    useAppStore.setState({ adapter: fs, workspaceDir: '/ws', basketRelPath: '点子篮子.md', basketEngine: null, resolvedLanguage: 'zh-CN' })
    expect(await useAppStore.getState().removeBasketIdeaByText('甲')).toEqual({ ok: true })
    const md = await fs.readTextFile('/ws/点子篮子.md')
    expect(md).not.toContain('甲')
    expect(md).toContain('乙')
  })

  test('引擎端口存在时走引擎（文件不动）', async () => {
    const { MemoryFsAdapter } = await import('../services/fs/MemoryFsAdapter')
    const fs = new MemoryFsAdapter()
    await fs.mkdir('/ws')
    await fs.writeTextFileAtomic('/ws/点子篮子.md', '# 点子篮子\n\n- 甲\n')
    const removeIdeaByText = vi.fn(() => true)
    useAppStore.setState({ adapter: fs, workspaceDir: '/ws', basketRelPath: '点子篮子.md', basketEngine: { insertIdea: vi.fn(() => true), removeIdeaByText } })
    expect(await useAppStore.getState().removeBasketIdeaByText('甲')).toEqual({ ok: true })
    expect(removeIdeaByText).toHaveBeenCalledWith('甲')
    expect(await fs.readTextFile('/ws/点子篮子.md')).toContain('甲')
  })

  test('未设工作区 → 显式失败', async () => {
    useAppStore.setState({ workspaceDir: null, basketEngine: null })
    expect((await useAppStore.getState().removeBasketIdeaByText('甲')).ok).toBe(false)
  })

  test('引擎端口抛错 → 显式失败且不落文件层（磁盘未动）', async () => {
    const { MemoryFsAdapter } = await import('../services/fs/MemoryFsAdapter')
    const fs = new MemoryFsAdapter()
    await fs.mkdir('/ws')
    await fs.writeTextFileAtomic('/ws/点子篮子.md', '# 点子篮子\n\n- 甲\n')
    const before = await fs.readTextFile('/ws/点子篮子.md')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      useAppStore.setState({ adapter: fs, workspaceDir: '/ws', basketRelPath: '点子篮子.md', basketEngine: { insertIdea: vi.fn(() => true), removeIdeaByText: () => { throw new Error('引擎故障') } } })
      const r = await useAppStore.getState().removeBasketIdeaByText('甲')
      expect(r.ok).toBe(false)
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('篮子引擎'), expect.any(Error))
      expect(await fs.readTextFile('/ws/点子篮子.md')).toBe(before)
    } finally {
      errSpy.mockRestore()
    }
  })
})

// 篮子身份固定（spec §3.1「创建即固定，之后切语言不影响」；终审 I1）：cfg.basketPath 是文件
// 身份的唯一锚——产品代码原先只读不写，重启后 init 按**新语言**重算默认名（en↔zh 一次重启即
// 命中），下次捕获另建空篮子并弹「篮子文件已重建」，还把原因指向错方向
describe('点子篮子：身份固定（spec §3.1）', () => {
  test('cfg.basketPath 有值：init 与 setWorkspace 均锚定该值，切语言不漂移', async () => {
    const fs = new MemoryFsAdapter()
    await fs.mkdir('/ws')
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: '/ws', language: 'en', basketPath: 'my-basket.md' }))
    useAppStore.setState({ adapter: fs, configPath: '/cfg.json', workspaceDir: null, basketRelPath: null })
    await useAppStore.getState().init()
    expect(useAppStore.getState().resolvedLanguage).toBe('en')
    expect(useAppStore.getState().basketRelPath).toBe('my-basket.md') // 不按 en 重算成 'Idea Inbox.md'
    await useAppStore.getState().setWorkspace('/ws') // 换工作区同期同步（同口径）
    expect(useAppStore.getState().basketRelPath).toBe('my-basket.md')
  })

  test('首建即固定：basketPath 落盘 + 内存同步；重启切语言仍指向首建名', async () => {
    const fs = new MemoryFsAdapter()
    await fs.mkdir('/ws')
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: '/ws' }))
    useAppStore.setState({ adapter: fs, configPath: '/cfg.json', workspaceDir: '/ws', basketRelPath: null, basketEngine: null, resolvedLanguage: 'en' })
    expect(await useAppStore.getState().captureIdea({ text: '首条' })).toEqual({ ok: true })
    expect(await fs.readTextFile('/ws/Idea Inbox.md')).toContain('首条') // 首建名取当时语言（en）
    expect(useAppStore.getState().basketRelPath).toBe('Idea Inbox.md') // 内存同步：本次会话内 isBasket 即可判真
    // 重启（内存态清空 + 界面语言已切 zh-CN）：身份仍锚首建名，不重算成「点子篮子.md」
    const cfg = JSON.parse(await fs.readTextFile('/cfg.json'))
    expect(cfg.basketPath).toBe('Idea Inbox.md')
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ ...cfg, language: 'zh-CN' }))
    useAppStore.setState({ basketRelPath: null })
    await useAppStore.getState().init()
    expect(useAppStore.getState().resolvedLanguage).toBe('zh-CN')
    expect(useAppStore.getState().basketRelPath).toBe('Idea Inbox.md')
  })
})

// 快速捕获 store 态（2026-09 点子篮子 M2，spec §5.1/§5.3）：开关持久化经 init 读回 +
// 快捷键错误态 + 真退出标志；桩装配沿用本文件内存 fs 模式（beforeEach 已注入 adapter/configPath）
describe('点子篮子 M2：快速捕获 store 态', () => {
  test('setQuickCaptureEnabled 持久化并经 init 读回；requestExit/shortcutError 态（spec §5.1/§5.3）', async () => {
    await useAppStore.getState().setQuickCaptureEnabled(true)
    expect(useAppStore.getState().quickCaptureEnabled).toBe(true)
    await useAppStore.getState().init() // init 重读 cfg.json
    expect(useAppStore.getState().quickCaptureEnabled).toBe(true)
    useAppStore.getState().setQuickCaptureShortcutError('x')
    expect(useAppStore.getState().quickCaptureShortcutError).toBe('x')
    useAppStore.getState().setQuickCaptureShortcutError(null)
    useAppStore.getState().requestExit()
    expect(useAppStore.getState().exitRequested).toBe(true)
  })
})
