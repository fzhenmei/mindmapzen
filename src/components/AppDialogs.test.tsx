import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AppDialogs from './AppDialogs'
import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'

// App 级对话框宿主(2026-09 导航系统 spec §6):设置三空间可达——按 store.appDialog
// 渲染;工作区动作经 requestWorkspaceAction(编辑器路由安全网在 EditorView,此处测直通路径)
describe('AppDialogs', () => {
  beforeEach(async () => {
    const fs = new MemoryFsAdapter()
    await fs.writeTextFileAtomic('/ws/已有.md', '# 旧图\n')
    useAppStore.getState().setAdapter(fs)
    useAppStore.setState({
      configPath: '/cfg.json',
      workspaceDir: null,
      maps: [],
      route: 'library',
      appDialog: null,
      pendingWorkspaceAction: null,
    })
    useAppStore.getState().setPickDirPort(null)
  })
  afterEach(() => cleanup())

  test('appDialog 为 null 时不渲染任何框', () => {
    render(<AppDialogs />)
    expect(screen.queryByTestId('settings-dialog')).not.toBeInTheDocument()
  })

  test('appDialog=settings 渲染设置框;退出工作区直通执行并关框', async () => {
    useAppStore.setState({ workspaceDir: '/ws' })
    useAppStore.getState().openAppDialog('settings')
    render(<AppDialogs />)
    expect(screen.getByTestId('settings-dialog')).toBeInTheDocument()
    // route=library 非编辑器路由（终审修复后编辑器不分脏净都记 pending）:requestWorkspaceAction 直接执行 exitWorkspace
    fireEvent.click(screen.getByTestId('settings-workspace-exit'))
    await waitFor(() => expect(useAppStore.getState().workspaceDir).toBeNull())
    expect(useAppStore.getState().appDialog).toBeNull()
  })
})
