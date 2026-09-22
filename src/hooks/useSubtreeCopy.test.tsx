// src/hooks/useSubtreeCopy.test.tsx —— 子树复制 hook 直测:外发 md 走显示形态
// (2026-09-22 防炸配套):贴给外部编辑器/AI 的正文结构行不加 > 包装层,干净可渲染。
// 引擎桩只喂 getData 全量树;剪贴板捕获出参断言(与 doCopy 无选中回退整图口径一致)。
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useSubtreeCopy } from './useSubtreeCopy'
import { useAppStore } from '../store/appStore'
import type { LinkRegistry } from '../editor/linkRegistry'
import type { MindMapHandle } from '../types/engine'

const registry = { byUid: new Map() } as unknown as LinkRegistry

const FULL = {
  data: { text: '根', uid: 'r', body: '段落。\n\n## 贴来的标题' },
  children: [],
}

describe('useSubtreeCopy', () => {
  beforeEach(() => {
    useAppStore.setState({
      workspaceDir: null,
      settings: {
        ...useAppStore.getState().settings,
        copyIncludeBody: true,
        copyIncludeIconStatus: true,
      },
    })
  })

  test('doCopy 外发显示形态:含结构行的正文不加 > 包装(贴来的标题原样可渲染)', () => {
    const written: string[] = []
    const setError = vi.fn()
    const { result } = renderHook(() =>
      useSubtreeCopy({
        mmRef: { current: { getData: () => FULL } as unknown as MindMapHandle },
        writeClipboard: async (md: string) => {
          written.push(md)
        },
        registry,
        selection: { activeUidsRef: { current: [] }, clearStaleIfMissing: vi.fn() } as never,
        flashCopy: vi.fn(),
        setError,
      }),
    )
    act(() => {
      result.current.doCopy()
    })
    expect(setError).not.toHaveBeenCalled()
    expect(written[0]).toContain('## 贴来的标题')
    expect(written[0]).not.toContain('> ##')
  })
})
