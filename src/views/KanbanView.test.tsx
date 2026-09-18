import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { RefObject } from 'react'
import KanbanView, { type KanbanViewProps } from './KanbanView'
import type { MindMapHandle } from '../types/engine'
import { TooltipProvider } from '../components/ui/tooltip'

// 看板模式浮层三件套装配（Task 6）：KanbanView 是 mm 命令的编排层——四列投影自
// buildKanbanCards，每个编辑操作 = 恰一条引擎命令 + onDataChanged（useIconPicker.apply
// 同款纪律）。mm 替身持可变树（icon 覆写实写回 data），可验证 data_change 订阅的
// 全刷新回路；jsdom 无 DragEvent.dataTransfer，拖拽事件以 stub 注入。

interface FakeNode {
  data: { text: string; uid: string; icon?: string[]; body?: string; expand?: boolean; tag?: unknown[] }
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
  // 归档卡（2026-09 看板治理）：archived 不进四列、收起条计数/展开/恢复拖拽断言共用
  const ta: FakeNode = {
    data: { text: '翻篇任务', uid: 'ta', icon: ['zen_status-archived'] },
    children: [],
    setIcon: vi.fn((icons: string[]) => {
      ta.data.icon = icons
    }),
  }
  // 放弃卡（2026-09-13 GTD 审视）：dropped 不进看板（无列/无收起条/过滤也不召回）断言用
  const td: FakeNode = {
    data: { text: '放弃任务', uid: 'td', icon: ['zen_status-dropped'] },
    children: [],
    setIcon: vi.fn((icons: string[]) => {
      td.data.icon = icons
    }),
  }
  const root: FakeNode = { data: { text: '根', uid: 'r' }, children: [t1, ta, td] }
  const mm = {
    getData: () => root,
    on: vi.fn((ev: string, cb: (...a: unknown[]) => void) => {
      listeners.set(ev, [...(listeners.get(ev) ?? []), cb])
    }),
    off: vi.fn((ev: string, cb: (...a: unknown[]) => void) => {
      listeners.set(ev, (listeners.get(ev) ?? []).filter((f) => f !== cb))
    }),
    renderer: {
      findNodeByUid: (uid: string): FakeNode | null =>
        uid === 'r' ? root : uid === 't1' ? t1 : uid === 'ta' ? ta : uid === 'td' ? td : null,
    },
    execCommand: vi.fn(),
  }
  return {
    mm: mm as unknown as MindMapHandle,
    root,
    t1,
    ta,
    // mock 引用单出：mm 已断言成 MindMapHandle，接口类型下 .mock 不可达
    onMock: mm.on,
    offMock: mm.off,
    emit: (ev: string) => {
      for (const cb of listeners.get(ev) ?? []) cb()
    },
  }
}

function renderKanban(
  mm: MindMapHandle,
  overrides: Partial<KanbanViewProps> = {},
): {
  props: KanbanViewProps
  unmount: () => void
  /** 宿主重渲下发（砚栏看板态专有钮 toggle 后 EditorView 重渲同款路径），验证 props 驱动显隐 */
  rerender: (overrides?: Partial<KanbanViewProps>) => void
} {
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
    // 归档列显隐上浮（2026-09 画布三态 M1）：宿主持有，默认收起
    archiveOpen: false,
    onSetArchiveOpen: vi.fn(),
    // 案头跳入定位（2026-09）：默认无定位——命中/miss 用例经 overrides 注入
    locate: null,
    onLocateConsumed: vi.fn(),
    ...overrides,
  }
  // 渲染脚手架：EditorView 根有 TooltipProvider（卡片子孙浮层依赖其上下文），此处同构包裹
  const view = render(
    <TooltipProvider>
      <KanbanView {...props} />
    </TooltipProvider>,
  )
  return {
    props,
    unmount: view.unmount,
    rerender: (o: Partial<KanbanViewProps> = {}) =>
      view.rerender(
        <TooltipProvider>
          <KanbanView {...props} {...o} />
        </TooltipProvider>,
      ),
  }
}

describe('KanbanView（看板模式浮层）', () => {
  afterEach(cleanup)

  test('渲染四列、卡片按状态落列、空列态；挂载即夺焦（引擎快捷键失活）', () => {
    const { mm } = makeMm()
    renderKanban(mm)
    for (const s of ['todo', 'doing', 'blocked', 'done']) {
      expect(screen.getByTestId(`kanban-col-${s}`)).toBeInTheDocument()
    }
    // 放弃卡不进看板（2026-09-13 GTD 审视）：BOARD_STATUSES 排除 dropped——无列、卡不可见
    expect(screen.queryByTestId('kanban-col-dropped')).not.toBeInTheDocument()
    expect(screen.queryByText('放弃任务')).not.toBeInTheDocument()
    // 过滤也不召回（与归档不同：归档过滤强制展开，放弃彻底离场）
    fireEvent.change(screen.getByTestId('kanban-filter'), { target: { value: '放弃' } })
    expect(screen.queryByText('放弃任务')).not.toBeInTheDocument()
    fireEvent.change(screen.getByTestId('kanban-filter'), { target: { value: '' } })
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

  test('body 指示点击 onOpenBody；卡片主体单击无动作（定位走菜单，2026-09 验收变更）', async () => {
    const { mm } = makeMm()
    const { props } = renderKanban(mm)
    fireEvent.click(screen.getByTestId('kanban-body-t1'))
    expect(props.onOpenBody).toHaveBeenCalledWith('t1')
    // 单击卡片主体不再定位（原 500ms 判定窗已删）：无定时器无视图切换
    fireEvent.click(screen.getByTestId('kanban-card-t1'))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600))
    })
    expect(props.onLocate).not.toHaveBeenCalled()
  })

  test('单击后紧跟双击：照常进编辑（单击无定时器副作用）', () => {
    const { mm } = makeMm()
    renderKanban(mm)
    fireEvent.click(screen.getByTestId('kanban-card-t1'))
    fireEvent.doubleClick(screen.getByText('修滚动条'))
    expect(screen.getByTestId('kanban-edit-t1')).toBeInTheDocument()
  })

  test('子树卡片：子孙徽标计数 + hover 浮层显示缩进大纲（portal 渲染，列容器不裁剪）', async () => {
    const { mm } = makeMm()
    renderKanban(mm)
    // 子孙徽标：两子 + 一孙 = 3（2026-09 子树卡片）
    expect(screen.getByTestId('kanban-children-t1')).toHaveTextContent('3 子节点')
    // hover 整卡弹浮层：大纲逐行 li（直接子节点顶格、孙辈按 depth 缩进——padding 表层级）
    fireEvent.pointerMove(screen.getByTestId('kanban-card-t1'))
    const tip = await screen.findByTestId('kanban-tip-t1')
    const lines = within(tip).getAllByRole('listitem')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toHaveTextContent('先查溢出')
    expect(lines[1]).toHaveTextContent('方案对比')
    expect(lines[2]).toHaveTextContent('浮层走 portal')
    expect((lines[0] as HTMLElement).style.paddingLeft).toBe('0px')
    expect((lines[2] as HTMLElement).style.paddingLeft).toBe('14px')
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
    // 回归钉（2026-09 验收 bug）：菜单项 click 沿 React 树从 portal 跨边界冒泡回卡片 li
    // （KanbanView 头注释同款机制），旧版 li onClick=scheduleLocate 会吃到此 click——
    // 复制后 500ms 判定窗到期切回导图画布。定位挪菜单后 li 无单击动作，冒泡无副作用
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600))
    })
    expect(props.onLocate).not.toHaveBeenCalled()
  })

  test('卡片菜单「回导图定位」：菜单项触发 onLocate（2026-09 验收变更：定位自卡片单击移入菜单）', async () => {
    const { mm } = makeMm()
    const { props } = renderKanban(mm)
    fireEvent.pointerDown(screen.getByTestId('kanban-menu-t1'), { button: 0 })
    fireEvent.click(await screen.findByTestId('kanban-locate-t1'))
    expect(props.onLocate).toHaveBeenCalledWith('t1')
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
        // 数据树挂 renderTree（引擎活树形态——getData 是深拷贝副本，直写不落引擎）；
        // grp 收起时 t2 不在渲染树；expand 直写 true 后（safeReRender 重渲）可寻址
        renderTree: root,
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

  test('过滤：匹配标题保留、非匹配列空显示「无匹配任务」；清空恢复「暂无任务」', () => {
    const { mm } = makeMm()
    renderKanban(mm)
    const input = screen.getByTestId('kanban-filter')
    fireEvent.change(input, { target: { value: '滚动' } })
    expect(screen.getByText('修滚动条')).toBeInTheDocument()
    // doing 列命中非空；其余四列全空 → 过滤占位（区别于「暂无任务」）
    expect(within(screen.getByTestId('kanban-col-todo')).getByText('无匹配任务')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: '' } })
    expect(within(screen.getByTestId('kanban-col-todo')).getByText('暂无任务')).toBeInTheDocument()
  })

  test('过滤命中路径与标签（大小写不敏感）：父链名/标签文本均可命中', () => {
    // 标签走引擎 data.tag（字符串数组形态，collectTags 收文本）——卡片.tags 由
    // engineTreeToZen 还原；「zen」小写搜大写标签命中
    const t9: FakeNode = { data: { text: '发布检查', uid: 't9', icon: ['zen_status-doing'], tag: ['Release'] }, children: [] }
    const root: FakeNode = { data: { text: '根', uid: 'r' }, children: [t9] }
    const mm = {
      getData: () => root,
      on: vi.fn(),
      off: vi.fn(),
      renderer: { findNodeByUid: (): null => null },
      execCommand: vi.fn(),
    }
    renderKanban(mm as unknown as MindMapHandle)
    // 路径：t9 根下直挂无父链，先给标签命中断言
    fireEvent.change(screen.getByTestId('kanban-filter'), { target: { value: 'release' } })
    expect(screen.getByText('发布检查')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('kanban-filter'), { target: { value: '不存在词' } })
    expect(screen.queryByText('发布检查')).not.toBeInTheDocument()
  })

  test('Esc 分层（过滤框）：非空 Esc 只清空不冒泡关板；已空 Esc 冒泡关板', () => {
    const { mm } = makeMm()
    const { props } = renderKanban(mm)
    const input = screen.getByTestId('kanban-filter')
    fireEvent.change(input, { target: { value: 'x' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveValue('')
    expect(props.onClose).not.toHaveBeenCalled()
    // 已空：不再 stopPropagation，冒泡到看板根走关板（与列底新增同款分层协议）
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  test('归档卡不进四列：收起态无收起条（已退役）无归档列，卡不可见（2026-09 看板治理）', () => {
    const { mm } = makeMm()
    renderKanban(mm)
    // 收起条退役（画布三态 M1 显隐上浮）：展开入口移砚栏，板内无此 testid
    expect(screen.queryByTestId('kanban-archive-collapsed')).not.toBeInTheDocument()
    expect(screen.queryByTestId('kanban-col-archived')).not.toBeInTheDocument()
    // 四列内无归档卡（列循环走 BOARD_STATUSES）
    expect(screen.queryByText('翻篇任务')).not.toBeInTheDocument()
  })

  test('归档列显隐走 props：收起条退役，宿主经 archiveOpen 驱动、板内无展开入口', () => {
    const { mm } = makeMm()
    const { props, rerender } = renderKanban(mm)
    // 收起条退役：无此 testid；板内没有任何入口能调 onSetArchiveOpen(true)（砚栏钮，后续任务接）
    expect(screen.queryByTestId('kanban-archive-collapsed')).toBeNull()
    expect(screen.queryByTestId('kanban-col-archived')).not.toBeInTheDocument()
    expect(props.onSetArchiveOpen).not.toHaveBeenCalled()
    // 宿主下发 archiveOpen=true → 归档列现形（过滤强制展开叠加逻辑另测）
    rerender({ archiveOpen: true })
    expect(screen.getByTestId('kanban-col-archived')).toBeInTheDocument()
    expect(screen.getByText('翻篇任务')).toBeInTheDocument()
    // 宿主收回 → 列退场
    rerender({ archiveOpen: false })
    expect(screen.queryByTestId('kanban-col-archived')).not.toBeInTheDocument()
  })

  test('归档列展开/收起：宿主 archiveOpen=true 渲染标准列，列头收起钮回调 onSetArchiveOpen(false)', () => {
    const { mm } = makeMm()
    const { props, rerender } = renderKanban(mm, { archiveOpen: true })
    expect(screen.getByTestId('kanban-col-archived')).toBeInTheDocument()
    expect(screen.getByText('翻篇任务')).toBeInTheDocument()
    // 收起钮 = 请求宿主收起（就近入口与砚栏钮同一状态）：回调上行，列不自发卸载
    fireEvent.click(screen.getByTestId('btn-kanban-archive-collapse'))
    expect(props.onSetArchiveOpen).toHaveBeenCalledWith(false)
    expect(screen.getByTestId('kanban-col-archived')).toBeInTheDocument()
    // 宿主落实收起后列退场
    rerender({ archiveOpen: false })
    expect(screen.queryByTestId('kanban-col-archived')).not.toBeInTheDocument()
  })

  test('归档列拖出到 todo 列恢复：changeStatus 管线复用（徽章合成 + onDataChanged）', () => {
    const { mm, ta } = makeMm()
    const { props } = renderKanban(mm, { archiveOpen: true })
    const dt = { setData: vi.fn(), getData: (k: string) => (k === 'text/kanban-uid' ? 'ta' : '') }
    fireEvent.dragStart(screen.getByTestId('kanban-card-ta'), { dataTransfer: dt })
    fireEvent.drop(screen.getByTestId('kanban-col-todo'), { dataTransfer: dt })
    expect(ta.setIcon).toHaveBeenCalledWith(['zen_status-todo'])
    expect(props.onDataChanged).toHaveBeenCalled()
  })

  test('过滤联动归档列：过滤非空强制展开（未手动开）；清空回落收起（spec §4）', () => {
    const { mm } = makeMm()
    renderKanban(mm)
    expect(screen.queryByTestId('kanban-col-archived')).not.toBeInTheDocument()
    fireEvent.change(screen.getByTestId('kanban-filter'), { target: { value: '翻篇' } })
    expect(screen.getByTestId('kanban-col-archived')).toBeInTheDocument()
    expect(screen.getByText('翻篇任务')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('kanban-filter'), { target: { value: '' } })
    expect(screen.queryByTestId('kanban-col-archived')).not.toBeInTheDocument()
  })

  test('批量归档：done 列头按钮逐卡合成 archived 徽章（用户图标保留）、非 done 卡不动', () => {
    const d1: FakeNode = {
      data: { text: '完成甲', uid: 'd1', icon: ['zen_status-done', 'zen_flag'] },
      children: [],
      setIcon: vi.fn(),
    }
    const d2: FakeNode = { data: { text: '完成乙', uid: 'd2', icon: ['zen_status-done'] }, children: [], setIcon: vi.fn() }
    const t1: FakeNode = { data: { text: '进行中', uid: 't1', icon: ['zen_status-doing'] }, children: [], setIcon: vi.fn() }
    const root: FakeNode = { data: { text: '根', uid: 'r' }, children: [t1, d1, d2] }
    const mm = {
      getData: () => root,
      on: vi.fn(),
      off: vi.fn(),
      renderer: {
        findNodeByUid: (uid: string): FakeNode | null =>
          uid === 'r' ? root : uid === 't1' ? t1 : uid === 'd1' ? d1 : uid === 'd2' ? d2 : null,
      },
      execCommand: vi.fn(),
    }
    const { props } = renderKanban(mm as unknown as MindMapHandle)
    fireEvent.click(screen.getByTestId('btn-kanban-archive-all'))
    // 逐卡恰一条命令（spec §2.4：undo 逐卡回退的已知取舍）；徽章互保合成（用户图标保留）
    expect(d1.setIcon).toHaveBeenCalledWith(['zen_status-archived', 'zen_flag'])
    expect(d2.setIcon).toHaveBeenCalledWith(['zen_status-archived'])
    expect(t1.setIcon).not.toHaveBeenCalled()
    expect(props.onDataChanged).toHaveBeenCalledTimes(2)
  })

  test('批量归档空列 no-op：无 done 卡时不产生命令不置脏', () => {
    const { mm, t1 } = makeMm()
    const { props } = renderKanban(mm)
    fireEvent.click(screen.getByTestId('btn-kanban-archive-all'))
    expect(t1.setIcon).not.toHaveBeenCalled()
    expect(props.onDataChanged).not.toHaveBeenCalled()
  })

  test('批量归档收起分支回归钉：同分支两张 done 卡都落命令（2026-09 遗留卡 bug）', () => {
    // 树：root > grp(expand=false) > d1/d2（done）。渲染树：grp 收起时两卡 miss，
    // renderDone 翻转后才可寻址——批量 forEach 同步连发，第二张在重渲完成前寻址
    // miss 且祖先已被第一张展开，旧实现误判垃圾 uid 丢弃（statusOps 单测同根因）
    const d1: FakeNode = {
      data: { text: '完成甲', uid: 'd1', icon: ['zen_status-done'] },
      children: [],
      setIcon: vi.fn(),
    }
    const d2: FakeNode = {
      data: { text: '完成乙', uid: 'd2', icon: ['zen_status-done'] },
      children: [],
      setIcon: vi.fn(),
    }
    const grp: FakeNode = { data: { text: '分组', uid: 'g', expand: false }, children: [d1, d2] }
    const root: FakeNode = { data: { text: '根', uid: 'r' }, children: [grp] }
    const listeners = new Map<string, Array<(...a: unknown[]) => void>>()
    let renderDone = false
    const mm = {
      getData: () => root,
      on: vi.fn((ev: string, cb: (...a: unknown[]) => void) => {
        listeners.set(ev, [...(listeners.get(ev) ?? []), cb])
      }),
      off: vi.fn((ev: string, cb: (...a: unknown[]) => void) => {
        listeners.set(ev, (listeners.get(ev) ?? []).filter((f) => f !== cb))
      }),
      renderer: {
        renderTree: root,
        findNodeByUid: (uid: string): FakeNode | null => {
          if (uid === 'r') return root
          if (uid === 'g') return grp
          if (renderDone && uid === 'd1') return d1
          if (renderDone && uid === 'd2') return d2
          return null
        },
      },
      execCommand: vi.fn(),
    }
    const { props } = renderKanban(mm as unknown as MindMapHandle)
    fireEvent.click(screen.getByTestId('btn-kanban-archive-all'))
    // 同步阶段：两卡都不落命令（渲染未完成），第一张已触发祖先直写展开
    expect(grp.data.expand).toBe(true)
    expect(d1.setIcon).not.toHaveBeenCalled()
    // 渲染完成 → 两张挂起回调都落命令（回归钉：旧实现 d2 被误判丢弃遗留）
    renderDone = true
    for (const cb of [...(listeners.get('node_tree_render_end') ?? [])]) cb()
    expect(d1.setIcon).toHaveBeenCalledWith(['zen_status-archived'])
    expect(d2.setIcon).toHaveBeenCalledWith(['zen_status-archived'])
    expect(props.onDataChanged).toHaveBeenCalledTimes(2)
  })
})

// ── 案头跳入定位（2026-09：view:'kanban' 寻址器消费）── 命中滚动+高亮限时淡出 / miss 出口 / 空板挂起 ──
describe('KanbanView 案头跳入定位（2026-09）', () => {
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  test('命中：滚动可见 + 描边高亮 + 消费即清；限时淡出摘除高亮', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { mm } = makeMm()
    const { props, rerender } = renderKanban(mm)
    // jsdom 未实现 scrollIntoView：目标卡元素直接挂桩断言滚动（两轴 nearest 最小滚动）
    const card = screen.getByTestId('kanban-card-t1')
    const scrollSpy = vi.fn()
    card.scrollIntoView = scrollSpy
    rerender({ archiveOpen: true, locate: { path: [], text: '修滚动条' } })
    expect(scrollSpy).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
    expect(card.className).toContain('ring-2') // 命中卡描边
    // 只亮命中卡：归档列展开在场（顺带覆盖第二处 KanbanColumn 的 highlightUid 接线）
    expect(screen.getByTestId('kanban-card-ta').className).not.toContain('ring-2')
    expect(props.onLocateConsumed).toHaveBeenCalledTimes(1) // 消费即清（上报宿主）
    // 限时淡出（验收口径：定位感强不留持久噪音）
    act(() => vi.advanceTimersByTime(2500))
    expect(screen.getByTestId('kanban-card-t1').className).not.toContain('ring-2')
  })

  test('miss：console.warn 线索 + 消费即清，无卡高亮（图与扫描时已不同）', () => {
    const { mm } = makeMm()
    const { props, rerender } = renderKanban(mm)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      rerender({ locate: { path: [], text: '扫描后被改名' } })
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('未命中卡片'), expect.objectContaining({ text: '扫描后被改名' }))
      expect(props.onLocateConsumed).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('kanban-card-t1').className).not.toContain('ring-2')
    } finally {
      warnSpy.mockRestore()
    }
  })

  test('空板挂起：无卡可匹配时不消费（无害挂起，随宿主卸载消亡）', () => {
    const root: FakeNode = { data: { text: '根', uid: 'r' }, children: [] }
    const mm = {
      getData: () => root,
      on: vi.fn(),
      off: vi.fn(),
      renderer: {},
      execCommand: vi.fn(),
    }
    const { props, rerender } = renderKanban(mm as unknown as MindMapHandle)
    rerender({ locate: { path: [], text: '任何任务' } })
    expect(props.onLocateConsumed).not.toHaveBeenCalled()
  })
})
