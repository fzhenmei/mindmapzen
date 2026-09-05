// src/components/tour/tourSteps.ts —— 漫游引导步骤表（spec §4.1）：纯数据 + 跨视图 before 钩子。
// 锚点全用现有 data-testid（主视图零改动）；target null = 居中卡（无锚点步）。
// before 内经 getState() 延迟取 store（模块级不 import 具体方法，避免与 TourOverlay→store 的链路耦合）
import { useAppStore } from '../../store/appStore'

export interface TourStep {
  view: 'library' | 'editor'
  /** data-testid 锚点；null = 居中卡（欢迎/切换提示/收尾） */
  target: string | null
  title: string
  body: string
  /** 进入该步前的一次性动作（如打开示例图）；引擎 await 后再定位锚点 */
  before?: () => Promise<void>
}

/** 打开漫游示例导图（spec §4.2）：不存在则创建，已存在（重看场景）则直接打开——幂等 */
export async function openSampleMap(): Promise<void> {
  const store = useAppStore.getState()
  try {
    await store.createAndOpen('漫游示例')
  } catch {
    // 「已存在同名导图」：重看场景，直接打开既有示例图
    const { workspaceDir } = useAppStore.getState()
    if (workspaceDir === null) return
    await useAppStore.getState().openMap(`${workspaceDir}/漫游示例.md`)
  }
}

export const TOUR_STEPS: TourStep[] = [
  {
    view: 'library',
    target: null,
    title: '欢迎来到 Mind Map Zen',
    body: '这是一款本地优先的思维导图工具，约 1 分钟带你逛完核心功能。随时可点「跳过」，之后能在设置里重新观看。',
  },
  {
    view: 'library',
    target: 'btn-new',
    title: '新建导图',
    body: '输入名称、挑选模板即可建图。双击案头里的导图随时进入编辑。',
  },
  {
    view: 'library',
    target: 'btn-import',
    title: '导入已有内容',
    body: '支持导入 Markdown 大纲与 XMind 文件，直接变成导图。',
  },
  {
    view: 'library',
    target: 'dir-panel',
    title: '目录组织',
    body: '左侧目录树管理工作区里的文件夹与导图——单击文件即可预览，双击直接进入编辑。',
  },
  {
    view: 'library',
    target: null,
    title: '进入编辑器',
    body: '接下来带你看看编辑器。我们将自动打开一张「漫游示例」导图作为演示对象，引导结束后它会留在工作区，可以随意练手。',
  },
  {
    view: 'editor',
    target: 'zen-bar',
    title: '命令栏',
    body: '底部命令栏集中了常用操作：返回案头、切换导图、复制 Markdown、保存等，鼠标悬停可看快捷键。',
    before: openSampleMap,
  },
  {
    view: 'editor',
    target: 'layout-mindmap',
    title: '布局切换',
    body: '常用布局一键直达：思维导图、逻辑图、组织结构图；时间轴、鱼骨图收在「更多」里。',
  },
  {
    view: 'editor',
    target: 'btn-note',
    title: '节点备注',
    body: '选中节点后可以为它补充备注，备注随 Markdown 一起保存。',
  },
  {
    view: 'editor',
    target: 'btn-export',
    title: '导出图片',
    body: '一键把导图导出为 PNG/SVG，或直接复制到剪贴板。',
  },
  {
    view: 'editor',
    target: null,
    title: '开始你的第一张导图',
    body: '「漫游示例」已留在工作区，可以拿它练手。现在就去新建一张属于自己的导图吧！',
  },
]
