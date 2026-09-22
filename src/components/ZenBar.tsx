// src/components/ZenBar.tsx —— 纸面命令栏（M5a 拆分自 EditorView；M12b 底部停泊）：
// 底部居中 40px 全不透明（spec §3：旧「静置淡化、悬停浮现」隐身游戏随青松工作台退役）。
// 纯展示组件：状态与回调全经 props；快捷键（Ctrl+S / Ctrl+C 复制 md / 正文面板开关）不在此处，
// 仍由 EditorView 的 window keydown effect 承担（命令栏只是按钮路径）。
// 2026-09-06 备注合并：btn-note 退役——正文（含备注语义）唯一砚栏入口为 btn-body。
// M14 Task 5：内件全 ui——Button(ghost,icon) + ui Tooltip（官方默认内距 py-1.5 px-3）+
// ui Separator + 布局组 ui ToggleGroup；外壳仅存停泊定位（M14 spec §4 唯一手搓例外）。
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { LayoutKind } from '../editor/layoutMap'
import type { UndoRedo } from '../hooks/useUndoRedo'
import type { ViewMode } from '../store/appStore'
import type { CopySettingKey, CopySettings } from '../types/files'
import { Button } from './ui/button'
import ExpandLevelMenu from './ExpandLevelMenu'
import { Separator } from './ui/separator'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import {
  IconArchive,
  IconArrowLeft,
  IconChevronDown,
  IconCopy,
  IconCrosshair,
  IconFilePlus,
  IconFileText,
  IconFrame,
  IconImage,
  IconKanbanSquare,
  IconLayoutBoth,
  IconLayoutDown,
  IconLayoutFishbone,
  IconLayoutRight,
  IconLayoutTimeline,
  IconMarkdown,
  IconMinus,
  IconNetwork,
  IconOutline,
  IconPlus,
  IconRedo,
  IconRoute,
  IconSave,
  IconSettings,
  IconSort,
  IconSwitch,
  IconUndo,
} from './icons'

interface Props {
  /** 返回文件库（EditorView 组合：暂停自动保存 → 显式保存链 → 成功才导航）；
   *  两空间收敛（2026-09 画布三态 M3）后返回恒落案头，提示恒「返回案头」 */
  onBack(): void
  /** 打开设置(2026-09 导航系统 spec §6):App 级设置对话框 */
  onSettingsClick(): void
  /** 切换导图（v2.5）：呼出快速切换浮层（Ctrl+P 的按钮路径，同一安全切换链） */
  onSwitchClick(): void
  /** 新建导图（2026-09 画布内入口）：呼出新建对话框（名称+模板，复用案头组件）；
   *  确认后走 leaveTo 安全链保存当前图再跳转（逻辑在 EditorView） */
  onNewClick(): void
  /** 当前图 = 点子篮子（2026-09 点子篮子 M1）：显示「整理篮子」按钮 */
  isBasket: boolean
  /** 整理篮子（spec §4.3）：呼出批量整理浮层（浮层挂载在 EditorView） */
  onSortBasket(): void
  /** 回退/重做（v1.1，想法5）：引擎 BACK/FORWARD 命令 + back_forward 历史态驱动的禁用信号
   *  （状态与执行在 EditorView 的 useUndoRedo；键盘 Ctrl+Z/Y 走引擎原生与画布兜底，命令栏只是按钮路径） */
  undoRedo: UndoRedo
  /** 复制 Markdown（Ctrl+C 的按钮路径） */
  onCopyClick(): void
  /** 复制选项开关值（2026-09 从设置面板移入）：驱动下拉勾选态（数据与持久化在 store） */
  copySettings: CopySettings
  /** 切换复制选项（2026-09）：下拉勾选项的回写路径，key 限定三个复制开关 */
  onToggleCopySetting(key: CopySettingKey): void
  /** 复制文件路径（2026-09：发给 AI 直接读本文件；按钮紧邻复制 md 钮，
   *  IconRoute 路径图标与 IconCopy 形状区分） */
  onCopyPathClick(): void
  /** 复制范围信号（M4 E2E 观测点）：branch=选中分支 / multi=多选集合（2026-09-18 多选
   *  复制）/ full=整图；同时驱动按钮提示 */
  scope: 'full' | 'branch' | 'multi'
  /** 保存（Ctrl+S 的按钮路径） */
  onSaveClick(): void
  /** 正文弹窗开关（2026-09 写作；2026-09-08 弹窗化）：弹窗开/收（弹窗状态与防抖写回在
   *  useBodyDialog；无选中也可开——弹窗出空态文案，打开时载入当前选中） */
  onBodyClick(): void
  /** btn-body 激活信号：面板开着时点亮（data-active 通道） */
  bodyActive: boolean
  /** 导出/复制为图片（M5b）：打开三入口对话框（对话框状态在 EditorView 的 useExportFlow） */
  onExportClick(): void
  onZoomOut(): void
  onZoomIn(): void
  onCenterRoot(): void
  onFit(): void
  /** 当前展开层级（一键收起到 N 级，2026-09）：statusOps.expandLevelOf 派生；
   *  undefined = 手动混合折叠态，菜单不高亮任何项 */
  expandLevel: number | 'all' | undefined
  /** 展开层级点选：'all' → EXPAND_ALL；n → UNEXPAND_TO_LEVEL（命令落地在 EditorView，
   *  走命令通道自动获得置脏/保存链/undo/AI 回合锁） */
  onExpandLevel(v: number | 'all'): void
  /** 当前激活布局（点亮对应布局按钮） */
  layout: LayoutKind
  /** 布局切换（引擎即时重排 + 偏好落盘，逻辑在 EditorView） */
  onSwitchLayout(kind: LayoutKind): void
  /** 视图模式（2026-09 画布三态：导图/Markdown/看板，内存态，逻辑在 EditorView/appStore）：
   *  驱动各段显隐矩阵——Markdown 态藏 撤销重做/正文/导出/缩放/布局，看板态藏 布局/缩放 */
  viewMode: ViewMode
  /** 视图切换（同值 no-op 在 EditorView 的 switchView；快捷键 Ctrl+1/2/3 同效） */
  onSwitchView(v: ViewMode): void
  /** 大纲显隐（2026-09 画布三态）：Markdown 态专有钮；visible 由 MarkdownView 上报（auto 跟宽） */
  outlineVisible: boolean
  onToggleOutline(): void
  /** 归档列显隐（2026-09 画布三态）：看板态专有钮（toggle 宿主持有的 archiveOpen） */
  kanbanArchiveOpen: boolean
  onToggleKanbanArchive(): void
}

/** 浮签包装（本文件局部）：ui Tooltip 组合的简写——14 枚图标钮同构，
 *  label 为视觉提示，语义名由触发钮自身 aria-label 承担（二者职责分离，同 ZenTooltip 旧约） */
function Tip({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** 常用三布局钮（ToggleGroup 项）：kind + 图标元组——语义名渲染期经 t() 取（layouts 子域） */
const BAR_LAYOUTS = [
  ['mindmap', <IconLayoutRight key="r" />],
  ['logic', <IconLayoutBoth key="b" />],
  ['org', <IconLayoutDown key="d" />],
] as const

/** 收起的非常用布局（2026-09 时间轴/鱼骨图）：不占常驻钮位，收进「更多」单选下拉；
 *  当前激活时触发钮点亮并换显该布局图标 + 语义名（aria-label），不点开也知当前布局 */
const MORE_LAYOUTS = [
  ['timeline', <IconLayoutTimeline key="t" />],
  ['fishbone', <IconLayoutFishbone key="f" />],
] as const

/** 纸面命令栏：返回/回退/重做/复制/保存/正文面板/导出 + 缩放与视图四键 + 布局切换（纯展示，状态与回调全经 props；
 *  快捷键仍由 EditorView 的 window keydown effect 承担）。
 *  2026-09 画布三态：左段（返回/切换/新建|撤销重做|复制组/路径/保存）与视图组恒显，
 *  缩放/布局/正文/导出为导图态专属；Markdown 态露大纲钮、看板态露归档钮（视图组右侧专有段）。
 *  2026-09 画布三态 M3：工作台直达钮随工作台机制退役（总览并入案头欢迎页） */
export default function ZenBar({
  onBack,
  onSettingsClick,
  onSwitchClick,
  onNewClick,
  isBasket,
  onSortBasket,
  undoRedo,
  onCopyClick,
  copySettings,
  onToggleCopySetting,
  onCopyPathClick,
  scope,
  onSaveClick,
  onBodyClick,
  bodyActive,
  onExportClick,
  onZoomOut,
  onZoomIn,
  onCenterRoot,
  onFit,
  expandLevel,
  onExpandLevel,
  layout,
  onSwitchLayout,
  viewMode,
  onSwitchView,
  outlineVisible,
  onToggleOutline,
  kanbanArchiveOpen,
  onToggleKanbanArchive,
}: Readonly<Props>) {
  const { t } = useTranslation()
  // 三态显隐矩阵（2026-09 画布三态）：mmView=Markdown 态（藏 撤销重做/正文/导出/缩放/布局）；
  // mapOnly=导图态（缩放/布局/正文/导出为画布专属，Markdown/看板两态不显）
  const mmView = viewMode === 'markdown'
  const mapOnly = viewMode === 'mindmap'
  // 复制钮提示三态（scope 同源）：整图/选中分支/多选集合（2026-09-18 多选复制）
  const copyLabels: Record<'full' | 'branch' | 'multi', string> = {
    full: t('editor.zenbar.copyAllTip'),
    branch: t('editor.zenbar.copyBranchTip'),
    multi: t('editor.zenbar.copyMultiTip'),
  }
  const copyLabel = copyLabels[scope]
  // 返回钮文案（终审修复：Tip label 与 aria-label 两处同源）——两空间收敛后恒「返回案头」
  const backLabel = t('editor.zenbar.backToDesk')
  // 布局语义名（键集与 LayoutKind 一一对应）：常用钮/更多下拉/触发钮 aria 三处共用
  const layoutNames: Record<LayoutKind, string> = {
    mindmap: t('editor.zenbar.layouts.mindmap'),
    logic: t('editor.zenbar.layouts.logic'),
    org: t('editor.zenbar.layouts.org'),
    timeline: t('editor.zenbar.layouts.timeline'),
    fishbone: t('editor.zenbar.layouts.fishbone'),
  }
  // 更多布局触发钮的激活态：当前布局是收起项时点亮（Toggle pressed → data-state=on，同组点亮语言）
  const moreActive = MORE_LAYOUTS.find(([kind]) => kind === layout) ?? null
  const moreLabel = moreActive ? layoutNames[moreActive[0]] : t('editor.zenbar.moreLayouts')
  return (
    // zen-bar 类名保留为视觉冒烟钩子（skin 已全转 utility，App.css 无对应规则）
    <header
      data-testid="zen-bar"
      className="zen-bar absolute bottom-3 left-1/2 z-10 flex h-10 -translate-x-1/2 items-center gap-0.5 rounded-lg bg-card px-2.5 shadow-lg"
    >
      <Tip label={backLabel}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="btn-back"
          aria-label={backLabel}
          onClick={onBack}
        >
          <IconArrowLeft />
        </Button>
      </Tip>
      <Tip label={t('editor.zenbar.switchMap')}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="btn-switch"
          aria-label={t('editor.zenbar.switchMap')}
          onClick={onSwitchClick}
        >
          <IconSwitch />
        </Button>
      </Tip>
      <Tip label={t('editor.zenbar.newMap')}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="btn-new"
          aria-label={t('editor.zenbar.newMap')}
          onClick={onNewClick}
        >
          <IconFilePlus />
        </Button>
      </Tip>
      {/* 整理篮子（2026-09 点子篮子 M1，spec §4.3）：仅当前图 = 篮子图时出现——篮子语义
       *  不外溢到普通导图；入口在砚栏（编辑器的主命令面），浮层本体由 EditorView 挂载 */}
      {isBasket && (
        <Tip label={t('editor.zenbar.sortBasket')}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-testid="btn-sort-basket"
            aria-label={t('editor.zenbar.sortBasket')}
            onClick={onSortBasket}
          >
            <IconSort />
          </Button>
        </Tip>
      )}
      {/* 撤销/重做段（含前置分隔线整段包裹，避免孤立分隔线）：Markdown 态隐藏
       *  （编辑走 vditor 自有历史），导图/看板两态在（引擎 back_forward 历史共享） */}
      {!mmView && (
        <>
          <Separator orientation="vertical" className="mx-1" />
          <Tip label={t('editor.zenbar.undo')}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-testid="btn-undo"
              aria-label={t('editor.zenbar.undo')}
              onClick={undoRedo.onUndo}
              disabled={!undoRedo.canUndo}
            >
              <IconUndo />
            </Button>
          </Tip>
          <Tip label={t('editor.zenbar.redo')}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-testid="btn-redo"
              aria-label={t('editor.zenbar.redo')}
              onClick={undoRedo.onRedo}
              disabled={!undoRedo.canRedo}
            >
              <IconRedo />
            </Button>
          </Tip>
        </>
      )}
      <Separator orientation="vertical" className="mx-1" />
      {/* 复制组 = split button（2026-09 复制选项自设置面板移入）：主钮照常复制（Ctrl+C 同径），
       *  箭头钮展开两项勾选（2026-09-06 备注合并后 copyIncludeNote 退役，「包含备注」项拆除），
       *  勾选即改即存（store setSetting）；onSelect preventDefault 保持菜单打开，可连续切换
       *  （ESC/点外部关闭）。箭头钮不加 Tooltip：菜单自身即说明 */}
      <DropdownMenu>
        <div className="flex items-center">
          <Tip label={copyLabel}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-testid="btn-copy"
              data-scope={scope}
              aria-label={copyLabel}
              onClick={onCopyClick}
            >
              <IconCopy />
            </Button>
          </Tip>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              data-testid="btn-copy-options"
              aria-label={t('editor.zenbar.copyOptions')}
              className="h-9 w-5 px-0"
            >
              <IconChevronDown size={10} />
            </Button>
          </DropdownMenuTrigger>
        </div>
        <DropdownMenuContent align="start">
          <DropdownMenuCheckboxItem
            data-testid="copy-links-option"
            checked={copySettings.copyIncludeLinks}
            onCheckedChange={() => onToggleCopySetting('copyIncludeLinks')}
            onSelect={(e) => e.preventDefault()}
          >
            {t('editor.zenbar.copyIncludeLinks')}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            data-testid="copy-include-body"
            checked={copySettings.copyIncludeBody}
            onCheckedChange={() => onToggleCopySetting('copyIncludeBody')}
            onSelect={(e) => e.preventDefault()}
          >
            {t('editor.zenbar.copyIncludeBody')}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            data-testid="copy-include-icon-status"
            checked={copySettings.copyIncludeIconStatus}
            onCheckedChange={() => onToggleCopySetting('copyIncludeIconStatus')}
            onSelect={(e) => e.preventDefault()}
          >
            {t('editor.zenbar.copyIncludeIconStatus')}
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Tip label={t('editor.zenbar.copyPathTip')}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="btn-copy-path"
          aria-label={t('editor.zenbar.copyPathTip')}
          onClick={onCopyPathClick}
        >
          <IconRoute />
        </Button>
      </Tip>
      <Tip label={t('editor.zenbar.save')}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="btn-save"
          aria-label={t('editor.zenbar.save')}
          onClick={onSaveClick}
        >
          <IconSave />
        </Button>
      </Tip>
      {/* 正文 + 导出（导图态专属）：正文弹窗开关常态按钮（非 DropdownMenu 触发器），
       *  激活态走 data-active 通道（同 btn-layout-more 的点亮语言；不依赖 data-state）；
       *  Markdown/看板态无选中节点语义，两钮隐藏 */}
      {mapOnly && (
        <>
          <Tip label={t('editor.zenbar.bodyPanel')}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-testid="btn-body"
              data-active={bodyActive ? '' : undefined}
              aria-label={t('editor.zenbar.bodyPanel')}
              aria-pressed={bodyActive}
              onClick={onBodyClick}
              className="data-[active]:bg-accent data-[active]:text-accent-foreground"
            >
              <IconFileText />
            </Button>
          </Tip>
          <Tip label={t('editor.zenbar.exportImage')}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-testid="btn-export"
              aria-label={t('editor.zenbar.exportImage')}
              onClick={onExportClick}
            >
              <IconImage />
            </Button>
          </Tip>
        </>
      )}
      {/* 缩放四键（含前置分隔线，导图态专属）：引擎画布缩放/定位；Markdown/看板无缩放语义 */}
      {mapOnly && (
        <>
          <Separator orientation="vertical" className="mx-1" />
          <Tip label={t('editor.zenbar.zoomOut')}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-testid="btn-zoom-out"
              aria-label={t('editor.zenbar.zoomOut')}
              onClick={onZoomOut}
            >
              <IconMinus />
            </Button>
          </Tip>
          <Tip label={t('editor.zenbar.zoomIn')}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-testid="btn-zoom-in"
              aria-label={t('editor.zenbar.zoomIn')}
              onClick={onZoomIn}
            >
              <IconPlus />
            </Button>
          </Tip>
          <Tip label={t('editor.zenbar.centerRoot')}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-testid="btn-center-root"
              aria-label={t('editor.zenbar.centerRoot')}
              onClick={onCenterRoot}
            >
              <IconCrosshair />
            </Button>
          </Tip>
          <Tip label={t('editor.zenbar.fitView')}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-testid="btn-fit"
              aria-label={t('editor.zenbar.fitView')}
              onClick={onFit}
            >
              <IconFrame />
            </Button>
          </Tip>
          {/* 展开层级下拉（一键收起到 N 级，2026-09）：缩放段的视图控制同族（导图态专属）；
              组件独立成文件（行数护栏），触发钮 IconLayers + 单选六项 */}
          <ExpandLevelMenu level={expandLevel} onSelect={onExpandLevel} />
        </>
      )}
      <Separator orientation="vertical" className="mx-1" />
      {/* 视图组（2026-09 画布三态）：导图/Markdown/看板三钮，同布局组 ToggleGroup（single）语言
       *  （激活项 data-state=on、点已激活项 no-op）；项不加 ui Tooltip、用原生 title——
       *  同布局组的 TooltipTrigger(asChild) data-state 遮蔽 Radix Toggle on/off 冲突家族 */}
      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={(v) => {
          if (v) onSwitchView(v as ViewMode)
        }}
        aria-label={t('editor.zenbar.viewToggle')}
      >
        <ToggleGroupItem
          value="mindmap"
          data-testid="btn-view-mindmap"
          aria-label={t('editor.zenbar.views.mindmap')}
          title={t('editor.zenbar.views.mindmap')}
        >
          <IconNetwork />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="markdown"
          data-testid="btn-view-markdown"
          aria-label={t('editor.zenbar.views.markdown')}
          title={t('editor.zenbar.views.markdown')}
        >
          <IconMarkdown />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="kanban"
          data-testid="btn-view-kanban"
          aria-label={t('editor.zenbar.views.kanban')}
          title={t('editor.zenbar.views.kanban')}
        >
          <IconKanbanSquare />
        </ToggleGroupItem>
      </ToggleGroup>
      {/* Markdown 态专有段（2026-09 画布三态）：大纲开关——visible 由 MarkdownView 上报（auto 跟宽），
       *  点亮语言同 btn-body（data-active 通道 + aria-pressed，不依赖 data-state） */}
      {viewMode === 'markdown' && (
        <>
          <Separator orientation="vertical" className="mx-1" />
          <Tip label={outlineVisible ? t('editor.zenbar.outlineHide') : t('editor.zenbar.outlineShow')}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-testid="btn-outline-toggle"
              data-active={outlineVisible ? '' : undefined}
              aria-label={outlineVisible ? t('editor.zenbar.outlineHide') : t('editor.zenbar.outlineShow')}
              aria-pressed={outlineVisible}
              onClick={onToggleOutline}
              className="data-[active]:bg-accent data-[active]:text-accent-foreground"
            >
              <IconOutline />
            </Button>
          </Tip>
        </>
      )}
      {/* 看板态专有段（2026-09 画布三态）：归档列显隐——toggle 宿主持有的 archiveOpen，
       *  点亮语言同上（data-active + aria-pressed） */}
      {viewMode === 'kanban' && (
        <>
          <Separator orientation="vertical" className="mx-1" />
          <Tip label={t('editor.zenbar.archiveToggle')}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-testid="btn-kanban-archive"
              data-active={kanbanArchiveOpen ? '' : undefined}
              aria-label={t('editor.zenbar.archiveToggle')}
              aria-pressed={kanbanArchiveOpen}
              onClick={onToggleKanbanArchive}
              className="data-[active]:bg-accent data-[active]:text-accent-foreground"
            >
              <IconArchive />
            </Button>
          </Tip>
        </>
      )}
      {/* 布局段（含前置分隔线，导图态专属）：布局只作用于导图画布，Markdown/看板态整段隐藏 */}
      {mapOnly && (
        <>
          <Separator orientation="vertical" className="mx-1" />
          {/* 布局组 = ui ToggleGroup（single）：激活项 data-state=on 官方点亮态；点已激活项为 no-op。
           *  项不加 ui Tooltip：TooltipTrigger(asChild) 会把自身 data-state(open/closed) 混入 item props，
           *  遮蔽 Radix Toggle 的 on/off 信号（官方 sidebar 以 data-active 规避同款冲突，Toggle 无此通道）；
           *  语义名由 item 自身 aria-label 承担（官方 ToggleGroup 文档同款 a11y 模式）。
           *  2026-09 UI 评审 P3-2：补原生 title 悬停提示——不经过 Tooltip 组件、无 data-state
           *  冲突，鼠标用户可辨识三个布局图标的语义（与全栏 14 钮的悬停体验对齐） */}
          <ToggleGroup
            type="single"
            value={layout}
            onValueChange={(v) => {
              if (v) onSwitchLayout(v as LayoutKind)
            }}
            aria-label={t('editor.zenbar.layoutToggle')}
          >
            {BAR_LAYOUTS.map(([kind, icon]) => (
              <ToggleGroupItem
                key={kind}
                value={kind}
                data-testid={`layout-${kind}`}
                aria-label={layoutNames[kind]}
                title={layoutNames[kind]}
              >
                {icon}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {/* 更多布局 = 单选下拉（2026-09 时间轴/鱼骨图）：收起非常用布局，不占常驻钮位。
           *  触发钮不用 ui Toggle：DropdownMenuTrigger 的 data-state(open/closed) 会遮蔽 Toggle 的
           *  on/off 点亮信号（同布局组 TooltipTrigger 冲突家族），激活态走 data-active 通道
           *  （官方 sidebar 同款规避）；语义名由 aria-label 承担，激活收起项时换显该布局图标 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                data-testid="btn-layout-more"
                data-active={moreActive !== null ? '' : undefined}
                aria-label={moreLabel}
                title={moreLabel}
                className="data-[active]:bg-accent data-[active]:text-accent-foreground"
              >
                {moreActive ? moreActive[1] : <IconChevronDown />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={layout}
                onValueChange={(v) => onSwitchLayout(v as LayoutKind)}
              >
                {MORE_LAYOUTS.map(([kind]) => (
                  <DropdownMenuRadioItem key={kind} value={kind} data-testid={`layout-${kind}`}>
                    {layoutNames[kind]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
      <Separator orientation="vertical" className="mx-1" />
      <Tip label={t('editor.zenbar.settings')}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="btn-editor-settings"
          aria-label={t('editor.zenbar.settings')}
          onClick={onSettingsClick}
        >
          <IconSettings />
        </Button>
      </Tip>
    </header>
  )
}
