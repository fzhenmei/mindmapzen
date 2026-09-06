import { describe, expect, test } from 'vitest'
import { MemoryFsAdapter } from './fs/MemoryFsAdapter'
import { DEFAULT_CONFIG, DEFAULT_COPY_SETTINGS, DEFAULT_GIT_CONFIG, type AppConfig } from '../types/files'
import { loadConfig, saveConfig } from './config'

/** 便捷构造完整配置对象（新字段补齐后各用例只写差异项） */
const cfg = (over: Partial<AppConfig> = {}): AppConfig => ({
  workspaceDir: '/ws', lastOpened: null, recentOpened: [], preferredLayout: null, theme: 'auto',
  previewOutline: 'auto', favorites: [], librarySort: 'modified', settings: DEFAULT_COPY_SETTINGS, git: DEFAULT_GIT_CONFIG, tourDone: false,
  sidebarWidth: null, outlineWidth: null, language: 'auto', ...over,
})

describe('配置读写', () => {
  test('缺失时返回默认配置', async () => {
    const fs = new MemoryFsAdapter()
    expect(await loadConfig(fs, '/cfg.json')).toEqual(DEFAULT_CONFIG)
  })
  test('损坏 JSON 返回默认配置', async () => {
    const fs = new MemoryFsAdapter()
    await fs.writeTextFileAtomic('/cfg.json', '{oops')
    expect(await loadConfig(fs, '/cfg.json')).toEqual(DEFAULT_CONFIG)
  })
  test('保存后可读回', async () => {
    const fs = new MemoryFsAdapter()
    await saveConfig(fs, '/cfg.json', { workspaceDir: '/ws', lastOpened: '/ws/a.md', preferredLayout: null, theme: 'auto', previewOutline: 'auto', favorites: [], librarySort: 'modified', settings: DEFAULT_COPY_SETTINGS, recentOpened: [], git: DEFAULT_GIT_CONFIG, tourDone: false, sidebarWidth: null, outlineWidth: null, language: 'auto' })
    expect(await loadConfig(fs, '/cfg.json')).toEqual({ workspaceDir: '/ws', lastOpened: '/ws/a.md', recentOpened: [], preferredLayout: null, theme: 'auto', previewOutline: 'auto', favorites: [], librarySort: 'modified', settings: DEFAULT_COPY_SETTINGS, git: DEFAULT_GIT_CONFIG, tourDone: false, sidebarWidth: null, outlineWidth: null, language: 'auto' })
  })
})

describe('previewOutline（预览大纲三态偏好）', () => {
  test('合法值往返', async () => {
    const fs = new MemoryFsAdapter()
    await saveConfig(fs, '/cfg.json', { workspaceDir: '/ws', lastOpened: null, recentOpened: [], preferredLayout: null, theme: 'auto', previewOutline: 'on', favorites: [], librarySort: 'modified', settings: DEFAULT_COPY_SETTINGS, git: DEFAULT_GIT_CONFIG, tourDone: false, sidebarWidth: null, outlineWidth: null, language: 'auto' })
    expect((await loadConfig(fs, '/cfg.json')).previewOutline).toBe('on')
    await saveConfig(fs, '/cfg.json', { workspaceDir: '/ws', lastOpened: null, recentOpened: [], preferredLayout: null, theme: 'auto', previewOutline: 'off', favorites: [], librarySort: 'modified', settings: DEFAULT_COPY_SETTINGS, git: DEFAULT_GIT_CONFIG, tourDone: false, sidebarWidth: null, outlineWidth: null, language: 'auto' })
    expect((await loadConfig(fs, '/cfg.json')).previewOutline).toBe('off')
  })
  test('非法值与缺失回退 auto（旧配置兼容）', async () => {
    const fs = new MemoryFsAdapter()
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: '/ws', lastOpened: null, previewOutline: 'bogus' }))
    expect((await loadConfig(fs, '/cfg.json')).previewOutline).toBe('auto')
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: '/ws', lastOpened: null }))
    expect((await loadConfig(fs, '/cfg.json')).previewOutline).toBe('auto')
  })
})

describe('preferredLayout（验收轮三：记住默认布局）', () => {
  test('合法值往返', async () => {
    const fs = new MemoryFsAdapter()
    await saveConfig(fs, '/cfg.json', { workspaceDir: '/ws', lastOpened: null, recentOpened: [], preferredLayout: 'logic', theme: 'auto', previewOutline: 'auto', favorites: [], librarySort: 'modified', settings: DEFAULT_COPY_SETTINGS, git: DEFAULT_GIT_CONFIG, tourDone: false, sidebarWidth: null, outlineWidth: null, language: 'auto' })
    expect((await loadConfig(fs, '/cfg.json')).preferredLayout).toBe('logic')
  })
  test('非法值与缺失回退 null', async () => {
    const fs = new MemoryFsAdapter()
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: '/ws', lastOpened: null, recentOpened: [], preferredLayout: 'bogus' }))
    expect((await loadConfig(fs, '/cfg.json')).preferredLayout).toBeNull()
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: '/ws', lastOpened: null }))
    expect((await loadConfig(fs, '/cfg.json')).preferredLayout).toBeNull()
  })
  test('新增布局值往返（2026-09 时间轴/鱼骨图）', async () => {
    const fs = new MemoryFsAdapter()
    await saveConfig(fs, '/cfg.json', cfg({ preferredLayout: 'timeline' }))
    expect((await loadConfig(fs, '/cfg.json')).preferredLayout).toBe('timeline')
    await saveConfig(fs, '/cfg.json', cfg({ preferredLayout: 'fishbone' }))
    expect((await loadConfig(fs, '/cfg.json')).preferredLayout).toBe('fishbone')
  })
})

describe('theme（M4 禅意视觉）', () => {
  test('theme 往返与非法回退 auto', async () => {
    const fs = new MemoryFsAdapter()
    await saveConfig(fs, '/cfg.json', { workspaceDir: null, lastOpened: null, recentOpened: [], preferredLayout: null, theme: 'dark', previewOutline: 'auto', favorites: [], librarySort: 'modified', settings: DEFAULT_COPY_SETTINGS, git: DEFAULT_GIT_CONFIG, tourDone: false, sidebarWidth: null, outlineWidth: null, language: 'auto' })
    expect((await loadConfig(fs, '/cfg.json')).theme).toBe('dark')
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: null, lastOpened: null, recentOpened: [], preferredLayout: null, theme: 'x' }))
    expect((await loadConfig(fs, '/cfg.json')).theme).toBe('auto')
  })
})

describe('settings（M5b Task 4：复制行为；2026-09-06 copyIncludeNote 退役）', () => {
  test('合法值往返', async () => {
    const fs = new MemoryFsAdapter()
    await saveConfig(fs, '/cfg.json', {
      workspaceDir: null, lastOpened: null, preferredLayout: null, theme: 'auto', previewOutline: 'auto',
      favorites: [], librarySort: 'modified',
      settings: { copyIncludeLinks: false, copyIncludeBody: false },
      recentOpened: [],
      git: DEFAULT_GIT_CONFIG,
      tourDone: false, sidebarWidth: null, outlineWidth: null, language: 'auto',
    })
    expect((await loadConfig(fs, '/cfg.json')).settings).toEqual({ copyIncludeLinks: false, copyIncludeBody: false })
  })
  test('缺失 settings 字段回退默认（旧配置兼容）', async () => {
    const fs = new MemoryFsAdapter()
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: '/ws', lastOpened: null }))
    expect((await loadConfig(fs, '/cfg.json')).settings).toEqual(DEFAULT_COPY_SETTINGS)
  })
  test('字段类型非法逐字段回退默认（wrong types 不整块丢弃合法字段）', async () => {
    const fs = new MemoryFsAdapter()
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ settings: { copyIncludeLinks: 'yes', copyIncludeBody: false } }))
    expect((await loadConfig(fs, '/cfg.json')).settings).toEqual({ copyIncludeLinks: true, copyIncludeBody: false })
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ settings: 'bogus' }))
    expect((await loadConfig(fs, '/cfg.json')).settings).toEqual(DEFAULT_COPY_SETTINGS)
  })
  test('旧配置含 copyIncludeNote 键：静默忽略（多余键不读，解析产物仅两键）', async () => {
    const fs = new MemoryFsAdapter()
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ settings: { copyIncludeNote: true, copyIncludeLinks: false } }))
    expect((await loadConfig(fs, '/cfg.json')).settings).toEqual({ copyIncludeLinks: false, copyIncludeBody: true })
  })
})

describe('tourDone（漫游引导完成标记）', () => {
  test('合法值往返', async () => {
    const fs = new MemoryFsAdapter()
    await saveConfig(fs, '/cfg.json', { workspaceDir: '/ws', lastOpened: null, recentOpened: [], preferredLayout: null, theme: 'auto', previewOutline: 'auto', favorites: [], librarySort: 'modified', settings: DEFAULT_COPY_SETTINGS, git: DEFAULT_GIT_CONFIG, tourDone: true, sidebarWidth: null, outlineWidth: null, language: 'auto' })
    expect((await loadConfig(fs, '/cfg.json')).tourDone).toBe(true)
  })
  test('缺失与非法回退 false（旧配置兼容：老用户升级后首次启动可看一次引导）', async () => {
    const fs = new MemoryFsAdapter()
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: '/ws' }))
    expect((await loadConfig(fs, '/cfg.json')).tourDone).toBe(false)
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: '/ws', tourDone: 'yes' }))
    expect((await loadConfig(fs, '/cfg.json')).tourDone).toBe(false)
  })
})

describe('sidebarWidth/outlineWidth（案头分区拖拽宽度）', () => {
  test('合法值往返', async () => {
    const fs = new MemoryFsAdapter()
    await saveConfig(fs, '/cfg.json', cfg({ sidebarWidth: 320, outlineWidth: 260 }))
    const loaded = await loadConfig(fs, '/cfg.json')
    expect(loaded.sidebarWidth).toBe(320)
    expect(loaded.outlineWidth).toBe(260)
  })
  test('非有限数、非正数与缺失回退 null（旧配置兼容；范围 clamp 在 UI 层做）', async () => {
    const fs = new MemoryFsAdapter()
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: '/ws', sidebarWidth: 'wide', outlineWidth: -50 }))
    let loaded = await loadConfig(fs, '/cfg.json')
    expect(loaded.sidebarWidth).toBeNull()
    expect(loaded.outlineWidth).toBeNull()
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: '/ws', sidebarWidth: Number.NaN }))
    loaded = await loadConfig(fs, '/cfg.json')
    expect(loaded.sidebarWidth).toBeNull()
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: '/ws' }))
    loaded = await loadConfig(fs, '/cfg.json')
    expect(loaded.sidebarWidth).toBeNull()
    expect(loaded.outlineWidth).toBeNull()
  })
})

describe('favorites + librarySort（收藏置顶与列表排序）', () => {
  test('favorites 宽容解析：仅字符串数组项保留，不设上限（区别于 recentOpened 截 10）', async () => {
    const fs = new MemoryFsAdapter()
    const many = Array.from({ length: 15 }, (_, i) => `/ws/图${i}.md`)
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ favorites: ['/ws/重要.md', 42, null, ...many] }))
    expect((await loadConfig(fs, '/cfg.json')).favorites).toEqual(['/ws/重要.md', ...many])
  })
  test('favorites 非数组/缺失回退空数组（旧配置兼容）', async () => {
    const fs = new MemoryFsAdapter()
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ favorites: 'oops' }))
    expect((await loadConfig(fs, '/cfg.json')).favorites).toEqual([])
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({}))
    expect((await loadConfig(fs, '/cfg.json')).favorites).toEqual([])
  })
  test('librarySort 合法值往返', async () => {
    const fs = new MemoryFsAdapter()
    await saveConfig(fs, '/cfg.json', cfg({ librarySort: 'name' }))
    expect((await loadConfig(fs, '/cfg.json')).librarySort).toBe('name')
    await saveConfig(fs, '/cfg.json', cfg({ librarySort: 'modified' }))
    expect((await loadConfig(fs, '/cfg.json')).librarySort).toBe('modified')
  })
  test('librarySort 非法/缺失回退 modified（旧配置兼容，即现状新→旧）', async () => {
    const fs = new MemoryFsAdapter()
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ librarySort: 'bogus' }))
    expect((await loadConfig(fs, '/cfg.json')).librarySort).toBe('modified')
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({}))
    expect((await loadConfig(fs, '/cfg.json')).librarySort).toBe('modified')
  })
})

describe('language（2026-09 i18n 界面语言）', () => {
  test('language:无字段按 auto 兼容,合法值直出,非法值回退 auto', async () => {
    const fs = new MemoryFsAdapter()
    await fs.writeTextFileAtomic('/cfg.json', '{}')
    expect((await loadConfig(fs, '/cfg.json')).language).toBe('auto')
    await fs.writeTextFileAtomic('/cfg.json', '{"language":"en"}')
    expect((await loadConfig(fs, '/cfg.json')).language).toBe('en')
    await fs.writeTextFileAtomic('/cfg.json', '{"language":"xx"}')
    expect((await loadConfig(fs, '/cfg.json')).language).toBe('auto')
  })
})
