import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ZenBar from './ZenBar'
import { TooltipProvider } from './ui/tooltip'
import { useAppStore, type ViewMode } from '../store/appStore'
import { DEFAULT_COPY_SETTINGS, type CopySettingKey } from '../types/files'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'
import type { UndoRedo } from '../hooks/useUndoRedo'
import type { LayoutKind } from '../editor/layoutMap'

// 砚栏复制组 split button（2026-09 复制选项自设置面板移入）：主钮照常复制、箭头展开
// 两勾选项（默认 双链on/含正文on；2026-09-06 备注合并后 copyIncludeNote 退役，
// 「包含备注」项随之拆除）、勾选即回调且菜单保持打开、接线真实 store 后勾选走
// setSetting load-merge-save 持久化（链路测试自 SettingsDialog.test 迁入）。
// jsdom 驱动沿用 dropdown-menu.test 模式：pointerdown（button 0）展开，role 定位条目。

const noop = (): void => {}
// bind 属引擎挂载钩（ZenBar 不触达），桩里补 no-op 只为满足 UndoRedo 形状
const undoRedoStub: UndoRedo = { canUndo: false, canRedo: false, onUndo: noop, onRedo: noop, bind: noop }

/** 全 props 桩（纯展示组件）：复制组三项、布局组两项与视图组由用例覆盖注入，其余状态无关项全 no-op */
function renderBar(overrides: {
  copySettings?: typeof DEFAULT_COPY_SETTINGS
  onToggleCopySetting?: (key: CopySettingKey) => void
  layout?: LayoutKind
  onSwitchLayout?: (kind: LayoutKind) => void
  bodyActive?: boolean
  onBodyClick?: () => void
  viewMode?: ViewMode
  onSwitchView?: (v: ViewMode) => void
  outlineVisible?: boolean
  onToggleOutline?: () => void
  kanbanArchiveOpen?: boolean
  onToggleKanbanArchive?: () => void
  onSettingsClick?: () => void
  isBasket?: boolean
  onSortBasket?: () => void
  expandLevel?: number | 'all' | undefined
  onExpandLevel?: (v: number | 'all') => void
  onSearchClick?: () => void
  onCopyWechat?: () => void
  wechatCopyBusy?: boolean
} = {}): void {
  render(
    <TooltipProvider>
      <ZenBar
        onBack={noop}
        onSwitchClick={noop}
        onSearchClick={overrides.onSearchClick ?? noop}
        onNewClick={noop}
        undoRedo={undoRedoStub}
        onCopyClick={noop}
        copySettings={overrides.copySettings ?? { ...DEFAULT_COPY_SETTINGS }}
        onToggleCopySetting={overrides.onToggleCopySetting ?? noop}
        onCopyPathClick={noop}
        scope="full"
        onSaveClick={noop}
        onBodyClick={overrides.onBodyClick ?? noop}
        bodyActive={overrides.bodyActive ?? false}
        onExportClick={noop}
        onZoomOut={noop}
        onZoomIn={noop}
        onCenterRoot={noop}
        onFit={noop}
        layout={overrides.layout ?? ('mindmap' satisfies LayoutKind)}
        onSwitchLayout={overrides.onSwitchLayout ?? noop}
        expandLevel={overrides.expandLevel ?? 'all'}
        onExpandLevel={overrides.onExpandLevel ?? noop}
        viewMode={overrides.viewMode ?? 'mindmap'}
        onSwitchView={overrides.onSwitchView ?? noop}
        outlineVisible={overrides.outlineVisible ?? false}
        onToggleOutline={overrides.onToggleOutline ?? noop}
        onCopyWechat={overrides.onCopyWechat ?? noop}
        wechatCopyBusy={overrides.wechatCopyBusy ?? false}
        kanbanArchiveOpen={overrides.kanbanArchiveOpen ?? false}
        onToggleKanbanArchive={overrides.onToggleKanbanArchive ?? noop}
        onSettingsClick={overrides.onSettingsClick ?? noop}
        isBasket={overrides.isBasket ?? false}
        onSortBasket={overrides.onSortBasket ?? noop}
      />
    </TooltipProvider>,
  )
}

/** 展开复制选项下拉（pointerdown 同 dropdown-menu.test 驱动模式） */
function openMenu(): void {
  fireEvent.pointerDown(screen.getByTestId('btn-copy-options'), { button: 0 })
}

describe('ZenBar 复制选项下拉', () => {
  beforeEach(() => {
    useAppStore.getState().setAdapter(new MemoryFsAdapter())
    useAppStore.setState({ configPath: '/cfg.json', settings: { ...DEFAULT_COPY_SETTINGS } })
  })
  afterEach(cleanup)

  test('箭头展开菜单：三项勾选态反映 copySettings 现值（默认 双链on/含正文on/含图标状态off——2026-09 粘 AI 防干扰默认剥）', () => {
    renderBar()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    openMenu()
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.queryByTestId('copy-note-option')).not.toBeInTheDocument()
    expect(screen.getByTestId('copy-links-option')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('copy-include-body')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('copy-include-icon-status')).toHaveAttribute('aria-checked', 'false')
  })

  test('勾选即回调对应 key，菜单保持打开可连续切换（onSelect preventDefault）', () => {
    const onToggle = vi.fn()
    renderBar({ onToggleCopySetting: onToggle })
    openMenu()
    fireEvent.click(screen.getByTestId('copy-links-option'))
    expect(onToggle).toHaveBeenCalledWith('copyIncludeLinks')
    // 菜单未关：后续项仍可点（同径再验 2026-09 正文项 copyIncludeBody）
    fireEvent.click(screen.getByTestId('copy-include-body'))
    expect(onToggle).toHaveBeenCalledWith('copyIncludeBody')
    fireEvent.click(screen.getByTestId('copy-include-icon-status'))
    expect(onToggle).toHaveBeenCalledWith('copyIncludeIconStatus')
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  test('接线真实 store：勾选走 setSetting 更新状态并 load-merge-save 持久化', async () => {
    // 预置一份既有配置：合并保存不得覆盖其他字段
    await useAppStore.getState().adapter.writeTextFileAtomic(
      '/cfg.json',
      JSON.stringify({ workspaceDir: '/ws', lastOpened: null, preferredLayout: 'logic', theme: 'dark' }),
    )
    // EditorView 同款接线：props 取 store 现值、toggle 反写 setSetting
    renderBar({
      copySettings: useAppStore.getState().settings,
      onToggleCopySetting: (key) => {
        void useAppStore.getState().setSetting(key, !useAppStore.getState().settings[key])
      },
    })
    openMenu()
    fireEvent.click(screen.getByTestId('copy-links-option'))
    fireEvent.click(screen.getByTestId('copy-include-body'))
    fireEvent.click(screen.getByTestId('copy-include-icon-status'))
    await waitFor(() =>
      expect(useAppStore.getState().settings).toEqual({ copyIncludeLinks: false, copyIncludeBody: false, copyIncludeIconStatus: true }),
    )
    const cfg = JSON.parse(await useAppStore.getState().adapter.readTextFile('/cfg.json'))
    expect(cfg.settings).toEqual({ copyIncludeLinks: false, copyIncludeBody: false, copyIncludeIconStatus: true })
    expect(cfg.workspaceDir).toBe('/ws') // 合并保存保留其他字段
    expect(cfg.preferredLayout).toBe('logic')
    expect(cfg.theme).toBe('dark')
  })
})

// ---- 更多布局下拉（2026-09 时间轴/鱼骨图）：常用三钮常驻，非常用收进「更多」单选菜单 ----

describe('ZenBar 更多布局下拉', () => {
  beforeEach(() => {
    useAppStore.getState().setAdapter(new MemoryFsAdapter())
    useAppStore.setState({ configPath: '/cfg.json', settings: { ...DEFAULT_COPY_SETTINGS } })
  })
  afterEach(cleanup)

  test('常用三钮常驻；时间轴/鱼骨图收进更多钮，展开为单选菜单、点击即回调', () => {
    const onSwitch = vi.fn()
    renderBar({ onSwitchLayout: onSwitch })
    expect(screen.getByTestId('layout-mindmap')).toBeInTheDocument()
    expect(screen.getByTestId('layout-logic')).toBeInTheDocument()
    expect(screen.getByTestId('layout-org')).toBeInTheDocument()
    expect(screen.queryByTestId('layout-timeline')).not.toBeInTheDocument() // 未展开不可见
    fireEvent.pointerDown(screen.getByTestId('btn-layout-more'), { button: 0 })
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByTestId('layout-timeline')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByTestId('layout-fishbone')).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(screen.getByTestId('layout-timeline'))
    expect(onSwitch).toHaveBeenCalledWith('timeline')
  })

  test('当前布局为收起项时：更多钮点亮（data-active 通道，规避 DropdownMenuTrigger 遮蔽 data-state）、语义名换成当前布局', () => {
    renderBar({ layout: 'fishbone' })
    const more = screen.getByTestId('btn-layout-more')
    expect(more).toHaveAttribute('data-active', '')
    expect(more).toHaveAttribute('aria-label', '鱼骨图')
  })

  test('当前布局为常用项时：更多钮常态收起（无 data-active、语义名「更多布局」）', () => {
    renderBar({ layout: 'org' })
    const more = screen.getByTestId('btn-layout-more')
    expect(more).not.toHaveAttribute('data-active')
    expect(more).toHaveAttribute('aria-label', '更多布局')
  })
})

// ---- 视图切换组（2026-09 看板模式）：导图/Markdown/看板三钮（布局组同款 ToggleGroup 语言）----

describe('ZenBar 视图切换组', () => {
  afterEach(cleanup)

  test('三 testid 常驻：导图态导图钮点亮；点击看板钮回调 onSwitchView("kanban")', () => {
    const onSwitchView = vi.fn()
    renderBar({ viewMode: 'mindmap', onSwitchView })
    expect(screen.getByTestId('btn-view-mindmap')).toHaveAttribute('data-state', 'on')
    expect(screen.getByTestId('btn-view-kanban')).toHaveAttribute('data-state', 'off')
    fireEvent.click(screen.getByTestId('btn-view-kanban'))
    expect(onSwitchView).toHaveBeenCalledWith('kanban')
  })

  test('看板态：看板钮点亮、导图钮常态；点导图钮回调 onSwitchView("mindmap")', () => {
    const onSwitchView = vi.fn()
    renderBar({ viewMode: 'kanban', onSwitchView })
    expect(screen.getByTestId('btn-view-kanban')).toHaveAttribute('data-state', 'on')
    expect(screen.getByTestId('btn-view-mindmap')).toHaveAttribute('data-state', 'off')
    fireEvent.click(screen.getByTestId('btn-view-mindmap'))
    expect(onSwitchView).toHaveBeenCalledWith('mindmap')
  })
})

// ---- 正文面板开关钮（2026-09 写作）：常态按钮非触发器，激活态走 data-active 通道 ----

describe('ZenBar 正文面板开关', () => {
  afterEach(cleanup)

  test('点击回调 onBodyClick；面板开时点亮（data-active + aria-pressed），关时常态', () => {
    const onBody = vi.fn()
    renderBar({ onBodyClick: onBody, bodyActive: false })
    const btn = screen.getByTestId('btn-body')
    expect(btn).not.toHaveAttribute('data-active')
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(btn)
    expect(onBody).toHaveBeenCalledTimes(1)
    cleanup()
    renderBar({ bodyActive: true })
    const lit = screen.getByTestId('btn-body')
    expect(lit).toHaveAttribute('data-active', '')
    expect(lit).toHaveAttribute('aria-pressed', 'true')
  })
})

// ---- 导航钮（2026-09 导航系统 → 画布三态 M3）：恒「返回案头」提示 + 设置齿轮；
// ---- 工作台直达钮随工作台机制退役（btn-goto-workbench 不存在） ----

describe('砚栏导航钮(两空间收敛)', () => {
  test('返回钮提示恒「返回案头」(backTarget 机制退役)', () => {
    renderBar()
    expect(screen.getByTestId('btn-back').getAttribute('aria-label')).toBe('返回案头')
  })

  test('工作台直达钮已退役;设置钮渲染且回调触发', () => {
    const onSettingsClick = vi.fn()
    renderBar({ onSettingsClick })
    expect(screen.queryByTestId('btn-goto-workbench')).toBeNull()
    fireEvent.click(screen.getByTestId('btn-editor-settings'))
    expect(onSettingsClick).toHaveBeenCalledTimes(1)
  })

  test('搜索节点钮:三态常驻;点击回调 onSearchClick', () => {
    const onSearchClick = vi.fn()
    for (const v of ['mindmap', 'markdown', 'kanban'] as const) {
      cleanup()
      renderBar({ viewMode: v, onSearchClick })
      expect(screen.getByTestId('btn-search')).toHaveAttribute('aria-label', '搜索节点（Ctrl+F）')
    }
    fireEvent.click(screen.getByTestId('btn-search'))
    expect(onSearchClick).toHaveBeenCalledTimes(1)
  })
})

// ---- 三态矩阵（2026-09 画布三态）：视图组三钮 + 按 viewMode 显隐各段 + 大纲/归档两枚专有钮 ----
// 显隐约定（task-5 brief）：Markdown 态藏 撤销重做/正文/导出/缩放/布局，露大纲钮；
// 看板态藏 布局/缩放（撤销重做在），露归档钮；导图态全量在、两专有钮不在。

const T = (id: string) => screen.queryByTestId(id)

describe('ZenBar 三态矩阵', () => {
  afterEach(cleanup)

  test('导图态：全量按钮在（布局/缩放/层级/正文/导出/撤销重做），大纲与归档钮不在', () => {
    renderBar({ viewMode: 'mindmap' })
    for (const id of ['layout-mindmap', 'btn-zoom-in', 'btn-expand-level', 'btn-body', 'btn-export', 'btn-undo', 'btn-copy', 'btn-save', 'btn-back']) {
      expect(T(id)).not.toBeNull()
    }
    expect(T('btn-outline-toggle')).toBeNull()
    expect(T('btn-kanban-archive')).toBeNull()
  })

  test('Markdown 态：撤销/重做/正文/导出/缩放/布局/层级隐藏，大纲钮在，复制/保存/返回在', () => {
    renderBar({ viewMode: 'markdown' })
    for (const id of ['btn-undo', 'btn-redo', 'btn-body', 'btn-export', 'btn-zoom-in', 'layout-mindmap', 'btn-layout-more', 'btn-expand-level']) {
      expect(T(id)).toBeNull()
    }
    for (const id of ['btn-outline-toggle', 'btn-copy', 'btn-save', 'btn-back', 'btn-switch', 'btn-new']) {
      expect(T(id)).not.toBeNull()
    }
  })

  test('看板态：撤销/重做在，布局/缩放/层级隐藏，归档钮在', () => {
    renderBar({ viewMode: 'kanban' })
    expect(T('btn-undo')).not.toBeNull()
    expect(T('btn-kanban-archive')).not.toBeNull()
    expect(T('layout-mindmap')).toBeNull()
    expect(T('btn-expand-level')).toBeNull()
    expect(T('btn-outline-toggle')).toBeNull()
  })

  test('视图组三钮：markdown 钮存在', () => {
    renderBar({ viewMode: 'markdown' })
    expect(T('btn-view-mindmap')).not.toBeNull()
    expect(T('btn-view-markdown')).not.toBeNull()
    expect(T('btn-view-kanban')).not.toBeNull()
  })
})

// ---- 公众号复制钮（2026-09 复制家族成员：复制组/路径之后，三态恒显）+ busy 禁用 ----

describe('ZenBar 公众号复制钮', () => {
  afterEach(cleanup)

  test('三态恒显（数据源 = 内存树现场序列化，与视图态无关）：语义名「复制为公众号格式」，点击回调', () => {
    const onCopyWechat = vi.fn()
    for (const v of ['mindmap', 'markdown', 'kanban'] as const) {
      cleanup()
      renderBar({ viewMode: v, onCopyWechat })
      const btn = screen.getByTestId('btn-copy-wechat')
      expect(btn).toHaveAttribute('aria-label', '复制为公众号格式')
      expect(btn).toBeEnabled()
    }
    fireEvent.click(screen.getByTestId('btn-copy-wechat'))
    expect(onCopyWechat).toHaveBeenCalledTimes(1)
  })

  test('busy=true：钮禁用（在途防连点信号，由 useWechatCopy 驱动）', () => {
    renderBar({ wechatCopyBusy: true })
    expect(screen.getByTestId('btn-copy-wechat')).toBeDisabled()
  })
})

// ---- 专有钮点亮语言（同 btn-body：data-active 通道 + aria-pressed），点击走各自回调 ----

describe('ZenBar 大纲/归档专有钮', () => {
  afterEach(cleanup)

  test('大纲钮：显时点亮（data-active + aria-pressed=true、提示「隐藏大纲」），隐时常态；点击回调 onToggleOutline', () => {
    const onToggleOutline = vi.fn()
    renderBar({ viewMode: 'markdown', outlineVisible: false, onToggleOutline })
    const hidden = screen.getByTestId('btn-outline-toggle')
    expect(hidden).not.toHaveAttribute('data-active')
    expect(hidden).toHaveAttribute('aria-pressed', 'false')
    expect(hidden).toHaveAttribute('aria-label', '显示大纲')
    fireEvent.click(hidden)
    expect(onToggleOutline).toHaveBeenCalledTimes(1)
    cleanup()
    renderBar({ viewMode: 'markdown', outlineVisible: true })
    const lit = screen.getByTestId('btn-outline-toggle')
    expect(lit).toHaveAttribute('data-active', '')
    expect(lit).toHaveAttribute('aria-pressed', 'true')
    expect(lit).toHaveAttribute('aria-label', '隐藏大纲')
  })

  test('归档钮：开时点亮、关时常态；点击回调 onToggleKanbanArchive', () => {
    const onToggleKanbanArchive = vi.fn()
    renderBar({ viewMode: 'kanban', kanbanArchiveOpen: false, onToggleKanbanArchive })
    const closed = screen.getByTestId('btn-kanban-archive')
    expect(closed).not.toHaveAttribute('data-active')
    expect(closed).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(closed)
    expect(onToggleKanbanArchive).toHaveBeenCalledTimes(1)
    cleanup()
    renderBar({ viewMode: 'kanban', kanbanArchiveOpen: true })
    const lit = screen.getByTestId('btn-kanban-archive')
    expect(lit).toHaveAttribute('data-active', '')
    expect(lit).toHaveAttribute('aria-pressed', 'true')
  })
})

// ---- 整理篮子钮（2026-09 点子篮子 M1，spec §4.3）：仅当前图 = 篮子图时出现 ----

describe('ZenBar 整理篮子钮', () => {
  afterEach(cleanup)

  test('isBasket=false（默认，普通导图）：钮不在——篮子语义不跨图外溢', () => {
    renderBar()
    expect(T('btn-sort-basket')).toBeNull()
  })

  test('isBasket=true：钮在、语义名「整理篮子」（aria-label 与浮签同源）；点击回调 onSortBasket', () => {
    const onSortBasket = vi.fn()
    renderBar({ isBasket: true, onSortBasket })
    const btn = screen.getByTestId('btn-sort-basket')
    expect(btn).toHaveAttribute('aria-label', '整理篮子')
    fireEvent.click(btn)
    expect(onSortBasket).toHaveBeenCalledTimes(1)
  })
})
