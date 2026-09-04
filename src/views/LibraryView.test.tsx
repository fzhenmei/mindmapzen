import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { beforeEach, describe } from 'vitest'
import LibraryView from './LibraryView'
import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'

let fs: MemoryFsAdapter
const pickDirectory = vi.fn(async () => '/ws')
// pickImportFile 桩：默认未选择任何文件（导入相关用例内各自注入实现）
const pickImportFile = vi.fn(async (): Promise<{ name: string; kind: 'md'; text: string } | null> => null)

beforeEach(async () => {
  fs = new MemoryFsAdapter()
  await fs.writeTextFileAtomic('/ws/想法A.md', '# A\n')
  useAppStore.getState().setAdapter(fs)
  useAppStore.setState({ route: 'library', maps: [], workspaceDir: null, currentMdPath: null, error: null, selectedDir: '' })
  pickImportFile.mockClear()
})

// 无工作区 → 开屏页（M5d Task 3）：替代旧 hint；页首栏随之隐藏（spec §2）
test('无工作区时渲染开屏页，创建工作区后进入案头', async () => {
  render(<LibraryView pickDirectory={pickDirectory} pickImportFile={pickImportFile} writeClipboard={vi.fn(async () => {})} />)
  expect(screen.getByTestId('welcome-screen')).toBeInTheDocument()
  expect(screen.getByTestId('btn-welcome-create')).toBeInTheDocument()
  expect(screen.getByTestId('btn-welcome-pick')).toBeInTheDocument()
  // 页首栏隐藏：设置入口不渲染；主题钮 2026-09 起开屏态常驻右下角 fab（开屏/案头/纸面三态统一）
  expect(screen.queryByTestId('btn-settings')).not.toBeInTheDocument()
  expect(screen.getByTestId('btn-theme')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('btn-welcome-create'))
  await waitFor(() => expect(useAppStore.getState().workspaceDir).toBe('/ws'))
  // M15：有工作区后进案头 idle 空态（未选任何），开屏页不再渲染
  expect(await screen.findByTestId('desk-idle')).toBeInTheDocument()
  expect(screen.queryByTestId('welcome-screen')).not.toBeInTheDocument()
})

test('开屏次入口「选择已有文件夹」同走工作区选择流', async () => {
  render(<LibraryView pickDirectory={pickDirectory} pickImportFile={pickImportFile} writeClipboard={vi.fn(async () => {})} />)
  fireEvent.click(screen.getByTestId('btn-welcome-pick'))
  await waitFor(() => expect(useAppStore.getState().workspaceDir).toBe('/ws'))
  expect(await screen.findByTestId('desk-idle')).toBeInTheDocument()
})

// M5d 缓期项清偿：设置页「更换工作区」——pickDirectory 选新文件夹后案头切换、对话框关闭
test('设置更换工作区：经 pickDirectory 切换案头并关闭对话框', async () => {
  await fs.writeTextFileAtomic('/ws2/新家.md', '# 新家\n')
  await useAppStore.getState().setWorkspace('/ws')
  const pick = vi.fn(async () => '/ws2')
  render(<LibraryView pickDirectory={pick} pickImportFile={pickImportFile} writeClipboard={vi.fn(async () => {})} />)
  fireEvent.click(screen.getByTestId('btn-settings'))
  expect(screen.getByTestId('settings-dialog')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('settings-workspace-change'))
  expect(screen.queryByTestId('settings-dialog')).not.toBeInTheDocument()
  await waitFor(() => expect(useAppStore.getState().workspaceDir).toBe('/ws2'))
  expect(pick).toHaveBeenCalledTimes(1)
  // 切换工作区回欢迎页；左树（默认全展开）直列新图文件行
  expect(await screen.findByTestId('desk-idle')).toBeInTheDocument()
  expect(await screen.findByTestId('file-node-新家')).toBeInTheDocument()
})

// v0.7.0 验收：设置页「退出工作区（回到开屏）」——清 workspaceDir 回开屏页并持久化 null
test('设置退出工作区：回到开屏页，配置落 workspaceDir:null（其他字段保留）', async () => {
  useAppStore.setState({ configPath: '/cfg.json' })
  await useAppStore.getState().setWorkspace('/ws')
  await useAppStore.getState().setPreferredLayout('logic') // 预置另一字段：合并保存不得覆盖
  render(<LibraryView pickDirectory={vi.fn()} pickImportFile={pickImportFile} writeClipboard={vi.fn(async () => {})} />)
  fireEvent.click(screen.getByTestId('btn-settings'))
  fireEvent.click(screen.getByTestId('settings-workspace-exit'))
  await waitFor(() => expect(useAppStore.getState().workspaceDir).toBeNull())
  // 开屏页重新渲染，页首工具栏随无工作区态隐藏；案头骨架（侧栏）整体卸载
  expect(await screen.findByTestId('welcome-screen')).toBeInTheDocument()
  expect(screen.queryByTestId('btn-settings')).not.toBeInTheDocument()
  expect(screen.queryByTestId('dir-panel')).not.toBeInTheDocument()
  const cfg = JSON.parse(await fs.readTextFile('/cfg.json'))
  expect(cfg.workspaceDir).toBeNull()
  expect(cfg.lastOpened).toBeNull()
  expect(cfg.preferredLayout).toBe('logic') // load-merge-save 保留其他字段
})

test('空态引导文案', async () => {
  await useAppStore.getState().setWorkspace('/ws-empty')
  render(<LibraryView pickDirectory={vi.fn()} pickImportFile={pickImportFile} writeClipboard={vi.fn(async () => {})} />)
  expect(await screen.findByTestId('library-empty')).toHaveTextContent('空白的纸')
})

test('已有工作区时列出导图，双击打开进纸面', async () => {
  await useAppStore.getState().setWorkspace('/ws')
  render(<LibraryView pickDirectory={pickDirectory} pickImportFile={pickImportFile} writeClipboard={vi.fn(async () => {})} />)
  // 树文件行双击进纸面（主区纯预览化后打开文件的唯一案头入口）
  fireEvent.dblClick(await screen.findByTestId('file-node-想法A'))
  await waitFor(() => expect(useAppStore.getState().route).toBe('editor'))
})

test('新建流程：输入名称后创建并进入编辑器', async () => {
  await useAppStore.getState().setWorkspace('/ws')
  render(<LibraryView pickDirectory={pickDirectory} pickImportFile={pickImportFile} writeClipboard={vi.fn(async () => {})} />)
  fireEvent.click(screen.getByTestId('btn-new'))
  fireEvent.input(screen.getByTestId('input-name'), { target: { value: '想法B' } })
  fireEvent.click(screen.getByTestId('btn-confirm'))
  await waitFor(() => expect(useAppStore.getState().route).toBe('editor'))
  expect(await fs.exists('/ws/想法B.md')).toBe(true)
})

// M16 验收：输入类错误在对话框内提示、不关框（通常做法）
test('新建空名：对话框保留、错误框内提示（不关框、不进全局 banner）', async () => {
  await useAppStore.getState().setWorkspace('/ws')
  render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
  fireEvent.click(screen.getByTestId('btn-new'))
  fireEvent.click(screen.getByTestId('btn-confirm'))
  expect(await screen.findByTestId('dialog-error')).toHaveTextContent('名称不能为空')
  // 对话框未关闭（输入框仍在）
  expect(screen.getByTestId('input-name')).toBeInTheDocument()
  expect(useAppStore.getState().error).toBeNull()
})

test('新建重名：服务错误框内显示、对话框保留', async () => {
  await useAppStore.getState().setWorkspace('/ws') // /ws 已预置 想法A.md
  render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
  fireEvent.click(screen.getByTestId('btn-new'))
  fireEvent.input(screen.getByTestId('input-name'), { target: { value: '想法A' } })
  fireEvent.click(screen.getByTestId('btn-confirm'))
  expect(await screen.findByTestId('dialog-error')).toHaveTextContent('已存在同名导图')
  expect(screen.getByTestId('input-name')).toBeInTheDocument()
  expect(useAppStore.getState().route).toBe('library')
})

test('删除需二次确认', async () => {
  await useAppStore.getState().setWorkspace('/ws')
  render(<LibraryView pickDirectory={pickDirectory} pickImportFile={pickImportFile} writeClipboard={vi.fn(async () => {})} />)
  // 选中文件进详情态，删除入口在页首动作组
  fireEvent.click(await screen.findByTestId('file-node-想法A'))
  expect(await screen.findByTestId('file-detail')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('btn-delete'))
  expect(screen.getByText('删除「想法A」？')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('btn-delete-confirm'))
  await waitFor(() => expect(useAppStore.getState().maps).toHaveLength(0))
  expect(fs.removeLog).toEqual(['/ws/想法A.md'])
})

test('删除按钮作用于当前选中文件，不误伤其他导图', async () => {
  await fs.writeTextFileAtomic('/ws/想法B.md', '# B\n')
  await useAppStore.getState().setWorkspace('/ws')
  render(<LibraryView pickDirectory={pickDirectory} pickImportFile={pickImportFile} writeClipboard={vi.fn(async () => {})} />)
  // 树中两行文件行俱在；选中想法A进详情态
  expect(await screen.findByTestId('file-node-想法A')).toBeInTheDocument()
  expect(screen.getByTestId('file-node-想法B')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('file-node-想法A'))
  expect(await screen.findByTestId('file-detail')).toBeInTheDocument()
  // 确认框显示当前选中导图名
  fireEvent.click(screen.getByTestId('btn-delete'))
  expect(screen.getByText('删除「想法A」？')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('btn-delete-confirm'))
  await waitFor(() => expect(useAppStore.getState().maps).toHaveLength(1))
  // 只删了选中的想法A，想法B 未被误删
  expect(fs.removeLog).toEqual(['/ws/想法A.md'])
  expect(await fs.exists('/ws/想法B.md')).toBe(true)
})

test('导入：有忽略块先预览，确认后入库并打开', async () => {
  await useAppStore.getState().setWorkspace('/ws')
  const pickImport = vi.fn(async () => ({ name: '外部', kind: 'md' as const, text: '# 外部图\n\n一段会被忽略的说明。\n\n## A\n' }))
  render(<LibraryView pickDirectory={vi.fn()} pickImportFile={pickImport} writeClipboard={vi.fn(async () => {})} />)
  fireEvent.click(screen.getByTestId('btn-import'))
  expect(await screen.findByTestId('import-preview')).toHaveTextContent('1 个内容块未映射')
  expect(screen.getByTestId('import-preview')).toHaveTextContent('段落：一段会被忽略的说明')
  fireEvent.click(screen.getByTestId('import-cancel'))
  expect(await fs.exists('/ws/外部.md')).toBe(false) // 取消不入库
  fireEvent.click(screen.getByTestId('btn-import'))
  fireEvent.click(await screen.findByTestId('import-confirm'))
  await waitFor(() => expect(useAppStore.getState().route).toBe('editor'))
  expect(await fs.readTextFile('/ws/外部.md')).toContain('# 外部图')
})

describe('案头目录（M5a）', () => {
  test('目录树渲染：目录下直列文件行；选中目录主区显示欢迎页', async () => {
    const dirFs = new MemoryFsAdapter()
    await dirFs.mkdir('/ws/项目')
    await dirFs.writeTextFileAtomic('/ws/项目/甲.md', '# 甲\n')
    await dirFs.writeTextFileAtomic('/ws/根图.md', '# 根\n')
    useAppStore.getState().setAdapter(dirFs)
    await useAppStore.getState().setWorkspace('/ws')
    render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
    // 默认全展开：根下与子目录下的 .md 均有文件行；主区欢迎页（主区不再有文件列表）
    expect(await screen.findByTestId('dir-node-项目')).toBeInTheDocument()
    expect(screen.getByTestId('file-node-甲')).toBeInTheDocument()
    expect(screen.getByTestId('file-node-根图')).toBeInTheDocument()
    expect(screen.getByTestId('desk-idle')).toBeInTheDocument()
    expect(screen.queryByTestId('map-item')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('dir-node-项目'))
    await waitFor(() => expect(useAppStore.getState().selectedDir).toBe('项目'))
    // 选中目录仍显示欢迎页（纯预览化：目录态不换主区内容）
    expect(screen.getByTestId('desk-idle')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('dir-node-all'))
    await waitFor(() => expect(useAppStore.getState().selectedDir).toBe(''))
    expect(screen.getByTestId('desk-idle')).toBeInTheDocument()
  })

  test('移动导图：对话框选目录后两文件进新目录', async () => {
    const dirFs = new MemoryFsAdapter()
    await dirFs.writeTextFileAtomic('/ws/根图.md', '# 根\n')
    await dirFs.writeTextFileAtomic('/ws/根图.zen.json', '{}')
    await dirFs.mkdir('/ws/灵')
    useAppStore.getState().setAdapter(dirFs)
    await useAppStore.getState().setWorkspace('/ws')
    render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
    // 选中文件进详情态，移动入口在页首动作组
    fireEvent.click(await screen.findByTestId('file-node-根图'))
    expect(await screen.findByTestId('file-detail')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('btn-move'))
    const dlg = await screen.findByTestId('move-dialog')
    // 导图当前所在层（根）作为目标被禁用，防同目录自碰撞
    expect(within(dlg).getByTestId('dir-node-root')).toBeDisabled()
    fireEvent.click(within(dlg).getByTestId('dir-node-灵'))
    fireEvent.click(within(dlg).getByTestId('move-confirm'))
    await waitFor(() => expect(useAppStore.getState().maps[0]?.relDir).toBe('灵'))
    // .md 与 .zen.json 两文件同移，源位清空
    expect(await dirFs.exists('/ws/灵/根图.md')).toBe(true)
    expect(await dirFs.exists('/ws/灵/根图.zen.json')).toBe(true)
    expect(await dirFs.exists('/ws/根图.md')).toBe(false)
  })

  test('移动对话框内联新建目录后可直接移入', async () => {
    const dirFs = new MemoryFsAdapter()
    await dirFs.writeTextFileAtomic('/ws/根图.md', '# 根\n')
    useAppStore.getState().setAdapter(dirFs)
    await useAppStore.getState().setWorkspace('/ws')
    render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
    // 选中文件进详情态，移动入口在页首动作组
    fireEvent.click(await screen.findByTestId('file-node-根图'))
    expect(await screen.findByTestId('file-detail')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('btn-move'))
    const dlg = await screen.findByTestId('move-dialog')
    fireEvent.input(within(dlg).getByTestId('move-newdir-input'), { target: { value: '新层' } })
    fireEvent.click(within(dlg).getByTestId('move-newdir-add'))
    // 新目录已建好并自动选中，确认即可移入
    await waitFor(() => expect(within(dlg).getByTestId('move-confirm')).toBeEnabled())
    fireEvent.click(within(dlg).getByTestId('move-confirm'))
    await waitFor(() => expect(useAppStore.getState().maps[0]?.relDir).toBe('新层'))
    expect(await dirFs.exists('/ws/新层/根图.md')).toBe(true)
    // 案头左树同步出现新目录
    expect(await screen.findByTestId('dir-node-新层')).toBeInTheDocument()
  })

  test('移动对话框内建目录后取消：目录已落盘须进左树（onCancel 重读）', async () => {
    const dirFs = new MemoryFsAdapter()
    await dirFs.writeTextFileAtomic('/ws/根图.md', '# 根\n')
    useAppStore.getState().setAdapter(dirFs)
    await useAppStore.getState().setWorkspace('/ws')
    render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
    // 选中文件进详情态，移动入口在页首动作组
    fireEvent.click(await screen.findByTestId('file-node-根图'))
    expect(await screen.findByTestId('file-detail')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('btn-move'))
    const dlg = await screen.findByTestId('move-dialog')
    fireEvent.input(within(dlg).getByTestId('move-newdir-input'), { target: { value: '临时层' } })
    fireEvent.click(within(dlg).getByTestId('move-newdir-add'))
    // 取消移动：目录已 mkdir 落盘，左树须重读纳入（否则左树陈旧，直到下次工作区切换）
    fireEvent.click(within(dlg).getByTestId('move-cancel'))
    expect(await screen.findByTestId('dir-node-临时层')).toBeInTheDocument()
    expect(screen.queryByTestId('move-dialog')).not.toBeInTheDocument()
  })

  test('新建目录', async () => {
    const dirFs = new MemoryFsAdapter()
    useAppStore.getState().setAdapter(dirFs)
    await useAppStore.getState().setWorkspace('/ws')
    render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
    fireEvent.click(screen.getByTestId('dir-create'))
    fireEvent.input(screen.getByTestId('input-name'), { target: { value: '新层' } })
    fireEvent.click(screen.getByTestId('btn-confirm'))
    expect(await screen.findByTestId('dir-node-新层')).toBeInTheDocument()
  })

  test('空目录选中后主区显示欢迎页（无空态文件列表）', async () => {
    const dirFs = new MemoryFsAdapter()
    await dirFs.writeTextFileAtomic('/ws/根图.md', '# 根\n')
    await dirFs.mkdir('/ws/空层')
    useAppStore.getState().setAdapter(dirFs)
    await useAppStore.getState().setWorkspace('/ws')
    render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
    fireEvent.click(await screen.findByTestId('dir-node-空层'))
    await waitFor(() => expect(useAppStore.getState().selectedDir).toBe('空层'))
    // 主区纯预览化：选中目录不切换主区内容，仍是欢迎页
    expect(screen.getByTestId('desk-idle')).toBeInTheDocument()
  })

  // 2026-09 插图资产目录保护：根层 assets 是 app 基础设施，不进左树（右键/移动目标随树一并不可达）
  test('根层 assets 目录不进左树', async () => {
    const dirFs = new MemoryFsAdapter()
    await dirFs.mkdir('/ws/assets')
    await dirFs.writeTextFileAtomic('/ws/assets/选图.png', 'png-bytes')
    await dirFs.writeTextFileAtomic('/ws/根图.md', '# 根\n')
    useAppStore.getState().setAdapter(dirFs)
    await useAppStore.getState().setWorkspace('/ws')
    render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
    expect(await screen.findByTestId('file-node-根图')).toBeInTheDocument()
    expect(screen.queryByTestId('dir-node-assets')).not.toBeInTheDocument()
  })

  // 设置入口（M5b Task 4）：页首 btn-settings 打开设置对话框，开关切换写入 store
  test('页首设置按钮打开设置对话框并可切换复制开关', async () => {
    const dirFs = new MemoryFsAdapter()
    useAppStore.getState().setAdapter(dirFs)
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().setWorkspace('/ws')
    render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
    fireEvent.click(screen.getByTestId('btn-settings'))
    expect(await screen.findByTestId('settings-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('copy-note-toggle')).not.toBeChecked()
    fireEvent.click(screen.getByTestId('copy-note-toggle'))
    await waitFor(() => expect(useAppStore.getState().settings.copyIncludeNote).toBe(true))
    // 关闭后对话框卸载
    fireEvent.click(screen.getByTestId('settings-close'))
    await waitFor(() => expect(screen.queryByTestId('settings-dialog')).not.toBeInTheDocument())
  })
})

describe('案头三区与交互（M5d）', () => {
  beforeEach(async () => {
    fs = new MemoryFsAdapter()
    await fs.writeTextFileAtomic('/ws/想法A.md', '# 想法A\n\n## 分支\n')
    await fs.mkdir('/ws/项目')
    await fs.writeTextFileAtomic('/ws/项目/甲.md', '# 甲\n')
    useAppStore.getState().setAdapter(fs)
    await useAppStore.getState().setWorkspace('/ws')
  })

  test('命令栏：印章 + 工作区名面包屑、设置/导入/新建均纯图标（M5c 起 ZenTooltip 承担提示，title 退役防双提示）；工作区路径移到树根 tooltip', async () => {
    render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
    // M12b 案头三区：左面包屑为工作区名（品牌名归开屏页）
    // 欢迎页品牌头也有 h1（Mind Map Zen）——面包屑按名称精确断言
    expect(screen.getByRole('heading', { level: 1, name: 'ws' })).toHaveTextContent('ws')
    // v0.7.0 验收纯图标化 + M5c：视觉提示改 ZenTooltip（悬停浮签），语义名归 aria-label（title 移除）
    expect(screen.getByTestId('btn-settings').textContent).toBe('')
    expect(screen.getByTestId('btn-import').textContent).toBe('')
    expect(screen.getByTestId('btn-import')).toHaveAttribute('aria-label', '导入 .md')
    expect(screen.getByTestId('btn-import')).not.toHaveAttribute('title')
    expect(screen.getByTestId('btn-new').textContent).toBe('')
    expect(screen.getByTestId('btn-new')).toHaveAttribute('aria-label', '新建导图')
    expect(screen.getByTestId('btn-new')).not.toHaveAttribute('title')
    // 选择工作区入口从工具栏移除（开屏页承担）
    expect(screen.queryByTestId('btn-workspace')).not.toBeInTheDocument()
    // 树根 = 工作区名，tooltip 全路径
    const root = await screen.findByTestId('dir-node-all')
    expect(root).toHaveTextContent('ws')
    expect(root).toHaveAttribute('title', '/ws')
  })

  test('树文件行单击 = 选中进详情态（header 标题/动作钮上移 + md 预览），不进纸面', async () => {
    const writeClipboard = vi.fn(async () => {})
    render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={writeClipboard} />)
    expect(screen.queryByTestId('file-detail')).not.toBeInTheDocument()
    // 详情动作钮仅详情态渲染（容器合并：自卡头上移页首）
    expect(screen.queryByTestId('btn-detail-back')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByTestId('file-node-想法A'))
    // 容器合并：主区即预览面板——真实 markdown 渲染（H1 渲染想法A），无 Card 包裹
    expect(await screen.findByTestId('file-detail')).toBeInTheDocument()
    expect(await screen.findByTestId('md-preview')).toHaveTextContent('想法A')
    // header 标题换 md 文件名（truncate 截断）；元信息（大小/创建/修改）并入 title tooltip。
    // 名称定位：预览区 md 内容的 # 想法A 也渲染 h1，按可访问名区分
    const h1 = screen.getByRole('heading', { level: 1, name: '想法A.md' })
    expect(h1).toHaveAttribute('title', expect.stringContaining('B'))
    // 六枚详情动作钮 + 「更多」触发钮均在页首（宽组/窄组由容器查询 CSS 分流）
    for (const id of [
      'btn-detail-back',
      'btn-move',
      'btn-rename',
      'btn-delete',
      'btn-copy-path',
      'btn-detail-open',
      'btn-detail-more',
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument()
    }
    // 复制路径（原 FileDetail 卡头行为,上移页首后行为不变）：以 mdPath 调剪贴板端口
    fireEvent.click(screen.getByTestId('btn-copy-path'))
    expect(writeClipboard).toHaveBeenCalledTimes(1)
    expect(writeClipboard).toHaveBeenCalledWith('/ws/想法A.md')
    // 单击只选中不进纸面
    expect(useAppStore.getState().route).toBe('library')
  })

  test('详情态「更多」浮层：平铺全部动作，菜单项直达（打开导图）', async () => {
    render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
    fireEvent.click(await screen.findByTestId('file-node-想法A'))
    expect(await screen.findByTestId('file-detail')).toBeInTheDocument()
    // pointerdown 开菜单（Radix Trigger 口径，同 ui/dropdown-menu.test 模式）；条目 testid 加 more- 前缀与宽组同名钮区分（E2E 严格模式）
    fireEvent.pointerDown(screen.getByTestId('btn-detail-more'), { button: 0 })
    expect(await screen.findByTestId('more-btn-detail-back')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '移动到目录' })).toBeInTheDocument()
    // 菜单「打开导图」直达纸面
    fireEvent.click(screen.getByTestId('more-btn-detail-open'))
    await waitFor(() => expect(useAppStore.getState().route).toBe('editor'))
  })

  test('树文件行渲染：目录与根下文件行可见，单击选中进详情；目录行带文件夹图标', async () => {
    render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
    expect(await screen.findByTestId('file-node-甲')).toBeInTheDocument()
    expect(screen.getByTestId('file-node-想法A')).toBeInTheDocument()
    // 目录节点图标化（spec §3）：IconFolder 存在于目录行
    expect(screen.getByTestId('dir-node-项目').querySelector('svg')).toBeInTheDocument()
    // 文件行图标（IconMarkdown：M↓ 标志一眼即知 .md）
    expect(screen.getByTestId('file-node-甲').querySelector('svg')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('file-node-甲'))
    // 选中态走官方 isActive（data-active=true）；主区切详情态（md 预览渲染甲）
    expect(screen.getByTestId('file-node-甲')).toHaveAttribute('data-active', 'true')
    expect(await screen.findByTestId('file-detail')).toBeInTheDocument()
    expect(screen.getByTestId('md-preview')).toHaveTextContent('甲')
  })

  test('选中态失效清理：重命名/删除选中图后详情态清空回欢迎页', async () => {
    render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
    // 选中 想法A（树文件行）进详情态
    fireEvent.click(await screen.findByTestId('file-node-想法A'))
    expect(await screen.findByTestId('file-detail')).toBeInTheDocument()
    // 详情态页首重命名 → mdPath 失联 → 选中清空不回详情（回欢迎页）
    fireEvent.click(screen.getByTestId('btn-rename'))
    fireEvent.input(screen.getByTestId('input-name'), { target: { value: '改名图' } })
    fireEvent.click(screen.getByTestId('btn-confirm'))
    await waitFor(() => expect(screen.queryByTestId('file-detail')).not.toBeInTheDocument())
    expect(screen.getByTestId('desk-idle')).toBeInTheDocument()
    // 重新选中后删除 → 详情态同样清空回欢迎页
    fireEvent.click(await screen.findByTestId('file-node-改名图'))
    expect(await screen.findByTestId('file-detail')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('btn-delete'))
    fireEvent.click(screen.getByTestId('btn-delete-confirm'))
    await waitFor(() => expect(screen.queryByTestId('file-detail')).not.toBeInTheDocument())
    expect(screen.getByTestId('desk-idle')).toBeInTheDocument()
  })

  test('详情态就地操作：删除按钮在页首动作组可用，确认后删除并回欢迎页', async () => {
    render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
    fireEvent.click(await screen.findByTestId('file-node-想法A'))
    expect(await screen.findByTestId('file-detail')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('btn-delete'))
    expect(screen.getByText('删除「想法A」？')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('btn-delete-confirm'))
    await waitFor(() => expect(useAppStore.getState().maps).toHaveLength(1)) // 只剩 项目/甲
    // 选中失联 → 详情态清空，回落欢迎页
    await waitFor(() => expect(screen.queryByTestId('file-detail')).not.toBeInTheDocument())
    expect(screen.getByTestId('desk-idle')).toBeInTheDocument()
    expect(useAppStore.getState().maps.some((m) => m.name === '想法A')).toBe(false)
  })

  test('树文件行双击打开进纸面', async () => {
    render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
    fireEvent.dblClick(await screen.findByTestId('file-node-想法A'))
    await waitFor(() => expect(useAppStore.getState().route).toBe('editor'))
    expect(useAppStore.getState().currentMdPath).toBe('/ws/想法A.md')
  })

  // 2026-09 树右键菜单：文件行 = 打开/移动/重命名/删除（右键即选中——VSCode 惯例）
  test('右键文件行：即选中进详情态，菜单重命名走对话框流', async () => {
    render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
    fireEvent.contextMenu(await screen.findByTestId('file-node-想法A'), { button: 2 })
    // 右键即选中：主区切详情态（预览该文件）
    expect(await screen.findByTestId('file-detail')).toBeInTheDocument()
    const menu = await screen.findByTestId('ctx-menu-file-想法A')
    expect(within(menu).getByRole('menuitem', { name: '打开' })).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('ctx-btn-rename'))
    // 与详情页首同源对话框流：确认框内改名
    fireEvent.input(screen.getByTestId('input-name'), { target: { value: '改名图' } })
    fireEvent.click(screen.getByTestId('btn-confirm'))
    await waitFor(() => expect(useAppStore.getState().maps.some((m) => m.name === '改名图')).toBe(true))
    expect(await fs.exists('/ws/改名图.md')).toBe(true)
  })

  test('右键文件行：菜单删除走二次确认', async () => {
    render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
    fireEvent.contextMenu(await screen.findByTestId('file-node-想法A'), { button: 2 })
    fireEvent.click(await screen.findByTestId('ctx-btn-delete'))
    expect(screen.getByText('删除「想法A」？')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('btn-delete-confirm'))
    await waitFor(() => expect(useAppStore.getState().maps).toHaveLength(1)) // 只剩 项目/甲
    expect(fs.removeLog).toEqual(['/ws/想法A.md'])
  })

  test('右键目录行：在此新建导图落盘到该目录', async () => {
    render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
    fireEvent.contextMenu(await screen.findByTestId('dir-node-项目'), { button: 2 })
    fireEvent.click(await screen.findByTestId('ctx-btn-new-map'))
    // 对话框标题示目标目录
    expect(screen.getByText('在「项目」新建导图')).toBeInTheDocument()
    fireEvent.input(screen.getByTestId('input-name'), { target: { value: '项目新图' } })
    fireEvent.click(screen.getByTestId('btn-confirm'))
    await waitFor(() => expect(useAppStore.getState().route).toBe('editor'))
    expect(await fs.exists('/ws/项目/项目新图.md')).toBe(true)
  })

  test('右键目录行：新建子目录落在该目录下', async () => {
    render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
    fireEvent.contextMenu(await screen.findByTestId('dir-node-项目'), { button: 2 })
    fireEvent.click(await screen.findByTestId('ctx-btn-new-dir'))
    expect(screen.getByText('在「项目」新建目录')).toBeInTheDocument()
    fireEvent.input(screen.getByTestId('input-name'), { target: { value: '子层' } })
    fireEvent.click(screen.getByTestId('btn-confirm'))
    // 树重读后子层目录行出现（exists() 不查目录集合，落盘以 readDirTree 侧证）
    expect(await screen.findByTestId('dir-node-子层')).toBeInTheDocument()
  })

  test('右键树根：新建目录落工作区根', async () => {
    render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
    fireEvent.contextMenu(await screen.findByTestId('dir-node-all'), { button: 2 })
    fireEvent.click(await screen.findByTestId('ctx-btn-new-dir'))
    // 对话框标题（heading 角色，避开侧栏「新建目录」按钮同名文本）
    expect(screen.getByRole('heading', { name: '新建目录' })).toBeInTheDocument()
    // 树根菜单不提供删除（工作区本体走设置页「退出工作区」流）
    expect(screen.queryByTestId('ctx-btn-delete-dir')).not.toBeInTheDocument()
    fireEvent.input(screen.getByTestId('input-name'), { target: { value: '根下层' } })
    fireEvent.click(screen.getByTestId('btn-confirm'))
    expect(await screen.findByTestId('dir-node-根下层')).toBeInTheDocument()
  })

  // 2026-09 目录右键删除：整目录进回收站（含子树导图），选中目录在被删子树内则回根视图
  test('右键目录行：删除走二次确认（确认框报导图数），子树整删不动根层其他导图', async () => {
    render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
    fireEvent.contextMenu(await screen.findByTestId('dir-node-项目'), { button: 2 })
    fireEvent.click(await screen.findByTestId('ctx-btn-delete-dir'))
    expect(screen.getByText('删除目录「项目」？')).toBeInTheDocument()
    expect(screen.getByText('该目录下 1 张导图将随目录一并移入回收站。')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('btn-delete-confirm'))
    // 目录行与其中文件行俱失；根层想法A不受影响
    await waitFor(() => expect(screen.queryByTestId('dir-node-项目')).not.toBeInTheDocument())
    expect(screen.queryByTestId('file-node-甲')).not.toBeInTheDocument()
    expect(screen.getByTestId('file-node-想法A')).toBeInTheDocument()
    await waitFor(() => expect(useAppStore.getState().maps).toHaveLength(1))
    expect(fs.removeLog).toEqual(['/ws/项目'])
  })

  test('右键目录行：选中目录在被删子树内时，删除后回根视图（idle 置位）', async () => {
    render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
    fireEvent.click(await screen.findByTestId('dir-node-项目'))
    await waitFor(() => expect(useAppStore.getState().selectedDir).toBe('项目'))
    fireEvent.contextMenu(screen.getByTestId('dir-node-项目'), { button: 2 })
    fireEvent.click(await screen.findByTestId('ctx-btn-delete-dir'))
    fireEvent.click(screen.getByTestId('btn-delete-confirm'))
    // 选中目录已失联 → 回根视图 idle（树无激活行，主区欢迎页）
    await waitFor(() => expect(useAppStore.getState().selectedDir).toBe(''))
    expect(screen.getByTestId('desk-idle')).toBeInTheDocument()
  })

  test('右键目录行：目录含子目录但无导图时，确认框不说「为空」', async () => {
    await fs.mkdir('/ws/项目/空巢层/内层')
    render(<LibraryView pickDirectory={vi.fn()} pickImportFile={vi.fn()} writeClipboard={vi.fn(async () => {})} />)
    fireEvent.contextMenu(await screen.findByTestId('dir-node-空巢层'), { button: 2 })
    fireEvent.click(await screen.findByTestId('ctx-btn-delete-dir'))
    expect(screen.getByText('该目录下没有导图，但含子目录，将随目录一并移入回收站。')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('btn-delete-confirm'))
    await waitFor(() => expect(screen.queryByTestId('dir-node-空巢层')).not.toBeInTheDocument())
    // 父目录「项目」与其导图仍在
    expect(screen.getByTestId('dir-node-项目')).toBeInTheDocument()
    expect(screen.getByTestId('file-node-甲')).toBeInTheDocument()
  })
})
