import { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import { tauriFsAdapter } from './services/fs/TauriFsAdapter'
import { writeClipboardViaTauri, type WriteClipboard } from './services/clipboard'
import LibraryView from './views/LibraryView'
import EditorView from './views/EditorView'
import { open } from '@tauri-apps/plugin-dialog'
import { openPath } from '@tauri-apps/plugin-opener'
import type { RegisterCloseGuard } from './types/ports'

// E2E（?e2e=1）以 web 模式运行：无 Tauri 环境，harness 已注入内存 FS 并预设 /ws 工作区
const E2E = new URLSearchParams(window.location.search).has('e2e')

const pickDirectory = async (): Promise<string | null> => {
  if (E2E) return null
  const dir = await open({ directory: true, multiple: false })
  return typeof dir === 'string' ? dir : null
}

/** 生产导入文件选择：Tauri 对话框单选 .md + adapter 读取。
 *  E2E web 模式无 Tauri 对话框：读取 harness 预置桩（固定内置样例）。 */
const pickMdFile = async (): Promise<{ name: string; text: string } | null> => {
  if (E2E) {
    return (
      (
        window as unknown as {
          __zenE2e?: { pickMdFile(): Promise<{ name: string; text: string } | null> }
        }
      ).__zenE2e?.pickMdFile() ?? null
    )
  }
  const picked = await open({
    multiple: false,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  if (typeof picked !== 'string') return null
  const name = picked.split(/[\\/]/).pop()!.replace(/\.md$/, '')
  const text = await useAppStore.getState().adapter.readTextFile(picked)
  return { name, text }
}

/** 生产关闭守卫：Tauri onCloseRequested → handler。动态 import 不阻塞渲染；
 *  异步竞态处理：注册完成前被清理（done 已置）则放弃/立即撤销，清理函数幂等（done 标记）。
 *  非 Tauri 环境（e2e web 模式）getCurrentWindow 抛错 → 静默不注册（无关闭事件源）。 */
const registerCloseGuard: RegisterCloseGuard = (handler) => {
  let unref: (() => void) | null = null
  let done = false
  void (async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      if (done) return // 清理先到：放弃挂载
      // 端口事件名为 preventClose（Tauri 原生为 preventDefault，此处适配）
      unref = await getCurrentWindow().onCloseRequested((e) =>
        handler({ preventClose: () => e.preventDefault() }),
      )
      if (done) unref() // 挂载完成前已被清理：立即撤销
    } catch {
      // 非 Tauri 环境：无窗口关闭事件源
    }
  })()
  return () => {
    if (done) return
    done = true
    unref?.()
  }
}

/** 生产退出端口：强制销毁窗口（守卫已 preventClose，close() 会被再次拦截）。
 *  失败必须浮出：destroy 权限缺失/运行时异常若被静默吞掉，守卫会留下"已放弃但窗口还在"的僵尸态 */
const exitApp = (): void => {
  void (async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().destroy()
    } catch (e) {
      useAppStore.getState().setError('退出失败：' + String(e))
    }
  })()
}

/** 剪贴板端口：E2E web 模式无 Tauri 剪贴板 → 记录到 harness 桩（__zenE2e.lastCopied），生产走 Tauri */
const writeClipboard: WriteClipboard = E2E
  ? async (text) => {
      ;(
        (window as unknown as Record<string, unknown>).__zenE2e as { lastCopied: string | null }
      ).lastCopied = text
    }
  : writeClipboardViaTauri

export default function App() {
  const { route, currentMdPath, setAdapter, init } = useAppStore()
  useEffect(() => {
    void (async () => {
      try {
        // E2E 模式：跳过 Tauri 适配器/路径注入（harness 已完成），直接初始化
        if (E2E) {
          await init()
          return
        }
        setAdapter(tauriFsAdapter)
        // 动态 import：jsdom 测试环境不触达 Tauri 路径 API
        const { appDataDir, join } = await import('@tauri-apps/api/path')
        useAppStore.setState({ configPath: await join(await appDataDir(), 'config.json') })
        await init()
      } catch (e) {
        useAppStore.getState().setError('初始化失败：' + String(e))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅启动时执行
  }, [])

  if (route === 'editor' && currentMdPath) {
    // key：切换文档时强制重挂载 EditorView（组件内部按“仅加载一次”实现，见 EditorView.tsx 注释）
    return (
      <EditorView
        key={currentMdPath}
        mdPath={currentMdPath}
        openInEditor={(p) => void openPath(p)}
        writeClipboard={writeClipboard}
        registerCloseGuard={registerCloseGuard}
        exitApp={exitApp}
      />
    )
  }
  return <LibraryView pickDirectory={pickDirectory} pickMdFile={pickMdFile} />
}
