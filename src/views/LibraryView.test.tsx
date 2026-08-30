import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { beforeEach, describe } from 'vitest'
import LibraryView from './LibraryView'
import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'

let fs: MemoryFsAdapter
const pickDirectory = vi.fn(async () => '/ws')
// pickMdFile 桩：默认未选择任何文件（导入相关用例内各自注入实现）
const pickMdFile = vi.fn(async () => null)

beforeEach(async () => {
  fs = new MemoryFsAdapter()
  await fs.writeTextFileAtomic('/ws/想法A.md', '# A\n')
  useAppStore.getState().setAdapter(fs)
  useAppStore.setState({ route: 'library', maps: [], workspaceDir: null, currentMdPath: null, error: null, selectedDir: '' })
  pickMdFile.mockClear()
})

// 无工作区 → 开屏页（M5d Task 3）：替代旧 hint；页首栏随之隐藏（spec §2）
test('无工作区时渲染开屏页，创建工作区后进入案头', async () => {
  render(<LibraryView pickDirectory={pickDirectory} pickMdFile={pickMdFile} />)
  expect(screen.getByTestId('welcome-screen')).toBeInTheDocument()
  expect(screen.getByTestId('btn-welcome-create')).toBeInTheDocument()
  expect(screen.getByTestId('btn-welcome-pick')).toBeInTheDocument()
  // 页首栏隐藏：设置/主题入口不渲染
  expect(screen.queryByTestId('btn-settings')).not.toBeInTheDocument()
  expect(screen.queryByTestId('btn-theme')).not.toBeInTheDocument()
  fireEvent.click(screen.getByTestId('btn-welcome-create'))
  await waitFor(() => expect(useAppStore.getState().workspaceDir).toBe('/ws'))
  // M15：有工作区后进案头 idle 空态（未选任何），开屏页不再渲染
  expect(await screen.findByTestId('desk-idle')).toBeInTheDocument()
  expect(screen.queryByTestId('welcome-screen')).not.toBeInTheDocument()
})

test('开屏次入口「选择已有文件夹」同走工作区选择流', async () => {
  render(<LibraryView pickDirectory={pickDirectory} pickMdFile={pickMdFile} />)
  fireEvent.click(screen.getByTestId('btn-welcome-pick'))
  await waitFor(() => expect(useAppStore.getState().workspaceDir).toBe('/ws'))
  expect(await screen.findByTestId('desk-idle')).toBeInTheDocument()
})

// M5d 缓期项清偿：设置页「更换工作区」——pickDirectory 选新文件夹后案头切换、对话框关闭
test('设置更换工作区：经 pickDirectory 切换案头并关闭对话框', async () => {
  await fs.writeTextFileAtomic('/ws2/新家.md', '# 新家\n')
  await useAppStore.getState().setWorkspace('/ws')
  const pick = vi.fn(async () => '/ws2')
  render(<LibraryView pickDirectory={pick} pickMdFile={pickMdFile} />)
  fireEvent.click(screen.getByTestId('btn-settings'))
  expect(screen.getByTestId('settings-dialog')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('settings-workspace-change'))
  expect(screen.queryByTestId('settings-dialog')).not.toBeInTheDocument()
  await waitFor(() => expect(useAppStore.getState().workspaceDir).toBe('/ws2'))
  expect(pick).toHaveBeenCalledTimes(1)
  // M15：切换工作区回 idle 空态；点树根进根层资源管理器可见新图 tile
  expect(await screen.findByTestId('desk-idle')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('dir-node-all'))
  const card = (await screen.findAllByTestId('map-item')).find((el) => el.textContent!.includes('新家'))
  expect(card).toBeTruthy()
})

// v0.7.0 验收：设置页「退出工作区（回到开屏）」——清 workspaceDir 回开屏页并持久化 null
test('设置退出工作区：回到开屏页，配置落 workspaceDir:null（其他字段保留）', async () => {
  useAppStore.setState({ configPath: '/cfg.json' })
  await useAppStore.getState().setWorkspace('/ws')
  await useAppStore.getState().setPreferredLayout('logic') // 预置另一字段：合并保存不得覆盖
  render(<LibraryView pickDirectory={vi.fn()} pickMdFile={pickMdFile} />)
  fireEvent.click(screen.getByTestId('btn-settings'))
  fireEvent.click(screen.getByTestId('settings-workspace-exit'))
  await waitFor(() => expect(useAppStore.getState().workspaceDir).toBeNull())
  // 开屏页重新渲染，页首工具栏随无工作区态隐藏
  expect(await screen.findByTestId('welcome-screen')).toBeInTheDocument()
  expect(screen.queryByTestId('btn-settings')).not.toBeInTheDocument()
  expect(screen.queryByTestId('map-item')).not.toBeInTheDocument()
  const cfg = JSON.parse(await fs.readTextFile('/cfg.json'))
  expect(cfg.workspaceDir).toBeNull()
  expect(cfg.lastOpened).toBeNull()
  expect(cfg.preferredLayout).toBe('logic') // load-merge-save 保留其他字段
})

test('空态引导文案', async () => {
  await useAppStore.getState().setWorkspace('/ws-empty')
  render(<LibraryView pickDirectory={vi.fn()} pickMdFile={pickMdFile} />)
  expect(await screen.findByTestId('library-empty')).toHaveTextContent('空白的纸')
})

test('已有工作区时列出导图，双击打开进纸面', async () => {
  await useAppStore.getState().setWorkspace('/ws')
  render(<LibraryView pickDirectory={pickDirectory} pickMdFile={pickMdFile} />)
  // M15：idle 空态先点树根进资源管理器，双击 tile 进纸面
  fireEvent.click(await screen.findByTestId('dir-node-all'))
  fireEvent.dblClick((await screen.findAllByTestId('map-item'))[0]!)
  await waitFor(() => expect(useAppStore.getState().route).toBe('editor'))
})

test('新建流程：输入名称后创建并进入编辑器', async () => {
  await useAppStore.getState().setWorkspace('/ws')
  render(<LibraryView pickDirectory={pickDirectory} pickMdFile={pickMdFile} />)
  fireEvent.click(screen.getByTestId('btn-new'))
  fireEvent.input(screen.getByTestId('input-name'), { target: { value: '想法B' } })
  fireEvent.click(screen.getByTestId('btn-confirm'))
  await waitFor(() => expect(useAppStore.getState().route).toBe('editor'))
  expect(await fs.exists('/ws/想法B.md')).toBe(true)
})

test('删除需二次确认', async () => {
  await useAppStore.getState().setWorkspace('/ws')
  render(<LibraryView pickDirectory={pickDirectory} pickMdFile={pickMdFile} />)
  fireEvent.click(await screen.findByTestId('dir-node-all'))
  fireEvent.click(screen.getByTestId('btn-delete'))
  expect(screen.getByTestId('map-item')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('btn-delete-confirm'))
  await waitFor(() => expect(useAppStore.getState().maps).toHaveLength(0))
  expect(fs.removeLog).toEqual(['/ws/想法A.md'])
})

test('多导图时删除按钮作用于所在行（第二行），而非首行', async () => {
  // 想法B 后写入，listMaps 按 mtime 降序（同毫秒并列按 readDir 顺序）→ B 在第一行、A 在第二行
  await fs.writeTextFileAtomic('/ws/想法B.md', '# B\n')
  await useAppStore.getState().setWorkspace('/ws')
  render(<LibraryView pickDirectory={pickDirectory} pickMdFile={pickMdFile} />)
  fireEvent.click(await screen.findByTestId('dir-node-all'))
  const rows = await screen.findAllByTestId('map-item')
  expect(rows).toHaveLength(2)
  expect(rows[0]).toHaveTextContent('想法B')
  expect(rows[1]).toHaveTextContent('想法A')
  // 第二行（想法A）的删除按钮：确认框必须显示该行导图名
  fireEvent.click(screen.getAllByTestId('btn-delete')[1]!)
  expect(screen.getByText('删除「想法A」？')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('btn-delete-confirm'))
  await waitFor(() => expect(useAppStore.getState().maps).toHaveLength(1))
  // 只删了第二行自己的导图想法A，首行想法B 未被误删
  expect(fs.removeLog).toEqual(['/ws/想法A.md'])
  expect(await fs.exists('/ws/想法B.md')).toBe(true)
})

test('导入：有忽略块先预览，确认后入库并打开', async () => {
  await useAppStore.getState().setWorkspace('/ws')
  const pickImport = vi.fn(async () => ({ name: '外部', text: '# 外部图\n\n一段会被忽略的说明。\n\n## A\n' }))
  render(<LibraryView pickDirectory={vi.fn()} pickMdFile={pickImport} />)
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
  test('目录树渲染与过滤', async () => {
    const dirFs = new MemoryFsAdapter()
    await dirFs.mkdir('/ws/项目')
    await dirFs.writeTextFileAtomic('/ws/项目/甲.md', '# 甲\n')
    await dirFs.writeTextFileAtomic('/ws/根图.md', '# 根\n')
    useAppStore.getState().setAdapter(dirFs)
    await useAppStore.getState().setWorkspace('/ws')
    render(<LibraryView pickDirectory={vi.fn()} pickMdFile={vi.fn()} />)
    expect(await screen.findByTestId('dir-node-项目')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('dir-node-项目'))
    await waitFor(() => expect(useAppStore.getState().selectedDir).toBe('项目'))
    // 只剩项目目录的图
    expect(screen.getByTestId('map-item')).toHaveTextContent('甲')
    fireEvent.click(screen.getByTestId('dir-node-all'))
    await waitFor(() => expect(useAppStore.getState().selectedDir).toBe(''))
    // M15 根层资源管理器：根层导图一张 + 子目录「项目」文件夹 tile
    expect(screen.getAllByTestId('map-item')).toHaveLength(1)
    expect(screen.getByTestId('map-item')).toHaveTextContent('根图')
    expect(screen.getByTestId('folder-tile-项目')).toBeInTheDocument()
  })

  test('移动导图：对话框选目录后两文件进新目录', async () => {
    const dirFs = new MemoryFsAdapter()
    await dirFs.writeTextFileAtomic('/ws/根图.md', '# 根\n')
    await dirFs.writeTextFileAtomic('/ws/根图.zen.json', '{}')
    await dirFs.mkdir('/ws/灵')
    useAppStore.getState().setAdapter(dirFs)
    await useAppStore.getState().setWorkspace('/ws')
    render(<LibraryView pickDirectory={vi.fn()} pickMdFile={vi.fn()} />)
    // M15：idle 空态先点树根进资源管理器（tile 悬停钮才在渲染树中）
    fireEvent.click(await screen.findByTestId('dir-node-all'))
    fireEvent.click((await screen.findAllByTestId('btn-move'))[0]!)
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
    render(<LibraryView pickDirectory={vi.fn()} pickMdFile={vi.fn()} />)
    // M15：idle 空态先点树根进资源管理器（tile 悬停钮才在渲染树中）
    fireEvent.click(await screen.findByTestId('dir-node-all'))
    fireEvent.click((await screen.findAllByTestId('btn-move'))[0]!)
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
    render(<LibraryView pickDirectory={vi.fn()} pickMdFile={vi.fn()} />)
    // M15：idle 空态先点树根进资源管理器（tile 悬停钮才在渲染树中）
    fireEvent.click(await screen.findByTestId('dir-node-all'))
    fireEvent.click((await screen.findAllByTestId('btn-move'))[0]!)
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
    render(<LibraryView pickDirectory={vi.fn()} pickMdFile={vi.fn()} />)
    fireEvent.click(screen.getByTestId('dir-create'))
    fireEvent.input(screen.getByTestId('input-name'), { target: { value: '新层' } })
    fireEvent.click(screen.getByTestId('btn-confirm'))
    expect(await screen.findByTestId('dir-node-新层')).toBeInTheDocument()
  })

  test('空目录过滤后显示空态文案', async () => {
    const dirFs = new MemoryFsAdapter()
    await dirFs.writeTextFileAtomic('/ws/根图.md', '# 根\n')
    await dirFs.mkdir('/ws/空层')
    useAppStore.getState().setAdapter(dirFs)
    await useAppStore.getState().setWorkspace('/ws')
    render(<LibraryView pickDirectory={vi.fn()} pickMdFile={vi.fn()} />)
    fireEvent.click(await screen.findByTestId('dir-node-空层'))
    await waitFor(() => expect(useAppStore.getState().selectedDir).toBe('空层'))
    expect(await screen.findByTestId('dir-empty-state')).toHaveTextContent('这一层还是空的')
  })

  // 设置入口（M5b Task 4）：页首 btn-settings 打开设置对话框，开关切换写入 store
  test('页首设置按钮打开设置对话框并可切换复制开关', async () => {
    const dirFs = new MemoryFsAdapter()
    useAppStore.getState().setAdapter(dirFs)
    useAppStore.setState({ configPath: '/cfg.json' })
    await useAppStore.getState().setWorkspace('/ws')
    render(<LibraryView pickDirectory={vi.fn()} pickMdFile={vi.fn()} />)
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
    render(<LibraryView pickDirectory={vi.fn()} pickMdFile={vi.fn()} />)
    // M12b 案头三区：左面包屑为工作区名（品牌名归开屏页）
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ws')
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

  test('tile 单击 = 选中进详情态（摘要 + md 预览），不进纸面', async () => {
    render(<LibraryView pickDirectory={vi.fn()} pickMdFile={vi.fn()} />)
    fireEvent.click(await screen.findByTestId('dir-node-all'))
    const tile = (await screen.findAllByTestId('map-item')).find((el) => el.textContent!.includes('想法A'))!
    expect(screen.queryByTestId('file-detail')).not.toBeInTheDocument()
    fireEvent.click(tile)
    // M15：主区切文件详情态——摘要条 + 真实 markdown 预览（H1 渲染想法A）
    expect(await screen.findByTestId('file-detail')).toBeInTheDocument()
    expect(await screen.findByTestId('md-preview')).toHaveTextContent('想法A')
    expect(screen.getByTestId('detail-size')).toHaveTextContent(/B$/)
    // 单击只选中不进纸面
    expect(useAppStore.getState().route).toBe('library')
  })

  test('树文件行渲染：目录与根下文件行可见，单击选中进详情；目录行带文件夹图标', async () => {
    render(<LibraryView pickDirectory={vi.fn()} pickMdFile={vi.fn()} />)
    expect(await screen.findByTestId('file-node-甲')).toBeInTheDocument()
    expect(screen.getByTestId('file-node-想法A')).toBeInTheDocument()
    // 目录节点图标化（spec §3）：IconFolder 存在于目录行
    expect(screen.getByTestId('dir-node-项目').querySelector('svg')).toBeInTheDocument()
    // 文件行图标（IconFile）
    expect(screen.getByTestId('file-node-甲').querySelector('svg')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('file-node-甲'))
    // 选中态走官方 isActive（data-active=true）；主区切详情态（md 预览渲染甲）
    expect(screen.getByTestId('file-node-甲')).toHaveAttribute('data-active', 'true')
    expect(await screen.findByTestId('file-detail')).toBeInTheDocument()
    expect(screen.getByTestId('md-preview')).toHaveTextContent('甲')
  })

  test('选中态失效清理：重命名/删除选中图后详情态清空回资源管理器', async () => {
    render(<LibraryView pickDirectory={vi.fn()} pickMdFile={vi.fn()} />)
    fireEvent.click(await screen.findByTestId('dir-node-all'))
    // tile 引用会随重渲染失效：按文本名现查现用
    const tileOf = (name: string) =>
      screen.getAllByTestId('map-item').find((el) => el.textContent!.includes(name))!
    // 选中 想法A（根层 tile）进详情态
    fireEvent.click(tileOf('想法A'))
    expect(await screen.findByTestId('file-detail')).toBeInTheDocument()
    // 详情态「返回目录」回资源管理器后重命名 → mdPath 失联 → 选中清空不回详情
    fireEvent.click(screen.getByTestId('btn-detail-back'))
    fireEvent.click(tileOf('想法A').parentElement!.querySelector('[data-testid="btn-rename"]')!)
    fireEvent.input(screen.getByTestId('input-name'), { target: { value: '改名图' } })
    fireEvent.click(screen.getByTestId('btn-confirm'))
    await waitFor(() => expect(screen.queryByTestId('file-detail')).not.toBeInTheDocument())
    // 重新选中后删除 → 详情态同样清空
    fireEvent.click(tileOf('改名图'))
    expect(await screen.findByTestId('file-detail')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('btn-detail-back'))
    fireEvent.click(tileOf('改名图').parentElement!.querySelector('[data-testid="btn-delete"]')!)
    fireEvent.click(screen.getByTestId('btn-delete-confirm'))
    await waitFor(() => expect(screen.queryByTestId('file-detail')).not.toBeInTheDocument())
  })

  test('树文件行双击打开进纸面', async () => {
    render(<LibraryView pickDirectory={vi.fn()} pickMdFile={vi.fn()} />)
    fireEvent.dblClick(await screen.findByTestId('file-node-想法A'))
    await waitFor(() => expect(useAppStore.getState().route).toBe('editor'))
    expect(useAppStore.getState().currentMdPath).toBe('/ws/想法A.md')
  })
})
