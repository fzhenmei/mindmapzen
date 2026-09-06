// src/components/ZenBar.tsx —— 纸面命令栏（M5a 拆分自 EditorView；M12b 底部停泊）：
// 底部居中 40px 全不透明（spec §3：旧「静置淡化、悬停浮现」隐身游戏随青松工作台退役）。
// 纯展示组件：状态与回调全经 props；快捷键（Ctrl+S / Ctrl+C 复制 md / 正文面板开关）不在此处，
// 仍由 EditorView 的 window keydown effect 承担（命令栏只是按钮路径）。
// 2026-09-06 备注合并：btn-note 退役——正文（含备注语义）唯一砚栏入口为 btn-body。
// M14 Task 5：内件全 ui——Button(ghost,icon) + ui Tooltip（官方默认内距 py-1.5 px-3）+
// ui Separator + 布局组 ui ToggleGroup；外壳仅存停泊定位（M14 spec §4 唯一手搓例外）。
import type { ReactNode } from 'react'
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
  IconLayoutBoth,
  IconLayoutDown,
  IconLayoutFishbone,
  IconLayoutRight,
  IconLayoutTimeline,
  IconMinus,
  IconPlus,
  IconRedo,
  IconRoute,
  IconSave,
  IconSwitch,
  IconUndo,
} from './icons'

interface Props {
  /** 返回文件库（EditorView 组合：暂停自动保存 → 显式保存链 → 成功才导航） */
  onBack(): void
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
  /** 正文面板开关（2026-09 写作）：右侧常驻面板开/收（面板状态与防抖写回在 useBodyPanel；
   *  无选中也可开——面板出空态文案，选中后联动载入） */
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

/** 收起的非常用布局（2026-09 时间轴/鱼骨图）：不占常驻钮位，收进「更多」单选下拉；
 *  当前激活时触发钮点亮并换显该布局图标 + 语义名（aria-label），不点开也知当前布局 */
const MORE_LAYOUTS = [
  ['timeline', '时间轴', <IconLayoutTimeline key="t" />],
  ['fishbone', '鱼骨图', <IconLayoutFishbone key="f" />],
] as const

/** 纸面命令栏：返回/回退/重做/复制/保存/正文面板/导出 + 缩放与视图四键 + 布局切换（纯展示，状态与回调全经 props；
 *  快捷键仍由 EditorView 的 window keydown effect 承担） */
export default function ZenBar({
  onBack,
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
}: Readonly<Props>) {
  const copyLabel =
    scope === 'branch'
      ? '复制选中分支为 Markdown（Ctrl+C）'
      : '复制整图为 Markdown（Ctrl+C）'
  // 更多布局触发钮的激活态：当前布局是收起项时点亮（Toggle pressed → data-state=on，同组点亮语言）
  const moreActive = MORE_LAYOUTS.find(([kind]) => kind === layout) ?? null
  return (
    // zen-bar 类名保留为视觉冒烟钩子（skin 已全转 utility，App.css 无对应规则）
    <header
      data-testid="zen-bar"
      className="zen-bar absolute bottom-3 left-1/2 z-10 flex h-10 -translate-x-1/2 items-center gap-0.5 rounded-lg bg-card px-2.5 shadow-lg"
    >
      <Tip label="返回案头">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="btn-back"
          aria-label="返回案头"
          onClick={onBack}
        >
          <IconArrowLeft />
        </Button>
      </Tip>
      <Tip label="切换导图（Ctrl+P）">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="btn-switch"
          aria-label="切换导图（Ctrl+P）"
          onClick={onSwitchClick}
        >
          <IconSwitch />
        </Button>
      </Tip>
      <Tip label="新建导图">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="btn-new"
          aria-label="新建导图"
          onClick={onNewClick}
        >
          <IconFilePlus />
        </Button>
      </Tip>
      <Separator orientation="vertical" className="mx-1" />
      <Tip label="回退（Ctrl+Z）">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="btn-undo"
          aria-label="回退（Ctrl+Z）"
          onClick={undoRedo.onUndo}
          disabled={!undoRedo.canUndo}
        >
          <IconUndo />
        </Button>
      </Tip>
      <Tip label="重做（Ctrl+Y）">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="btn-redo"
          aria-label="重做（Ctrl+Y）"
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
              aria-label="复制选项"
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
            保留双链标记
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            data-testid="copy-include-body"
            checked={copySettings.copyIncludeBody}
            onCheckedChange={() => onToggleCopySetting('copyIncludeBody')}
            onSelect={(e) => e.preventDefault()}
          >
            含正文
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Tip label="复制文件路径（发给 AI 直接读取）">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="btn-copy-path"
          aria-label="复制文件路径（发给 AI 直接读取）"
          onClick={onCopyPathClick}
        >
          <IconRoute />
        </Button>
      </Tip>
      <Tip label="保存（Ctrl+S）">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="btn-save"
          aria-label="保存（Ctrl+S）"
          onClick={onSaveClick}
        >
          <IconSave />
        </Button>
      </Tip>
      {/* 正文面板开关（2026-09 写作）：常态按钮（非 DropdownMenu 触发器），激活态走
       *  data-active 通道（同 btn-layout-more 的点亮语言；不依赖 data-state） */}
      <Tip label="撰写选中节点的正文">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="btn-body"
          data-active={bodyActive ? '' : undefined}
          aria-label="撰写选中节点的正文"
          aria-pressed={bodyActive}
          onClick={onBodyClick}
          className="data-[active]:bg-accent data-[active]:text-accent-foreground"
        >
          <IconFileText />
        </Button>
      </Tip>
      <Tip label="导出或复制为图片">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="btn-export"
          aria-label="导出或复制为图片"
          onClick={onExportClick}
        >
          <IconImage />
        </Button>
      </Tip>
      <Separator orientation="vertical" className="mx-1" />
      <Tip label="缩小（Ctrl+滚轮）">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="btn-zoom-out"
          aria-label="缩小（Ctrl+滚轮）"
          onClick={onZoomOut}
        >
          <IconMinus />
        </Button>
      </Tip>
      <Tip label="放大（Ctrl+滚轮）">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="btn-zoom-in"
          aria-label="放大（Ctrl+滚轮）"
          onClick={onZoomIn}
        >
          <IconPlus />
        </Button>
      </Tip>
      <Tip label="根居中：保持缩放回根">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="btn-center-root"
          aria-label="根居中：保持缩放回根"
          onClick={onCenterRoot}
        >
          <IconCrosshair />
        </Button>
      </Tip>
      <Tip label="适配整图">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="btn-fit"
          aria-label="适配整图"
          onClick={onFit}
        >
          <IconFrame />
        </Button>
      </Tip>
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
        aria-label="布局切换"
      >
        {(
          [
            ['mindmap', '思维导图（右向）', <IconLayoutRight key="r" />],
            ['logic', '逻辑图（左右）', <IconLayoutBoth key="b" />],
            ['org', '组织结构图（向下）', <IconLayoutDown key="d" />],
          ] as const
        ).map(([kind, label, icon]) => (
          <ToggleGroupItem key={kind} value={kind} data-testid={`layout-${kind}`} aria-label={label} title={label}>
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
            aria-label={moreActive ? moreActive[1] : '更多布局'}
            title={moreActive ? moreActive[1] : '更多布局'}
            className="data-[active]:bg-accent data-[active]:text-accent-foreground"
          >
            {moreActive ? moreActive[2] : <IconChevronDown />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup
            value={layout}
            onValueChange={(v) => onSwitchLayout(v as LayoutKind)}
          >
            {MORE_LAYOUTS.map(([kind, label]) => (
              <DropdownMenuRadioItem key={kind} value={kind} data-testid={`layout-${kind}`}>
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
