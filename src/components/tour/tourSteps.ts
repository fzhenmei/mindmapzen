// src/components/tour/tourSteps.ts —— 漫游引导步骤表（spec §4.1）：纯数据 + 跨视图 before 钩子。
// 锚点全用现有 data-testid（主视图零改动）；target null = 居中卡（无锚点步）。
// before 内经 getState() 延迟取 store（模块级不 import 具体方法，避免与 TourOverlay→store 的链路耦合）
import { useAppStore } from '../../store/appStore'
import { i18n } from '../../i18n'

export interface TourStep {
  view: 'library' | 'editor'
  /** data-testid 锚点；null = 居中卡（欢迎/切换提示/收尾） */
  target: string | null
  title: string
  body: string
  /** 进入该步前的一次性动作（如打开示例图）；引擎 await 后再定位锚点 */
  before?: () => Promise<void>
}

/** 打开漫游示例导图（spec §4.2）：不存在则创建，已存在（重看场景）则直接打开——幂等。
 *  示例图名随语言取名：跨语言重看会各留一份示例图（接受，重看幂等只在同语言内成立） */
export async function openSampleMap(): Promise<void> {
  const name = i18n.t('tour.sampleMapName')
  const store = useAppStore.getState()
  try {
    await store.createAndOpen(name)
  } catch {
    // 「已存在同名导图」：同语言重看场景，直接打开既有示例图（跨语言时是另一份名字，不走此分支）
    const { workspaceDir } = useAppStore.getState()
    if (workspaceDir === null) return
    await useAppStore.getState().openMap(`${workspaceDir}/${name}.md`)
  }
}

/** 漫游引导步骤表（工厂：title/body 在调用期从词典取值，语言切换后重看即新语言；
 *  view/target/before 不涉语言，仍为静态结构） */
export function buildTourSteps(): TourStep[] {
  return [
    {
      view: 'library',
      target: null,
      title: i18n.t('tour.steps.welcome.title'),
      body: i18n.t('tour.steps.welcome.body'),
    },
    {
      view: 'library',
      target: 'btn-new',
      title: i18n.t('tour.steps.newMap.title'),
      body: i18n.t('tour.steps.newMap.body'),
    },
    {
      view: 'library',
      target: 'btn-import',
      title: i18n.t('tour.steps.import.title'),
      body: i18n.t('tour.steps.import.body'),
    },
    {
      view: 'library',
      target: 'dir-panel',
      title: i18n.t('tour.steps.dirs.title'),
      body: i18n.t('tour.steps.dirs.body'),
    },
    {
      view: 'library',
      target: null,
      title: i18n.t('tour.steps.toEditor.title'),
      body: i18n.t('tour.steps.toEditor.body'),
    },
    {
      view: 'editor',
      target: 'zen-bar',
      title: i18n.t('tour.steps.zenbar.title'),
      body: i18n.t('tour.steps.zenbar.body'),
      before: openSampleMap,
    },
    {
      view: 'editor',
      target: 'layout-mindmap',
      title: i18n.t('tour.steps.layout.title'),
      body: i18n.t('tour.steps.layout.body'),
    },
    {
      view: 'editor',
      target: 'btn-body',
      title: i18n.t('tour.steps.body.title'),
      body: i18n.t('tour.steps.body.body'),
    },
    {
      view: 'editor',
      target: 'btn-export',
      title: i18n.t('tour.steps.export.title'),
      body: i18n.t('tour.steps.export.body'),
    },
    {
      view: 'editor',
      target: null,
      title: i18n.t('tour.steps.finish.title'),
      body: i18n.t('tour.steps.finish.body'),
    },
  ]
}
