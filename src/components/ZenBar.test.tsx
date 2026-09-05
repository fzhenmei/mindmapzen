import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ZenBar from './ZenBar'
import { TooltipProvider } from './ui/tooltip'
import { useAppStore } from '../store/appStore'
import { DEFAULT_COPY_SETTINGS } from '../types/files'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'
import type { UndoRedo } from '../hooks/useUndoRedo'
import type { LayoutKind } from '../editor/layoutMap'

// 砚栏复制组 split button（2026-09 复制选项自设置面板移入）：主钮照常复制、箭头展开
// 两勾选项（默认 备注off/双链on）、勾选即回调且菜单保持打开、接线真实 store 后
// 勾选走 setSetting load-merge-save 持久化（链路测试自 SettingsDialog.test 迁入）。
// jsdom 驱动沿用 dropdown-menu.test 模式：pointerdown（button 0）展开，role 定位条目。

const noop = (): void => {}
// bind 属引擎挂载钩（ZenBar 不触达），桩里补 no-op 只为满足 UndoRedo 形状
const undoRedoStub: UndoRedo = { canUndo: false, canRedo: false, onUndo: noop, onRedo: noop, bind: noop }

/** 全 props 桩（纯展示组件）：复制组三项由用例覆盖注入，其余状态无关项全 no-op */
function renderBar(overrides: { copySettings?: typeof DEFAULT_COPY_SETTINGS; onToggleCopySetting?: (key: 'copyIncludeNote' | 'copyIncludeLinks') => void } = {}): void {
  render(
    <TooltipProvider>
      <ZenBar
        onBack={noop}
        onSwitchClick={noop}
        onNewClick={noop}
        undoRedo={undoRedoStub}
        onCopyClick={noop}
        copySettings={overrides.copySettings ?? { ...DEFAULT_COPY_SETTINGS }}
        onToggleCopySetting={overrides.onToggleCopySetting ?? noop}
        onCopyPathClick={noop}
        scope="full"
        onSaveClick={noop}
        onNoteClick={noop}
        noteEnabled={false}
        onExportClick={noop}
        onZoomOut={noop}
        onZoomIn={noop}
        onCenterRoot={noop}
        onFit={noop}
        layout={'mindmap' satisfies LayoutKind}
        onSwitchLayout={noop}
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

  test('箭头展开菜单：两项勾选态反映 copySettings 现值（默认 备注off/双链on）', () => {
    renderBar()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    openMenu()
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByTestId('copy-note-option')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByTestId('copy-links-option')).toHaveAttribute('aria-checked', 'true')
  })

  test('勾选即回调对应 key，菜单保持打开可连续切换（onSelect preventDefault）', () => {
    const onToggle = vi.fn()
    renderBar({ onToggleCopySetting: onToggle })
    openMenu()
    fireEvent.click(screen.getByTestId('copy-note-option'))
    expect(onToggle).toHaveBeenCalledWith('copyIncludeNote')
    // 菜单未关：第二项仍可点（同径再验 copyIncludeLinks）
    fireEvent.click(screen.getByTestId('copy-links-option'))
    expect(onToggle).toHaveBeenCalledWith('copyIncludeLinks')
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
    fireEvent.click(screen.getByTestId('copy-note-option'))
    fireEvent.click(screen.getByTestId('copy-links-option'))
    await waitFor(() =>
      expect(useAppStore.getState().settings).toEqual({ copyIncludeNote: true, copyIncludeLinks: false }),
    )
    const cfg = JSON.parse(await useAppStore.getState().adapter.readTextFile('/cfg.json'))
    expect(cfg.settings).toEqual({ copyIncludeNote: true, copyIncludeLinks: false })
    expect(cfg.workspaceDir).toBe('/ws') // 合并保存保留其他字段
    expect(cfg.preferredLayout).toBe('logic')
    expect(cfg.theme).toBe('dark')
  })
})
