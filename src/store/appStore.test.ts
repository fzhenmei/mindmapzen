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
  useAppStore.setState({ route: 'library', workspaceDir: null, maps: [], currentMdPath: null, dirty: false, error: null, themePref: 'auto', resolvedTheme: 'light', settings: { ...DEFAULT_COPY_SETTINGS } })
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

  test('init 有 lastOpened 时恢复到编辑器', async () => {
    await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: '/ws', lastOpened: '/ws/已有.md' }))
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().init()
    expect(useAppStore.getState().route).toBe('editor')
    expect(useAppStore.getState().currentMdPath).toBe('/ws/已有.md')
  })

  test('createAndOpen 创建文件并进入编辑器', async () => {
    await useAppStore.getState().setWorkspace('/ws')
    await useAppStore.getState().createAndOpen('新图')
    const s = useAppStore.getState()
    expect(s.route).toBe('editor')
    expect(s.currentMdPath).toBe('/ws/新图.md')
    expect(await fs.readTextFile('/ws/新图.md')).toBe('# 根主题\n')
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

describe('settings（M5b Task 4：复制行为）', () => {
  test('初始默认 {copyIncludeNote:false, copyIncludeLinks:true}', () => {
    expect(useAppStore.getState().settings).toEqual(DEFAULT_COPY_SETTINGS)
  })
  test('init 读配置的 settings', async () => {
    await useAppStore.getState().adapter.writeTextFileAtomic('/cfg.json', JSON.stringify({ settings: { copyIncludeNote: true, copyIncludeLinks: false } }))
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().init()
    expect(useAppStore.getState().settings).toEqual({ copyIncludeNote: true, copyIncludeLinks: false })
  })
  test('setSetting 更新状态并 load-merge-save 持久化（单字段不覆盖另一字段）', async () => {
    await useAppStore.getState().setSetting('copyIncludeNote', true)
    expect(useAppStore.getState().settings).toEqual({ copyIncludeNote: true, copyIncludeLinks: true })
    const cfg = JSON.parse(await (useAppStore.getState().adapter as MemoryFsAdapter).readTextFile('/cfg.json'))
    expect(cfg.settings).toEqual({ copyIncludeNote: true, copyIncludeLinks: true })
    await useAppStore.getState().setSetting('copyIncludeLinks', false)
    const cfg2 = JSON.parse(await (useAppStore.getState().adapter as MemoryFsAdapter).readTextFile('/cfg.json'))
    expect(cfg2.settings).toEqual({ copyIncludeNote: true, copyIncludeLinks: false })
    expect(useAppStore.getState().settings).toEqual({ copyIncludeNote: true, copyIncludeLinks: false })
  })
})
