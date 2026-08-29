import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe } from 'vitest'
import PreviewPane from './PreviewPane'
import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'

let fs: MemoryFsAdapter

beforeEach(() => {
  fs = new MemoryFsAdapter()
  useAppStore.getState().setAdapter(fs)
  useAppStore.setState({ configPath: '/cfg.json', route: 'library', currentMdPath: null, error: null })
})

describe('大纲预览区（M5d）', () => {
  test('未选择：显示「选择导图预览」，无大纲与打开按钮', () => {
    render(<PreviewPane mdPath={null} />)
    expect(screen.getByTestId('preview-pane')).toHaveTextContent('选择导图预览')
    expect(screen.queryByTestId('preview-outline')).not.toBeInTheDocument()
    expect(screen.queryByTestId('btn-preview-open')).not.toBeInTheDocument()
  })

  test('大纲渲染：层级缩进 14px、备注行尾 ✎ 角标', async () => {
    await fs.writeTextFileAtomic('/ws/图A.md', '# 图A\n\n## 分支一\n\n### 叶子\n> 备注内容\n\n## 分支二\n')
    render(<PreviewPane mdPath="/ws/图A.md" />)
    const outline = await screen.findByTestId('preview-outline')
    expect(outline).toHaveTextContent('图A')
    expect(outline).toHaveTextContent('分支一')
    expect(outline).toHaveTextContent('叶子')
    expect(outline).toHaveTextContent('分支二')
    // 层级缩进：根 0 / 一级 14px / 二级 28px
    expect(screen.getByText('图A').closest('.preview-row')).toHaveStyle({ paddingLeft: '0px' })
    expect(screen.getByText('分支一').closest('.preview-row')).toHaveStyle({ paddingLeft: '14px' })
    expect(screen.getByText('叶子').closest('.preview-row')).toHaveStyle({ paddingLeft: '28px' })
    // 有备注 → 行尾 ✎；无备注行无角标
    expect(screen.getByText('叶子').closest('.preview-row')).toHaveTextContent('✎')
    expect(screen.getByText('分支二').closest('.preview-row')).not.toHaveTextContent('✎')
  })

  test('节点文本连线标记按净化规则隐藏', async () => {
    await fs.writeTextFileAtomic('/ws/链.md', '# 链\n\n## 见 [[B]] 和 [[C]]\n')
    render(<PreviewPane mdPath="/ws/链.md" />)
    const outline = await screen.findByTestId('preview-outline')
    expect(outline).toHaveTextContent('见 和')
    expect(outline).not.toHaveTextContent('[[B]]')
    expect(outline).not.toHaveTextContent('[[C]]')
  })

  test('解析失败：「无法预览」且打开按钮仍可用', async () => {
    await fs.writeTextFileAtomic('/ws/坏.md', '没有一级标题\n')
    render(<PreviewPane mdPath="/ws/坏.md" />)
    expect(await screen.findByText('无法预览')).toBeInTheDocument()
    expect(screen.getByTestId('btn-preview-open')).toBeEnabled()
  })

  test('读取失败（文件缺失）同样显示无法预览', async () => {
    render(<PreviewPane mdPath="/ws/不存在.md" />)
    expect(await screen.findByText('无法预览')).toBeInTheDocument()
  })

  test('打开按钮进纸面（openMap）', async () => {
    await fs.writeTextFileAtomic('/ws/图A.md', '# 图A\n')
    render(<PreviewPane mdPath="/ws/图A.md" />)
    fireEvent.click(await screen.findByTestId('btn-preview-open'))
    await waitFor(() => expect(useAppStore.getState().route).toBe('editor'))
    expect(useAppStore.getState().currentMdPath).toBe('/ws/图A.md')
  })
})
