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

test('无工作区时显示引导并可选择', async () => {
  render(<LibraryView pickDirectory={pickDirectory} pickMdFile={pickMdFile} />)
  expect(screen.getByText(/选择导图工作区/)).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('btn-workspace'))
  await waitFor(() => expect(useAppStore.getState().workspaceDir).toBe('/ws'))
  expect(await screen.findByTestId('map-item')).toBeInTheDocument()
})

test('空态引导文案', async () => {
  await useAppStore.getState().setWorkspace('/ws-empty')
  render(<LibraryView pickDirectory={vi.fn()} pickMdFile={pickMdFile} />)
  expect(await screen.findByTestId('library-empty')).toHaveTextContent('空白的纸')
})

test('已有工作区时列出导图并可打开', async () => {
  await useAppStore.getState().setWorkspace('/ws')
  render(<LibraryView pickDirectory={pickDirectory} pickMdFile={pickMdFile} />)
  fireEvent.click((await screen.findAllByTestId('map-item'))[0]!)
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
    expect(screen.getAllByTestId('map-item')).toHaveLength(2)
    // 「全部」视图卡片显示所在层小字（mtime 降序：根图在前）
    expect(screen.getAllByTestId('map-reldir').map((el) => el.textContent)).toEqual(['根', '项目'])
  })

  test('移动导图：对话框选目录后两文件进新目录', async () => {
    const dirFs = new MemoryFsAdapter()
    await dirFs.writeTextFileAtomic('/ws/根图.md', '# 根\n')
    await dirFs.writeTextFileAtomic('/ws/根图.zen.json', '{}')
    await dirFs.mkdir('/ws/灵')
    useAppStore.getState().setAdapter(dirFs)
    await useAppStore.getState().setWorkspace('/ws')
    render(<LibraryView pickDirectory={vi.fn()} pickMdFile={vi.fn()} />)
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
    expect(await screen.findByTestId('dir-empty-state')).toHaveTextContent('这一层还没有导图')
  })
})
