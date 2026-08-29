// src/components/ZenBar.tsx —— 浮动砚栏（M5a 拆分自 EditorView，零行为变化）：
// 静置淡化、悬停/聚焦浮现（spec §4.4 UI 隐身）的全部按钮/分隔/布局切换。
// 纯展示组件：状态与回调全经 props；快捷键（Ctrl+S / Ctrl+Shift+C）不在此处，
// 仍由 EditorView 的 window keydown effect 承担（砚栏只是按钮路径）。
import type { LayoutKind } from '../editor/layoutMap'
import {
  IconArrowLeft,
  IconCopy,
  IconCrosshair,
  IconFrame,
  IconLayoutBoth,
  IconLayoutDown,
  IconLayoutRight,
  IconMinus,
  IconPlus,
  IconSave,
} from './icons'

interface Props {
  /** 返回文件库（EditorView 组合：暂停自动保存 → 显式保存链 → 成功才导航） */
  onBack(): void
  /** 复制 Markdown（Ctrl+Shift+C 的按钮路径） */
  onCopyClick(): void
  /** 预留复制成功态（M4 印记裁定后恒 false：复制反馈走 SaveStamp 墨青印，按钮不闪 ✓） */
  copied: boolean
  /** 复制范围信号（M4 E2E 观测点）：branch=选中分支 / full=整图；同时驱动按钮 title */
  scope: 'full' | 'branch'
  /** 保存（Ctrl+S 的按钮路径） */
  onSaveClick(): void
  onZoomOut(): void
  onZoomIn(): void
  onCenterRoot(): void
  onFit(): void
  /** 当前激活布局（点亮对应布局按钮） */
  layout: LayoutKind
  /** 布局切换（引擎即时重排 + 偏好落盘，逻辑在 EditorView） */
  onSwitchLayout(kind: LayoutKind): void
}

/** 浮动砚栏：返回/复制/保存 + 缩放与视图四键 + 布局切换（JSX 自 EditorView 原样迁移，
 *  testid/title/图标/类名不变；copied 为预留位，当前无视觉表现） */
export default function ZenBar({
  onBack,
  onCopyClick,
  scope,
  onSaveClick,
  onZoomOut,
  onZoomIn,
  onCenterRoot,
  onFit,
  layout,
  onSwitchLayout,
}: Readonly<Props>) {
  return (
    <header className="zen-bar" data-testid="zen-bar">
      <button type="button" data-testid="btn-back" title="返回案头" onClick={onBack}>
        <IconArrowLeft />
      </button>
      <span className="zen-bar-sep" />
      <button
        type="button"
        data-testid="btn-copy"
        data-scope={scope}
        title={
          scope === 'branch'
            ? '复制选中分支为 Markdown（Ctrl+Shift+C）'
            : '复制整图为 Markdown（Ctrl+Shift+C）'
        }
        onClick={onCopyClick}
      >
        <IconCopy />
      </button>
      <button type="button" data-testid="btn-save" title="保存（Ctrl+S）" onClick={onSaveClick}>
        <IconSave />
      </button>
      <span className="zen-bar-sep" />
      <button
        type="button"
        data-testid="btn-zoom-out"
        title="缩小（Ctrl+滚轮）"
        onClick={onZoomOut}
      >
        <IconMinus />
      </button>
      <button type="button" data-testid="btn-zoom-in" title="放大（Ctrl+滚轮）" onClick={onZoomIn}>
        <IconPlus />
      </button>
      <button
        type="button"
        data-testid="btn-center-root"
        title="根居中：保持缩放回根"
        onClick={onCenterRoot}
      >
        <IconCrosshair />
      </button>
      <button type="button" data-testid="btn-fit" title="适配整图" onClick={onFit}>
        <IconFrame />
      </button>
      <span className="zen-bar-sep" />
      <fieldset className="layout-switch" aria-label="布局切换">
        {(
          [
            ['mindmap', '思维导图（右向）', <IconLayoutRight key="r" />],
            ['logic', '逻辑图（左右）', <IconLayoutBoth key="b" />],
            ['org', '组织结构图（向下）', <IconLayoutDown key="d" />],
          ] as const
        ).map(([kind, label, icon]) => (
          <button
            key={kind}
            type="button"
            data-testid={`layout-${kind}`}
            className={layout === kind ? 'active' : ''}
            aria-pressed={layout === kind}
            title={label}
            onClick={() => onSwitchLayout(kind)}
          >
            {icon}
          </button>
        ))}
      </fieldset>
    </header>
  )
}
