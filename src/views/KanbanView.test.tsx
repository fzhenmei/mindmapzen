import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { RefObject } from 'react'
import KanbanView, { type KanbanViewProps } from './KanbanView'
import type { MindMapHandle } from '../types/engine'

// 看板模式浮层三件套装配（Task 6）：KanbanView 是 mm 命令的编排层——五列投影自
// buildKanbanCards，每个编辑操作 = 恰一条引擎命令 + onDataChanged（useIconPicker.apply
// 同款纪律）。mm 替身持可变树（icon 覆写实写回 data），可验证 data_change 订阅的
// 全刷新回路；jsdom 无 DragEvent.dataTransfer，拖拽事件以 stub 注入。

interface FakeNode {
  data: { text: string; uid: string; icon?: string[]; body?: string; expand?: boolean }
  children: FakeNode[]
  setText?: ReturnType<typeof vi.fn>
  setIcon?: ReturnType<typeof vi.fn>
}

function makeMm() {
  const listeners = new Map<string, Array<(...a: unknown[]) => void>>()
  // 卡片节点带状态徽章（kebab 形态）+ 用户图标 flag + 正文——转普通/落列/body 断言共用。
  // setIcon 实写 data.icon：nodeStatusOf 同态短路（读数据树）与 data_change 重放的
  // 刷新用例都依赖「命令落进了数据」的替身语义
  const t1: FakeNode = {
    data: { text: '修滚动条', uid: 't1', icon: ['zen_status-doing', 'zen_flag'], body: '正文内容' },
    children: [],
    setText: vi.fn(),
    setIcon: vi.fn((icons: string[]) => {
      t1.data.icon = icons
    }),
  }
  const root: FakeNode = { data: { text: '根', uid: 'r' }, children: [t1] }
  const mm = {
    getData: () => root,
    on: vi.fn((ev: string, cb: (...a: unknown[]) => void) => {
      listeners.set(ev, [...(listeners.get(ev) ?? []), cb])
    }),
    off: vi.fn((ev: string, cb: (...a: unknown[]) => void) => {
      listeners.set(ev, (listeners.get(ev) ?? []).filter((f) => f !== cb))
    }),
    renderer: {
      findNodeByUid: (uid: string): FakeNode | null => (uid === 'r' ? root : uid === 't1' ? t1 : null),
    },
    execCommand: vi.fn(),
  }
  return {
    mm: mm as unknown as MindMapHandle,
    root,
    t1,
    // mock 引用单出：mm 已断言成 MindMapHandle，接口类型下 .mock 不可达
    onMock: mm.on,
    offMock: mm.off,
    emit: (ev: string) => {
      for (const cb of listeners.get(ev) ?? []) cb()
    },
  }
}

function renderKanban(mm: MindMapHandle): { props: KanbanViewProps; unmount: () => void } {
  const mmRef: RefObject<MindMapHandle | null> = { current: mm }
  const props: KanbanViewProps = {
    mmRef,
    onDataChanged: vi.fn(),
    onOpenBody: vi.fn(),
    onEditIcons: vi.fn(),
    onEditTags: vi.fn(),
    onLocate: vi.fn(),
    onClose: vi.fn(),
  }
  const { unmount } = render(<KanbanView {...props} />)
  return { props, unmount }
}

describe('KanbanView（看板模式浮层）', () => {
  afterEach(cleanup)

  test('渲染五列、卡片按状态落列、空列态；挂载即夺焦（引擎快捷键失活）', () => {
    const { mm } = makeMm()
    renderKanban(mm)
    for (const s of ['todo', 'doing', 'blocked', 'done', 'dropped']) {
      expect(screen.getByTestId(`kanban-col-${s}`)).toBeInTheDocument()
    }
    expect(within(screen.getByTestId('kanban-col-doing')).getByText('修滚动条')).toBeInTheDocument()
    expect(within(screen.getByTestId('kanban-col-todo')).getByText('暂无任务')).toBeInTheDocument()
    // 夺 body 焦点：根 div 挂载即 focus（引擎 keyCommand.defaultEnableCheck 只认 body）
    expect(document.activeElement).toBe(screen.getByTestId('kanban-view'))
  })

  test('拖拽改状态：dragStart 写 uid 载荷，drop 到 done 列重合成徽章置首 + onDataChanged', () => {
    const { mm, t1 } = makeMm()
    const { props } = renderKanban(mm)
    const dt = { setData: vi.fn(), getData: (k: string) => (k === 'text/kanban-uid' ? 't1' : '') }
    fireEvent.dragStart(screen.getByTestId('kanban-card-t1'), { dataTransfer: dt })
    expect(dt.setData).toHaveBeenCalledWith('text/kanban-uid', 't1')
    fireEvent.drop(screen.getByTestId('kanban-col-done'), { dataTransfer: dt })
    // 徽章互保：旧徽章滤除、新徽章置首、用户图标 zen_flag 保留
    expect(t1.setIcon).toHaveBeenCalledWith(['zen_status-done', 'zen_flag'])
    expect(props.onDataChanged).toHaveBeenCalled()
    // 同态 no-op：stub 已实写 done，再落 done 列不产生第二条命令（不占 undo 一步）
    fireEvent.drop(screen.getByTestId('kanban-col-done'), { dataTransfer: dt })
    expect(t1.setIcon).toHaveBeenCalledTimes(1)
  })

  test('双击卡片文本内联编辑：回车提交 setText + onDataChanged', () => {
    const { mm, t1 } = makeMm()
    const { props } = renderKanban(mm)
    fireEvent.doubleClick(screen.getByText('修滚动条'))
    const input = screen.getByTestId('kanban-edit-t1')
    fireEvent.change(input, { target: { value: '修好滚动条' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(t1.setText).toHaveBeenCalledWith('修好滚动条')
    expect(props.onDataChanged).toHaveBeenCalled()
  })

  test('列底新增：输入回车走 INSERT_CHILD_NODE 挂根、icon 带列状态徽章', () => {
    const { mm, root } = makeMm()
    const { props } = renderKanban(mm)
    fireEvent.click(screen.getByTestId('btn-kanban-add-todo'))
    const input = screen.getByTestId('kanban-add-input-todo')
    fireEvent.change(input, { target: { value: '新任务' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mm.execCommand).toHaveBeenCalledWith(
      'INSERT_CHILD_NODE', false, [root], { text: '新任务', icon: ['zen_status-todo'] },
    )
    expect(props.onDataChanged).toHaveBeenCalled()
  })

  test('删除二次确认：首点变「确认删除?」不执行，再点才 REMOVE_NODE', async () => {
    const { mm, t1 } = makeMm()
    const { props } = renderKanban(mm)
    fireEvent.pointerDown(screen.getByTestId('kanban-menu-t1'), { button: 0 })
    fireEvent.click(await screen.findByTestId('kanban-delete-t1'))
    expect(mm.execCommand).not.toHaveBeenCalledWith('REMOVE_NODE', expect.anything())
    // 菜单不关（onSelect preventDefault），同一菜单项文字已变确认态
    fireEvent.click(screen.getByTestId('kanban-delete-t1'))
    expect(mm.execCommand).toHaveBeenCalledWith('REMOVE_NODE', [t1])
    expect(props.onDataChanged).toHaveBeenCalled()
  })

  test('转为普通节点：清状态徽章、保留用户图标', async () => {
    const { mm, t1 } = makeMm()
    const { props } = renderKanban(mm)
    fireEvent.pointerDown(screen.getByTestId('kanban-menu-t1'), { button: 0 })
    fireEvent.click(await screen.findByTestId('kanban-toplain-t1'))
    expect(t1.setIcon).toHaveBeenCalledWith(['zen_flag'])
    expect(props.onDataChanged).toHaveBeenCalled()
  })

  test('body 指示点击 onOpenBody（不触发定位）；卡片主体单击延迟定位 onLocate（双击编辑不打扰）', async () => {
    const { mm } = makeMm()
    const { props } = renderKanban(mm)
    fireEvent.click(screen.getByTestId('kanban-body-t1'))
    expect(props.onOpenBody).toHaveBeenCalledWith('t1')
    expect(props.onLocate).not.toHaveBeenCalled()
    // 单击 → 220ms 双击判定窗后定位（fireEvent.doubleClick 不派生 click，双击路径无定时器）
    fireEvent.click(screen.getByTestId('kanban-card-t1'))
    await waitFor(() => expect(props.onLocate).toHaveBeenCalledWith('t1'), { timeout: 2000 })
  })

  test('data_change 订阅：挂载注册、重放即刷新（卡片迁列）、卸载退订同引用', async () => {
    const { mm, onMock, offMock, emit } = makeMm()
    const { unmount } = renderKanban(mm)
    expect(onMock).toHaveBeenCalledWith('data_change', expect.any(Function))
    const registered = onMock.mock.calls.find(([ev]) => ev === 'data_change')?.[1]
    // 拖到 done（stub 实写 data.icon）→ 重放 data_change → 卡片迁到 done 列
    const dt = { setData: vi.fn(), getData: (k: string) => (k === 'text/kanban-uid' ? 't1' : '') }
    fireEvent.dragStart(screen.getByTestId('kanban-card-t1'), { dataTransfer: dt })
    fireEvent.drop(screen.getByTestId('kanban-col-done'), { dataTransfer: dt })
    expect(within(screen.getByTestId('kanban-col-doing')).queryByText('修滚动条')).not.toBeNull()
    emit('data_change')
    await waitFor(() =>
      expect(within(screen.getByTestId('kanban-col-done')).getByText('修滚动条')).toBeInTheDocument(),
    )
    unmount()
    const offCall = offMock.mock.calls.find(([ev]) => ev === 'data_change')?.[1]
    expect(offCall).toBe(registered)
  })

  test('drop 垃圾 uid（数据树无此节点）：console.error 显式出口，不落任何命令不置脏', () => {
    const { mm, t1 } = makeMm()
    const { props } = renderKanban(mm)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dt = { setData: vi.fn(), getData: (k: string) => (k === 'text/kanban-uid' ? 'ghost' : '') }
    fireEvent.drop(screen.getByTestId('kanban-col-done'), { dataTransfer: dt })
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('数据树中无此节点'), 'ghost')
    expect(t1.setIcon).not.toHaveBeenCalled()
    expect(mm.execCommand).not.toHaveBeenCalled()
    expect(props.onDataChanged).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })

  test('收起分支任务改状态：expandToUid 直写祖先 expand=true，渲染完成回调后落 setIcon', () => {
    // 树：root > grp(expand=false) > t2(todo)。渲染树语义：收起分支子树不在渲染树，
    // findNodeByUid(t2) 在 grp 展开前 miss——Important-1 修复路径
    const t2: FakeNode = {
      data: { text: '收起任务', uid: 't2', icon: ['zen_status-todo'] },
      children: [],
      setIcon: vi.fn(),
    }
    const grp: FakeNode = { data: { text: '分组', uid: 'g', expand: false }, children: [t2] }
    const root: FakeNode = { data: { text: '根', uid: 'r' }, children: [grp] }
    const listeners = new Map<string, Array<(...a: unknown[]) => void>>()
    const mm = {
      getData: () => root,
      on: vi.fn((ev: string, cb: (...a: unknown[]) => void) => {
        listeners.set(ev, [...(listeners.get(ev) ?? []), cb])
      }),
      off: vi.fn((ev: string, cb: (...a: unknown[]) => void) => {
        listeners.set(ev, (listeners.get(ev) ?? []).filter((f) => f !== cb))
      }),
      renderer: {
        // grp 收起时 t2 不在渲染树；expand 直写 true 后（safeReRender 重渲）可寻址
        findNodeByUid: (uid: string): FakeNode | null => {
          if (uid === 'r') return root
          if (uid === 't2') return grp.data.expand === false ? null : t2
          return null
        },
      },
      execCommand: vi.fn(),
    }
    const { props } = renderKanban(mm as unknown as MindMapHandle)
    const dt = { setData: vi.fn(), getData: (k: string) => (k === 'text/kanban-uid' ? 't2' : '') }
    fireEvent.drop(screen.getByTestId('kanban-col-done'), { dataTransfer: dt })
    // 祖先 expand 已直写 true（视图导航豁免：不进 undo，不产生引擎命令）
    expect(grp.data.expand).toBe(true)
    expect(mm.execCommand).not.toHaveBeenCalled()
    // 命令不即刻落：等渲染完成事件后在新树上寻址
    expect(t2.setIcon).not.toHaveBeenCalled()
    for (const cb of listeners.get('node_tree_render_end') ?? []) cb()
    expect(t2.setIcon).toHaveBeenCalledWith(['zen_status-done'])
    expect(props.onDataChanged).toHaveBeenCalled()
  })
})
