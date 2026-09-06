import { beforeEach, describe, expect, test } from 'vitest'
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
  useAppStore.setState({ route: 'library', workspaceDir: null, maps: [], currentMdPath: null, dirty: false, error: null, themePref: 'auto', resolvedTheme: 'light', settings: { ...DEFAULT_COPY_SETTINGS }, sessionRecent: [], recentOpened: [], mapTabs: [], favorites: [], librarySort: 'modified', tourActive: false, tourStep: 0, tourDone: false })
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

  // v2.4 验收：启动恒定落案头（不自动回上次导图——上次内容在欢迎页「最近打开」可达）
  test('init 有 lastOpened 也落案头，booted 置位', async () => {
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
  test('初始默认 {copyIncludeLinks:true, copyIncludeBody:true}（2026-09-06 copyIncludeNote 退役）', () => {
    expect(useAppStore.getState().settings).toEqual(DEFAULT_COPY_SETTINGS)
    expect(DEFAULT_COPY_SETTINGS).toEqual({ copyIncludeLinks: true, copyIncludeBody: true })
  })
  test('init 读配置的 settings', async () => {
    await useAppStore.getState().adapter.writeTextFileAtomic('/cfg.json', JSON.stringify({ settings: { copyIncludeLinks: false } }))
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().init()
    expect(useAppStore.getState().settings).toEqual({ copyIncludeLinks: false, copyIncludeBody: true })
  })
  test('旧配置含 copyIncludeNote 键：加载不炸且静默忽略（引用块已是正文，「剥备注」语义消失）', async () => {
    await useAppStore.getState().adapter.writeTextFileAtomic('/cfg.json', JSON.stringify({ settings: { copyIncludeNote: true, copyIncludeLinks: false } }))
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().init()
    expect(useAppStore.getState().settings).toEqual({ copyIncludeLinks: false, copyIncludeBody: true })
  })
  test('旧配置含 copyIncludeNote 键：setSetting 落盘不写回（load-merge-save 不使退役键复活）', async () => {
    await useAppStore.getState().adapter.writeTextFileAtomic('/cfg.json', JSON.stringify({ settings: { copyIncludeNote: true, copyIncludeLinks: true } }))
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().setSetting('copyIncludeBody', false)
    const cfg = JSON.parse(await (useAppStore.getState().adapter as MemoryFsAdapter).readTextFile('/cfg.json'))
    expect(cfg.settings).toEqual({ copyIncludeLinks: true, copyIncludeBody: false })
    expect(cfg.settings).not.toHaveProperty('copyIncludeNote')
  })
  test('setSetting 更新状态并 load-merge-save 持久化（单字段不覆盖另一字段）', async () => {
    useAppStore.setState({ configPath: '/cfg.json', settings: { ...DEFAULT_COPY_SETTINGS } })
    await useAppStore.getState().setSetting('copyIncludeBody', false)
    expect(useAppStore.getState().settings).toEqual({ copyIncludeLinks: true, copyIncludeBody: false })
    const cfg = JSON.parse(await (useAppStore.getState().adapter as MemoryFsAdapter).readTextFile('/cfg.json'))
    expect(cfg.settings).toEqual({ copyIncludeLinks: true, copyIncludeBody: false })
    await useAppStore.getState().setSetting('copyIncludeLinks', false)
    const cfg2 = JSON.parse(await (useAppStore.getState().adapter as MemoryFsAdapter).readTextFile('/cfg.json'))
    expect(cfg2.settings).toEqual({ copyIncludeLinks: false, copyIncludeBody: false })
    expect(useAppStore.getState().settings).toEqual({ copyIncludeLinks: false, copyIncludeBody: false })
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
