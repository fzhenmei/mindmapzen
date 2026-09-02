// src/components/ZenBar.tsx —— 纸面命令栏（M5a 拆分自 EditorView；M12b 底部停泊）：
// 底部居中 40px 全不透明（spec §3：旧「静置淡化、悬停浮现」隐身游戏随青松工作台退役）。
// 纯展示组件：状态与回调全经 props；快捷键（Ctrl+S / Ctrl+C 复制 md / 备注编辑）不在此处，
// 仍由 EditorView 的 window keydown effect 承担（命令栏只是按钮路径）。
// M14 Task 5：内件全 ui——Button(ghost,icon) + ui Tooltip（官方默认内距 py-1.5 px-3）+
// ui Separator + 布局组 ui ToggleGroup；外壳仅存停泊定位（M14 spec §4 唯一手搓例外）。
import type { ReactNode } from 'react'
import type { LayoutKind } from '../editor/layoutMap'
import type { UndoRedo } from '../hooks/useUndoRedo'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import {
  IconArrowLeft,
  IconCopy,
  IconCrosshair,
  IconFilePlus,
  IconFrame,
  IconImage,
  IconLayoutBoth,
  IconLayoutDown,
  IconLayoutRight,
  IconMinus,
  IconNote,
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
  /** 复制文件路径（2026-09：发给 AI 直接读本文件；按钮紧邻复制 md 钮，
   *  IconRoute 路径图标与 IconCopy 形状区分） */
  onCopyPathClick(): void
  /** 复制范围信号（M4 E2E 观测点）：branch=选中分支 / full=整图；同时驱动按钮提示 */
  scope: 'full' | 'branch'
  /** 保存（Ctrl+S 的按钮路径） */
  onSaveClick(): void
  /** 编辑选中节点备注（M5b）：无选中节点时禁用（逻辑在 EditorView 的 useNoteEdit；快捷键 Shift+F2/Ctrl+.） */
  onNoteClick(): void
  /** btn-note 可用信号：有激活节点才可编辑备注 */
  noteEnabled: boolean
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

/** 纸面命令栏：返回/回退/重做/复制/保存/备注/导出 + 缩放与视图四键 + 布局切换（纯展示，状态与回调全经 props；
 *  快捷键仍由 EditorView 的 window keydown effect 承担） */
export default function ZenBar({
  onBack,
  onSwitchClick,
  onNewClick,
  undoRedo,
  onCopyClick,
  onCopyPathClick,
  scope,
  onSaveClick,
  onNoteClick,
  noteEnabled,
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
      <Tip label="编辑选中节点的备注（Shift+F2）">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="btn-note"
          aria-label="编辑选中节点的备注（Shift+F2）"
          onClick={onNoteClick}
          disabled={!noteEnabled}
        >
          <IconNote />
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
       *  语义名由 item 自身 aria-label 承担（官方 ToggleGroup 文档同款 a11y 模式） */}
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
          <ToggleGroupItem key={kind} value={kind} data-testid={`layout-${kind}`} aria-label={label}>
            {icon}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </header>
  )
}
