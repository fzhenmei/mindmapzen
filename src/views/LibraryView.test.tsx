import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach } from 'vitest'
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
  useAppStore.setState({ route: 'library', maps: [], workspaceDir: null, currentMdPath: null, error: null })
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
  expect(screen.queryByTestId('map-item')).toBeInTheDocument()
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
  fireEvent.click(screen.getByTestId('import-cancel'))
  expect(await fs.exists('/ws/外部.md')).toBe(false) // 取消不入库
  fireEvent.click(screen.getByTestId('btn-import'))
  fireEvent.click(await screen.findByTestId('import-confirm'))
  await waitFor(() => expect(useAppStore.getState().route).toBe('editor'))
  expect(await fs.readTextFile('/ws/外部.md')).toContain('# 外部图')
})
