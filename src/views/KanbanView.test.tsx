import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { RefObject } from 'react'
import KanbanView, { type KanbanViewProps } from './KanbanView'
import type { MindMapHandle } from '../types/engine'
import { TooltipProvider } from '../components/ui/tooltip'

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
  // 子孙两层（子 t1c1/t1c2、孙 t1c2a，均无状态）：子树卡片徽标计数/浮层大纲断言共用
  // （2026-09 子树卡片）。setIcon 实写 data.icon：nodeStatusOf 同态短路（读数据树）与
  // data_change 重放的刷新用例都依赖「命令落进了数据」的替身语义
  const t1: FakeNode = {
    data: { text: '修滚动条', uid: 't1', icon: ['zen_status-doing', 'zen_flag'], body: '正文内容' },
    children: [
      { data: { text: '先查溢出', uid: 't1c1' }, children: [] },
      { data: { text: '方案对比', uid: 't1c2' }, children: [
        { data: { text: '浮层走 portal', uid: 't1c2a' }, children: [] },
      ] },
    ],
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
    onCopyCard: vi.fn(),
    onClose: vi.fn(),
  }
  // 渲染脚手架：EditorView 根有 TooltipProvider（卡片子孙浮层依赖其上下文），此处同构包裹
  const { unmount } = render(
    <TooltipProvider>
      <KanbanView {...props} />
    </TooltipProvider>,
  )
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

  test('拖拽悬停高亮：dragEnter 列亮（data-dragover + ring-primary），dragLeave 计数归零熄灭', () => {
    const { mm } = makeMm()
    renderKanban(mm)
    const col = screen.getByTestId('kanban-col-done')
    const dt = { setData: vi.fn(), getData: (k: string) => (k === 'text/kanban-uid' ? 't1' : '') }
    expect(col).not.toHaveAttribute('data-dragover')
    fireEvent.dragEnter(col, { dataTransfer: dt })
    expect(col).toHaveAttribute('data-dragover')
    expect(col.className).toContain('ring-primary')
    // 离开列（计数归零路径）：高亮熄灭、回落 muted 底
    fireEvent.dragLeave(col, { dataTransfer: dt })
    expect(col).not.toHaveAttribute('data-dragover')
    expect(col.className).toContain('bg-muted/40')
  })

  test('列内子元素穿越不误灭：进卡片（enter 卡片 + leave 列）计数平衡，高亮保持', () => {
    const { mm } = makeMm()
    renderKanban(mm)
    const col = screen.getByTestId('kanban-col-doing')
    const card = screen.getByTestId('kanban-card-t1')
    const dt = { setData: vi.fn(), getData: (k: string) => (k === 'text/kanban-uid' ? 't1' : '') }
    fireEvent.dragEnter(col, { dataTransfer: dt })
    // 列 → 卡片穿越：dragenter(卡片) 冒泡 +1 与 dragleave(列) -1 成对，净 1 仍高亮
    fireEvent.dragEnter(card, { dataTransfer: dt })
    fireEvent.dragLeave(col, { dataTransfer: dt })
    expect(col).toHaveAttribute('data-dragover')
    // 从卡片直接拖出列外：dragleave(卡片) 冒泡归零才熄灭
    fireEvent.dragLeave(card, { dataTransfer: dt })
    expect(col).not.toHaveAttribute('data-dragover')
  })

  test('drop 后高亮熄灭且计数清零：再拖入可重新点亮（非负卡死）', () => {
    const { mm } = makeMm()
    const { props } = renderKanban(mm)
    const col = screen.getByTestId('kanban-col-done')
    const dt = { setData: vi.fn(), getData: (k: string) => (k === 'text/kanban-uid' ? 't1' : '') }
    fireEvent.dragStart(screen.getByTestId('kanban-card-t1'), { dataTransfer: dt })
    fireEvent.dragEnter(col, { dataTransfer: dt })
    expect(col).toHaveAttribute('data-dragover')
    fireEvent.drop(col, { dataTransfer: dt })
    expect(props.onDataChanged).toHaveBeenCalled()
    expect(col).not.toHaveAttribute('data-dragover')
    fireEvent.dragEnter(col, { dataTransfer: dt })
    expect(col).toHaveAttribute('data-dragover')
  })

  test('源卡片拖拽半透明 + 起点列 dragover 补记高亮；dragEnd（冒泡到 window）全清', () => {
    const { mm } = makeMm()
    renderKanban(mm)
    const col = screen.getByTestId('kanban-col-doing')
    const card = screen.getByTestId('kanban-card-t1')
    const dt = { setData: vi.fn(), getData: (k: string) => (k === 'text/kanban-uid' ? 't1' : '') }
    fireEvent.dragStart(card, { dataTransfer: dt })
    expect(card.className).toContain('opacity-50')
    // 拖拽起点在本列：指针无边界穿越不发 dragenter，首个 dragover 兜底点亮源列
    fireEvent.dragOver(col, { dataTransfer: dt })
    expect(col).toHaveAttribute('data-dragover')
    // 取消拖拽（ESC 等）：dragend 源卡片冒泡到 window——卡片复明 + 列熄灭
    fireEvent.dragEnd(card)
    expect(card.className).not.toContain('opacity-50')
    expect(col).not.toHaveAttribute('data-dragover')
  })

  test('双击卡片文本内联编辑：回车提交 setText + onDataChanged', () => {
    const { mm, t1 } = makeMm()
    const { props } = renderKanban(mm)
    fireEvent.doubleClick(screen.getByText('修滚动条'))
    const editor = screen.getByTestId('kanban-edit-t1')
    fireEvent.change(editor, { target: { value: '修好滚动条' } })
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(t1.setText).toHaveBeenCalledWith('修好滚动条')
    expect(props.onDataChanged).toHaveBeenCalled()
  })

  test('编辑框粘贴多行文本：换行折叠为空格后提交（引擎单行文本防毒节点）', () => {
    const { mm, t1 } = makeMm()
    const { props } = renderKanban(mm)
    fireEvent.doubleClick(screen.getByText('修滚动条'))
    const editor = screen.getByTestId('kanban-edit-t1')
    fireEvent.change(editor, { target: { value: 'a\r\nb' } })
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(t1.setText).toHaveBeenCalledWith('a b')
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
    // 单击 → 500ms 双击判定窗后定位（fireEvent.doubleClick 不派生 click，双击路径无定时器）
    fireEvent.click(screen.getByTestId('kanban-card-t1'))
    await waitFor(() => expect(props.onLocate).toHaveBeenCalledWith('t1'), { timeout: 2000 })
  })

  test('子树卡片：子孙徽标计数 + hover 浮层显示缩进大纲（portal 渲染，列容器不裁剪）', async () => {
    const { mm } = makeMm()
    renderKanban(mm)
    // 子孙徽标：两子 + 一孙 = 3（2026-09 子树卡片）
    expect(screen.getByTestId('kanban-children-t1')).toHaveTextContent('3 子节点')
    // hover 整卡弹浮层：大纲为缩进文本（直接子节点顶格、孙辈两空格一级）
    fireEvent.pointerMove(screen.getByTestId('kanban-card-t1'))
    const tip = await screen.findByTestId('kanban-tip-t1')
    expect(tip.textContent).toBe('先查溢出\n方案对比\n  浮层走 portal')
  })

  test('子树卡片：编辑中 hover 不弹浮层（open 受控守卫）', async () => {
    const { mm } = makeMm()
    renderKanban(mm)
    fireEvent.doubleClick(screen.getByText('修滚动条'))
    await waitFor(() => expect(screen.getByTestId('kanban-edit-t1')).toBeInTheDocument())
    fireEvent.pointerMove(screen.getByTestId('kanban-card-t1'))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(screen.queryByTestId('kanban-tip-t1')).not.toBeInTheDocument()
  })

  test('子树卡片：无子孙卡片无徽标、hover 不弹浮层', async () => {
    const t5: FakeNode = { data: { text: '独卡', uid: 't5', icon: ['zen_status-todo'] }, children: [] }
    const root: FakeNode = { data: { text: '根', uid: 'r' }, children: [t5] }
    const mm = {
      getData: () => root,
      on: vi.fn(),
      off: vi.fn(),
      renderer: { findNodeByUid: (): null => null },
      execCommand: vi.fn(),
    }
    renderKanban(mm as unknown as MindMapHandle)
    expect(screen.queryByTestId('kanban-children-t5')).not.toBeInTheDocument()
    fireEvent.pointerMove(screen.getByTestId('kanban-card-t5'))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(screen.queryByTestId('kanban-tip-t5')).not.toBeInTheDocument()
  })

  test('卡片菜单复制：菜单项触发 onCopyCard（uid 显式上行，管线在宿主 EditorView）', async () => {
    const { mm } = makeMm()
    const { props } = renderKanban(mm)
    fireEvent.pointerDown(screen.getByTestId('kanban-menu-t1'), { button: 0 })
    fireEvent.click(await screen.findByTestId('kanban-copy-t1'))
    expect(props.onCopyCard).toHaveBeenCalledWith('t1')
  })

  test('卡片内按钮上的键盘 Enter 不触发定位（target 守卫）；li 自身 Enter 仍定位', () => {
    // 终审 Important-1：键盘激活卡片内按钮（body 钮）时 keyDown 冒泡到 li，
    // 守卫缺失则 preventDefault 抑制按钮原生激活 + 误触发卡片定位
    const { mm } = makeMm()
    const { props } = renderKanban(mm)
    // fireEvent.keyDown 冒泡到 li，处理器视角 target=按钮 ≠ currentTarget=li
    fireEvent.keyDown(screen.getByTestId('kanban-body-t1'), { key: 'Enter' })
    expect(props.onLocate).not.toHaveBeenCalled()
    // 守卫不误伤键盘可达路径：li 自身 keyDown（target=currentTarget）仍立即定位
    fireEvent.keyDown(screen.getByTestId('kanban-card-t1'), { key: 'Enter' })
    expect(props.onLocate).toHaveBeenCalledWith('t1')
  })

  test('慢双击（300ms > 旧 220 判定窗）：第二击落在 500ms 窗内，走编辑不触发定位', () => {
    // 终审 Important-2 回归钉：旧窗 220ms 时 advanceTimersByTime(300) 已触发定位
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const { mm } = makeMm()
      const { props } = renderKanban(mm)
      fireEvent.click(screen.getByTestId('kanban-card-t1'))
      vi.advanceTimersByTime(300) // 旧 220 窗已过、新 500 窗未到
      expect(props.onLocate).not.toHaveBeenCalled()
      fireEvent.click(screen.getByTestId('kanban-card-t1')) // 第二击重置定时器
      fireEvent.doubleClick(screen.getByText('修滚动条')) // dblclick → beginEdit 取消定时器
      vi.advanceTimersByTime(1000)
      expect(props.onLocate).not.toHaveBeenCalled()
      expect(screen.getByTestId('kanban-edit-t1')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
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

  test('Esc 返回导图：普通态（无编辑/新增）看板根上 Esc 触发 onClose', () => {
    // 2026-09 验收微调：看板缺 Esc 返回导图（Ctrl+Shift+K 之外补 Esc 语义分层）
    const { mm } = makeMm()
    const { props } = renderKanban(mm)
    fireEvent.keyDown(screen.getByTestId('kanban-view'), { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  test('Esc 分层：卡片编辑中 Esc 只退编辑态（编辑框消失），不冒泡关板', () => {
    const { mm } = makeMm()
    const { props } = renderKanban(mm)
    fireEvent.doubleClick(screen.getByText('修滚动条'))
    const input = screen.getByTestId('kanban-edit-t1')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByTestId('kanban-edit-t1')).not.toBeInTheDocument()
    expect(screen.getByText('修滚动条')).toBeInTheDocument()
    expect(props.onClose).not.toHaveBeenCalled()
  })

  test('Esc 分层：列底新增中 Esc 只取消新增（输入框收起回落按钮），不冒泡关板不落命令', () => {
    const { mm } = makeMm()
    const { props } = renderKanban(mm)
    fireEvent.click(screen.getByTestId('btn-kanban-add-todo'))
    const input = screen.getByTestId('kanban-add-input-todo')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByTestId('kanban-add-input-todo')).not.toBeInTheDocument()
    expect(screen.getByTestId('btn-kanban-add-todo')).toBeInTheDocument()
    expect(mm.execCommand).not.toHaveBeenCalled()
    expect(props.onClose).not.toHaveBeenCalled()
  })

  test('卡片下拉菜单/选择器开着按 Esc：Radix capture 层已 preventDefault → 守卫拦住不关板', () => {
    // Important-1 回归钉：portal 事件沿 React 树跨边界冒泡（React 官方行为），菜单的
    // Esc 合成事件会到达看板根 onKeyDown——不误关的真实机制是 Radix DismissableLayer
    // 在 ownerDocument capture 阶段对 Escape 调原生 preventDefault()（其 dist 源码：
    // addEventListener('keydown', handleKeyDown, { capture: true })）。此处构造
    // defaultPrevented=true 的 keyDown 派发到看板根，模拟 Radix capture 层的最终效果；
    // !defaultPrevented 守卫承重，误删则本用例转红
    const { mm } = makeMm()
    const { props } = renderKanban(mm)
    const root = screen.getByTestId('kanban-view')
    const event = createEvent.keyDown(root, { key: 'Escape' })
    Object.defineProperty(event, 'defaultPrevented', { value: true })
    fireEvent(root, event)
    expect(props.onClose).not.toHaveBeenCalled()
  })

  test('Esc 续链（卡片编辑）：Esc 退编辑回焦卡片 li，再按 Esc（activeElement 冒泡）关板', () => {
    // Minor-1 修复钉：input 卸载焦点断链回落 body（body keydown 不进 React 树）→
    // 二次 Esc 失效；退编辑 flushSync 提交后回焦卡片 li 保住 Esc 链
    const { mm } = makeMm()
    const { props } = renderKanban(mm)
    fireEvent.doubleClick(screen.getByText('修滚动条'))
    fireEvent.keyDown(screen.getByTestId('kanban-edit-t1'), { key: 'Escape' })
    expect(screen.queryByTestId('kanban-edit-t1')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByTestId('kanban-card-t1'))
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  test('Esc 续链（列底新增）：Esc 取消回焦看板根（丢弃草稿不提交），再按 Esc 关板', () => {
    // Minor-1 修复钉：同步回焦会触发 input onBlur commitAdd 把丢弃变提交（误建卡片），
    // 故 flushSync 先提交（卸载 input）再回焦看板根——二次 Esc 直接关板
    const { mm } = makeMm()
    const { props } = renderKanban(mm)
    fireEvent.click(screen.getByTestId('btn-kanban-add-todo'))
    fireEvent.change(screen.getByTestId('kanban-add-input-todo'), { target: { value: '草稿' } })
    fireEvent.keyDown(screen.getByTestId('kanban-add-input-todo'), { key: 'Escape' })
    expect(screen.queryByTestId('kanban-add-input-todo')).not.toBeInTheDocument()
    expect(mm.execCommand).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(screen.getByTestId('kanban-view'))
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  test('焦点在卡片 li 上 Esc（冒泡路径）：关板返回导图', () => {
    // Nit-1a 补钉：普通态焦点落在卡片 li（Tab 序列 / 退编辑回焦）时 Esc 沿 li → 看板根
    const { mm } = makeMm()
    const { props } = renderKanban(mm)
    fireEvent.keyDown(screen.getByTestId('kanban-card-t1'), { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })
})
