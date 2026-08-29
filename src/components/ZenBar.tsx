// src/components/ZenBar.tsx —— 浮动砚栏（M5a 拆分自 EditorView，零行为变化）：
// 静置淡化、悬停/聚焦浮现（spec §4.4 UI 隐身）的全部按钮/分隔/布局切换。
// 纯展示组件：状态与回调全经 props；快捷键（Ctrl+S / Ctrl+Shift+C / 备注编辑）不在此处，
// 仍由 EditorView 的 window keydown effect 承担（砚栏只是按钮路径）。
// M5c：全部图标按钮接 ZenTooltip（视觉提示），title 退役防双提示；语义名由 aria-label 承担。
import type { LayoutKind } from '../editor/layoutMap'
import type { UndoRedo } from '../hooks/useUndoRedo'
import ZenTooltip from './ZenTooltip'
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
   *  （状态与执行在 EditorView 的 useUndoRedo；键盘 Ctrl+Z/Y 走引擎原生与画布兜底，砚栏只是按钮路径） */
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

/** 浮动砚栏：返回/回退/重做/复制/保存/备注/导出 + 缩放与视图四键 + 布局切换（纯展示，状态与回调全经 props；
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
    <header className="zen-bar" data-testid="zen-bar">
      <ZenTooltip label="返回案头">
        <button type="button" data-testid="btn-back" aria-label="返回案头" onClick={onBack}>
          <IconArrowLeft />
        </button>
      </ZenTooltip>
      <span className="zen-bar-sep" />
      <ZenTooltip label="回退（Ctrl+Z）">
        <button
          type="button"
          data-testid="btn-undo"
          aria-label="回退（Ctrl+Z）"
          onClick={undoRedo.onUndo}
          disabled={!undoRedo.canUndo}
        >
          <IconUndo />
        </button>
      </ZenTooltip>
      <ZenTooltip label="重做（Ctrl+Y）">
        <button
          type="button"
          data-testid="btn-redo"
          aria-label="重做（Ctrl+Y）"
          onClick={undoRedo.onRedo}
          disabled={!undoRedo.canRedo}
        >
          <IconRedo />
        </button>
      </ZenTooltip>
      <span className="zen-bar-sep" />
      <ZenTooltip label={copyLabel}>
        <button
          type="button"
          data-testid="btn-copy"
          data-scope={scope}
          aria-label={copyLabel}
          onClick={onCopyClick}
        >
          <IconCopy />
        </button>
      </ZenTooltip>
      <ZenTooltip label="保存（Ctrl+S）">
        <button
          type="button"
          data-testid="btn-save"
          aria-label="保存（Ctrl+S）"
          onClick={onSaveClick}
        >
          <IconSave />
        </button>
      </ZenTooltip>
      <ZenTooltip label="编辑选中节点的备注（Shift+F2）">
        <button
          type="button"
          data-testid="btn-note"
          aria-label="编辑选中节点的备注（Shift+F2）"
          onClick={onNoteClick}
          disabled={!noteEnabled}
        >
          <IconNote />
        </button>
      </ZenTooltip>
      <ZenTooltip label="导出或复制为图片">
        <button
          type="button"
          data-testid="btn-export"
          aria-label="导出或复制为图片"
          onClick={onExportClick}
        >
          <IconImage />
        </button>
      </ZenTooltip>
      <span className="zen-bar-sep" />
      <ZenTooltip label="缩小（Ctrl+滚轮）">
        <button
          type="button"
          data-testid="btn-zoom-out"
          aria-label="缩小（Ctrl+滚轮）"
          onClick={onZoomOut}
        >
          <IconMinus />
        </button>
      </ZenTooltip>
      <ZenTooltip label="放大（Ctrl+滚轮）">
        <button
          type="button"
          data-testid="btn-zoom-in"
          aria-label="放大（Ctrl+滚轮）"
          onClick={onZoomIn}
        >
          <IconPlus />
        </button>
      </ZenTooltip>
      <ZenTooltip label="根居中：保持缩放回根">
        <button
          type="button"
          data-testid="btn-center-root"
          aria-label="根居中：保持缩放回根"
          onClick={onCenterRoot}
        >
          <IconCrosshair />
        </button>
      </ZenTooltip>
      <ZenTooltip label="适配整图">
        <button type="button" data-testid="btn-fit" aria-label="适配整图" onClick={onFit}>
          <IconFrame />
        </button>
      </ZenTooltip>
      <span className="zen-bar-sep" />
      <fieldset className="layout-switch" aria-label="布局切换">
        {(
          [
            ['mindmap', '思维导图（右向）', <IconLayoutRight key="r" />],
            ['logic', '逻辑图（左右）', <IconLayoutBoth key="b" />],
            ['org', '组织结构图（向下）', <IconLayoutDown key="d" />],
          ] as const
        ).map(([kind, label, icon]) => (
          <ZenTooltip key={kind} label={label}>
            <button
              type="button"
              data-testid={`layout-${kind}`}
              className={layout === kind ? 'active' : ''}
              aria-pressed={layout === kind}
              aria-label={label}
              onClick={() => onSwitchLayout(kind)}
            >
              {icon}
            </button>
          </ZenTooltip>
        ))}
      </fieldset>
    </header>
  )
}
