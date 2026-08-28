import { beforeEach, describe, expect, test } from 'vitest'
import { waitFor } from '@testing-library/react'
import { useAppStore } from './appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'

let fs: MemoryFsAdapter
beforeEach(async () => {
  fs = new MemoryFsAdapter()
  await fs.writeTextFileAtomic('/ws/已有.md', '# 旧图\n')
  const s = useAppStore.getState()
  s.setAdapter(fs)
  useAppStore.setState({ route: 'library', workspaceDir: null, maps: [], currentMdPath: null, dirty: false, error: null, themePref: 'auto', resolvedTheme: 'light' })
})

describe('appStore', () => {
  test('setWorkspace 建立工作区并刷新列表', async () => {
    await useAppStore.getState().setWorkspace('/ws')
    expect(useAppStore.getState().workspaceDir).toBe('/ws')
    expect(useAppStore.getState().maps.map((m) => m.name)).toEqual(['已有'])
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

  test('createAndOpen 重名设置中文错误', async () => {
    await useAppStore.getState().setWorkspace('/ws')
    await useAppStore.getState().createAndOpen('已有')
    expect(useAppStore.getState().error).toContain('已存在同名导图')
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
