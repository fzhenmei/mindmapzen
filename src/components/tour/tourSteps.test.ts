import { describe, expect, test, beforeEach } from 'vitest'
import { useAppStore } from '../../store/appStore'
import { MemoryFsAdapter } from '../../services/fs/MemoryFsAdapter'
import { buildTourSteps, openSampleMap } from './tourSteps'

// 步骤表已工厂化:测试 setup 已以 zh-CN 预热 i18n,模块级调用一次即得中文步骤表(与旧常量等价,断言不变)
const TOUR_STEPS = buildTourSteps()

beforeEach(async () => {
  const fs = new MemoryFsAdapter()
  const s = useAppStore.getState()
  s.setAdapter(fs)
  useAppStore.setState({ configPath: '/cfg.json', route: 'library', workspaceDir: null, maps: [], currentMdPath: null, error: null })
  await useAppStore.getState().setWorkspace('/ws')
})

describe('TOUR_STEPS 步骤表', () => {
  test('共 10 步，view 分段 library 在前 editor 在后（单调不交叉）', () => {
    expect(TOUR_STEPS).toHaveLength(10)
    const views = TOUR_STEPS.map((s) => s.view)
    expect(views).toEqual([...views.filter((v) => v === 'library'), ...views.filter((v) => v === 'editor')])
  })
  test('首步与末步无锚点（居中卡）；唯一 before 在进入 editor 段的第一步', () => {
    expect(TOUR_STEPS[0].target).toBeNull()
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].target).toBeNull()
    const withBefore = TOUR_STEPS.filter((s) => s.before !== undefined)
    expect(withBefore).toHaveLength(1)
    expect(withBefore[0]).toBe(TOUR_STEPS[5]) // 唯一 before 固定在索引 5：守护跨视图时序契约
  })
})

describe('openSampleMap（跨视图 before 钩子）', () => {
  test('创建示例图并进入编辑器；重复调用幂等（已存在则直接打开）', async () => {
    await openSampleMap()
    const s1 = useAppStore.getState()
    expect(s1.route).toBe('editor')
    expect(s1.currentMdPath).toBe('/ws/漫游示例.md')
    // 幂等：回案头重跑（重看场景示例图仍在）
    await useAppStore.getState().backToLibrary()
    await openSampleMap()
    expect(useAppStore.getState().currentMdPath).toBe('/ws/漫游示例.md')
  })
})
