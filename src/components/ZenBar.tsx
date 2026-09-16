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
import type { CopySettingKey, CopySettings } from '../types/files'
import { Button } from './ui/button'
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
  IconMinus,
  IconNetwork,
  IconPlus,
  IconRedo,
  IconRoute,
  IconSave,
  IconSettings,
  IconSwitch,
  IconUndo,
  IconWorkbench,
} from './icons'

interface Props {
  /** 返回文件库（EditorView 组合：暂停自动保存 → 显式保存链 → 成功才导航） */
  onBack(): void
  /** 返回目标(2026-09 导航系统 spec §3 R1):来路驱动提示——workbench 时「返回工作台」 */
  backTarget: 'library' | 'workbench'
  /** 去工作台(2026-09 导航系统 spec §4):固定语义直达,无论来路;走 leaveTo 安全链 */
  onWorkbenchClick(): void
  /** 打开设置(2026-09 导航系统 spec §6):App 级设置对话框 */
  onSettingsClick(): void
  /** 切换导图（v2.5）：呼出快速切换浮层（Ctrl+P 的按钮路径，同一安全切换链） */
  onSwitchClick(): void
  /** 新建导图（2026-09 画布内入口）：呼出新建对话框（名称+模板，复用案头组件）；
   *  确认后走 leaveTo 安全链保存当前图再跳转（逻辑在 EditorView） */
  onNewClick(): void
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
  /** 复制范围信号（M4 E2E 观测点）：branch=选中分支 / full=整图；同时驱动按钮提示 */
  scope: 'full' | 'branch'
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
  /** 当前激活布局（点亮对应布局按钮） */
  layout: LayoutKind
  /** 布局切换（引擎即时重排 + 偏好落盘，逻辑在 EditorView） */
  onSwitchLayout(kind: LayoutKind): void
  /** 视图模式（2026-09 看板模式）：导图 ⇄ 看板浮层（内存态，逻辑在 EditorView/appStore） */
  viewMode: 'mindmap' | 'kanban'
  /** 视图切换（同值 no-op 在 EditorView 的 switchView；快捷键 Ctrl+Shift+K 同效） */
  onSwitchView(v: 'mindmap' | 'kanban'): void
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
 *  快捷键仍由 EditorView 的 window keydown effect 承担） */
export default function ZenBar({
  onBack,
  backTarget,
  onWorkbenchClick,
  onSettingsClick,
  onSwitchClick,
  onNewClick,
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
  layout,
  onSwitchLayout,
  viewMode,
  onSwitchView,
}: Readonly<Props>) {
  const { t } = useTranslation()
  const copyLabel = scope === 'branch' ? t('editor.zenbar.copyBranchTip') : t('editor.zenbar.copyAllTip')
  // 返回钮文案（终审修复：Tip label 与 aria-label 两处同源）——工作台来路回工作台，案头来路回案头
  const backLabel = backTarget === 'workbench' ? t('editor.zenbar.backToWorkbench') : t('editor.zenbar.backToDesk')
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
      <Tip label={t('editor.zenbar.workbench')}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="btn-goto-workbench"
          aria-label={t('editor.zenbar.workbench')}
          onClick={onWorkbenchClick}
        >
          <IconWorkbench />
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
      {/* 正文面板开关（2026-09 写作）：常态按钮（非 DropdownMenu 触发器），激活态走
       *  data-active 通道（同 btn-layout-more 的点亮语言；不依赖 data-state） */}
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
      <Separator orientation="vertical" className="mx-1" />
      {/* 视图组（2026-09 看板模式）：导图 ⇄ 看板浮层，同布局组 ToggleGroup（single）语言
       *  （激活项 data-state=on、点已激活项 no-op）；项不加 ui Tooltip、用原生 title——
       *  同布局组的 TooltipTrigger(asChild) data-state 遮蔽 Radix Toggle on/off 冲突家族 */}
      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={(v) => {
          if (v) onSwitchView(v as 'mindmap' | 'kanban')
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
          value="kanban"
          data-testid="btn-view-kanban"
          aria-label={t('editor.zenbar.views.kanban')}
          title={t('editor.zenbar.views.kanban')}
        >
          <IconKanbanSquare />
        </ToggleGroupItem>
      </ToggleGroup>
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
