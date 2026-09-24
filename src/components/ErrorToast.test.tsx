import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import ErrorToast from './ErrorToast'
import { useAppStore } from '../store/appStore'

// error 单一事实源在 store；ErrorToast 只订阅渲染（不自理状态），关闭/定位都回落 store 动作。
// 外部 store 更新（act 外 set）在 concurrent 渲染下 defer——驱动须 act 包裹（同 ToastHost.test）
beforeEach(() => {
  useAppStore.setState({ error: null, errorLocate: null, locatePulse: 0, route: 'library' })
})

describe('ErrorToast（全局错误浮层，2026-09-24 修正闭环）', () => {
  test('error 为空不渲染；非空渲染错误文本（可关闭浮层替代案头流内横幅）', () => {
    const { unmount } = render(<ErrorToast />)
    expect(screen.queryByTestId('error-toast')).not.toBeInTheDocument()
    act(() => {
      useAppStore.getState().setError('导入失败：坏文件')
    })
    expect(screen.getByTestId('error-toast')).toHaveTextContent('导入失败：坏文件')
    unmount()
  })

  test('关闭钮清 error（含定位信息一并随清）', () => {
    render(<ErrorToast />)
    act(() => {
      useAppStore.getState().setError('保存失败：节点文本包含换行', 'u1')
    })
    fireEvent.click(screen.getByTestId('error-close'))
    expect(useAppStore.getState().error).toBeNull()
    expect(useAppStore.getState().errorLocate).toBeNull()
    expect(screen.queryByTestId('error-toast')).not.toBeInTheDocument()
  })

  test('编辑器内带 uid 错误：定位钮 + 修正指引；点击递增 locatePulse 触发定位', () => {
    useAppStore.setState({ route: 'editor' })
    render(<ErrorToast />)
    act(() => {
      useAppStore.getState().setError('保存失败：节点文本包含换行', 'u1')
    })
    expect(screen.getByTestId('error-locate')).toBeInTheDocument()
    expect(screen.getByTestId('error-toast')).toHaveTextContent('自动保存会重试')
    fireEvent.click(screen.getByTestId('error-locate'))
    expect(useAppStore.getState().locatePulse).toBe(1)
    fireEvent.click(screen.getByTestId('error-locate'))
    expect(useAppStore.getState().locatePulse).toBe(2)
  })

  test('案头（非编辑器）不显示定位钮——编辑器已卸载无人消费；无 uid 错误同样只文不钮', () => {
    render(<ErrorToast />)
    act(() => {
      useAppStore.getState().setError('保存失败：节点文本包含换行', 'u1') // route=library
    })
    expect(screen.queryByTestId('error-locate')).not.toBeInTheDocument()
    act(() => {
      useAppStore.setState({ route: 'editor', errorLocate: null })
      useAppStore.getState().setError('导入失败：坏文件') // 无 uid
    })
    expect(screen.queryByTestId('error-locate')).not.toBeInTheDocument()
  })

  test('errorLocate 清空后定位钮退场（渲染随 store 响应）', () => {
    useAppStore.setState({ route: 'editor' })
    render(<ErrorToast />)
    act(() => {
      useAppStore.getState().setError('保存失败：节点文本包含换行', 'u1')
    })
    expect(screen.getByTestId('error-locate')).toBeInTheDocument()
    act(() => {
      useAppStore.setState({ errorLocate: null })
    })
    expect(screen.queryByTestId('error-locate')).not.toBeInTheDocument()
  })
})
