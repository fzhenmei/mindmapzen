// src/components/ZenBar.tsx —— 纸面命令栏（M5a 拆分自 EditorView；M12b Task 4 底部停泊）：
// 底部居中 40px 全不透明（spec §3：旧「静置淡化、悬停浮现」隐身游戏随青松工作台退役）。
// 纯展示组件：状态与回调全经 props；快捷键（Ctrl+S / Ctrl+Shift+C / 备注编辑）不在此处，
// 仍由 EditorView 的 window keydown effect 承担（命令栏只是按钮路径）。
// M12b Task 5：全部图标按钮接 ui/tooltip（视觉提示），title 退役防双提示；语义名由 aria-label 承担。
import type { ReactNode } from 'react'
import type { LayoutKind } from '../editor/layoutMap'
import type { UndoRedo } from '../hooks/useUndoRedo'
import { cn } from '../lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import {
  IconArrowLeft,
  IconCopy,
  IconCrosshair,
  IconFrame,
  IconImage,
  IconLayoutBoth,
  IconLayoutDown,
  IconLayoutRight,
  IconMinus,
  IconNote,
  IconPlus,
  IconRedo,
  IconSave,
  IconUndo,
} from './icons'

interface Props {
  /** 返回文件库（EditorView 组合：暂停自动保存 → 显式保存链 → 成功才导航） */
  onBack(): void
  /** 回退/重做（v1.1，想法5）：引擎 BACK/FORWARD 命令 + back_forward 历史态驱动的禁用信号
   *  （状态与执行在 EditorView 的 useUndoRedo；键盘 Ctrl+Z/Y 走引擎原生与画布兜底，命令栏只是按钮路径） */
  undoRedo: UndoRedo
  /** 复制 Markdown（Ctrl+Shift+C 的按钮路径） */
  onCopyClick(): void
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

/** 命令栏钮（spec §2 命令栏钮 32px）：与案头命令栏/ui button icon 同规的青松皮肤 */
const BAR_BTN =
  'inline-flex size-8 items-center justify-center rounded-control text-foreground transition-colors duration-150 hover:bg-primary-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40'

/** 浮签包装（本文件局部）：ui Tooltip 组合的简写——13 枚图标钮同构，
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
  undoRedo,
  onCopyClick,
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
      ? '复制选中分支为 Markdown（Ctrl+Shift+C）'
      : '复制整图为 Markdown（Ctrl+Shift+C）'
  return (
    // zen-bar 类名保留为视觉冒烟钩子（skin 已全转 utility，App.css 无对应规则）
    <header
      data-testid="zen-bar"
      className="zen-bar absolute bottom-3 left-1/2 z-10 flex h-10 -translate-x-1/2 items-center gap-0.5 rounded-bar border border-border bg-surface px-2.5 shadow-overlay"
    >
      <Tip label="返回案头">
        <button type="button" data-testid="btn-back" aria-label="返回案头" className={BAR_BTN} onClick={onBack}>
          <IconArrowLeft />
        </button>
      </Tip>
      <span className="mx-1 h-4 w-px shrink-0 bg-border" />
      <Tip label="回退（Ctrl+Z）">
        <button
          type="button"
          data-testid="btn-undo"
          aria-label="回退（Ctrl+Z）"
          className={BAR_BTN}
          onClick={undoRedo.onUndo}
          disabled={!undoRedo.canUndo}
        >
          <IconUndo />
        </button>
      </Tip>
      <Tip label="重做（Ctrl+Y）">
        <button
          type="button"
          data-testid="btn-redo"
          aria-label="重做（Ctrl+Y）"
          className={BAR_BTN}
          onClick={undoRedo.onRedo}
          disabled={!undoRedo.canRedo}
        >
          <IconRedo />
        </button>
      </Tip>
      <span className="mx-1 h-4 w-px shrink-0 bg-border" />
      <Tip label={copyLabel}>
        <button
          type="button"
          data-testid="btn-copy"
          data-scope={scope}
          aria-label={copyLabel}
          className={BAR_BTN}
          onClick={onCopyClick}
        >
          <IconCopy />
        </button>
      </Tip>
      <Tip label="保存（Ctrl+S）">
        <button
          type="button"
          data-testid="btn-save"
          aria-label="保存（Ctrl+S）"
          className={BAR_BTN}
          onClick={onSaveClick}
        >
          <IconSave />
        </button>
      </Tip>
      <Tip label="编辑选中节点的备注（Shift+F2）">
        <button
          type="button"
          data-testid="btn-note"
          aria-label="编辑选中节点的备注（Shift+F2）"
          className={BAR_BTN}
          onClick={onNoteClick}
          disabled={!noteEnabled}
        >
          <IconNote />
        </button>
      </Tip>
      <Tip label="导出或复制为图片">
        <button
          type="button"
          data-testid="btn-export"
          aria-label="导出或复制为图片"
          className={BAR_BTN}
          onClick={onExportClick}
        >
          <IconImage />
        </button>
      </Tip>
      <span className="mx-1 h-4 w-px shrink-0 bg-border" />
      <Tip label="缩小（Ctrl+滚轮）">
        <button
          type="button"
          data-testid="btn-zoom-out"
          aria-label="缩小（Ctrl+滚轮）"
          className={BAR_BTN}
          onClick={onZoomOut}
        >
          <IconMinus />
        </button>
      </Tip>
      <Tip label="放大（Ctrl+滚轮）">
        <button
          type="button"
          data-testid="btn-zoom-in"
          aria-label="放大（Ctrl+滚轮）"
          className={BAR_BTN}
          onClick={onZoomIn}
        >
          <IconPlus />
        </button>
      </Tip>
      <Tip label="根居中：保持缩放回根">
        <button
          type="button"
          data-testid="btn-center-root"
          aria-label="根居中：保持缩放回根"
          className={BAR_BTN}
          onClick={onCenterRoot}
        >
          <IconCrosshair />
        </button>
      </Tip>
      <Tip label="适配整图">
        <button type="button" data-testid="btn-fit" aria-label="适配整图" className={BAR_BTN} onClick={onFit}>
          <IconFrame />
        </button>
      </Tip>
      <span className="mx-1 h-4 w-px shrink-0 bg-border" />
      <fieldset aria-label="布局切换" className="inline-flex min-w-0 gap-0.5">
        {(
          [
            ['mindmap', '思维导图（右向）', <IconLayoutRight key="r" />],
            ['logic', '逻辑图（左右）', <IconLayoutBoth key="b" />],
            ['org', '组织结构图（向下）', <IconLayoutDown key="d" />],
          ] as const
        ).map(([kind, label, icon]) => (
          <Tip key={kind} label={label}>
            <button
              type="button"
              data-testid={`layout-${kind}`}
              className={cn(BAR_BTN, layout === kind && 'bg-primary-soft text-primary')}
              aria-pressed={layout === kind}
              aria-label={label}
              onClick={() => onSwitchLayout(kind)}
            >
              {icon}
            </button>
          </Tip>
        ))}
      </fieldset>
    </header>
  )
}
