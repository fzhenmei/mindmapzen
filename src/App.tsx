import { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import { tauriFsAdapter } from './services/fs/TauriFsAdapter'
import { migrateOldConfig } from './services/migration'
import { writeClipboardViaTauri, type WriteClipboard } from './services/clipboard'
import { pasteImageName, rgbaToPngBytes } from './services/pasteImage'
import LibraryView, { type PickedImport } from './views/LibraryView'
import EditorView from './views/EditorView'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import type { ExportPorts, GitRun, RegisterCloseGuard } from './types/ports'
import { openPath } from '@tauri-apps/plugin-opener'
import { applyDocumentTheme, resolveTheme, watchSystemTheme } from './services/theme'
import AppLogo from './components/AppLogo'

// E2E（?e2e=1）以 web 模式运行：无 Tauri 环境，harness 已注入内存 FS 并预设 /ws 工作区
const E2E = new URLSearchParams(window.location.search).has('e2e')

/** 生产工作区目录选择：Tauri 目录对话框。
 *  E2E web 模式无 Tauri 对话框：读取 harness 预置桩（固定返回 /ws，开屏/更换工作区流程用）。 */
const pickDirectory = async (): Promise<string | null> => {
  if (E2E) {
    return (
      (
        window as unknown as {
          __zenE2e?: { pickDirectory(): Promise<string | null> }
        }
      ).__zenE2e?.pickDirectory() ?? null
    )
  }
  const dir = await open({ directory: true, multiple: false })
  return typeof dir === 'string' ? dir : null
}

/** 生产导入文件选择（M21：md / xmind 双流）：Tauri 对话框单选 + 按扩展分流读取
 *  （md 文本 / xmind 字节）。E2E web 模式无 Tauri 对话框：读 harness 桩
 *  （缺省 md 内置样例；xmind 用例可覆写 __zenE2e.pickImportStub）。 */
const pickImportFile = async (): Promise<PickedImport | null> => {
  if (E2E) {
    const z = (window as unknown as {
      __zenE2e?: { pickImportFile(): Promise<PickedImport | null> }
    }).__zenE2e
    return z?.pickImportFile() ?? null
  }
  const picked = await open({
    multiple: false,
    filters: [{ name: '导图文件', extensions: ['md', 'xmind'] }],
  })
  if (typeof picked !== 'string') return null
  const fileName = picked.split(/[\\/]/).pop()!
  if (fileName.toLowerCase().endsWith('.xmind')) {
    const bytes = await readFile(picked)
    return { name: fileName.replace(/\.xmind$/i, ''), kind: 'xmind', bytes }
  }
  const text = await useAppStore.getState().adapter.readTextFile(picked)
  return { name: fileName.replace(/\.md$/i, ''), kind: 'md', text }
}

/** 生产选图（M19 插图）：Tauri 对话框单选图片 + plugin-fs readFile 读字节。
 *  E2E web 模式读 harness 桩（固定 1×1 PNG 字节）。 */
const pickImageFile = async (): Promise<{ name: string; bytes: Uint8Array } | null> => {
  if (E2E) {
    return (
      (window as unknown as { __zenE2e?: { pickImageFile(): Promise<{ name: string; bytes: Uint8Array } | null> } })
        .__zenE2e?.pickImageFile() ?? null
    )
  }
  const picked = await open({
    multiple: false,
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
  })
  if (typeof picked !== 'string') return null
  const name = picked.split(/[\\/]/).pop()!
  const bytes = await readFile(picked)
  return { name, bytes }
}

/** 生产读剪贴板图（粘贴截图「粘贴」按钮路径）：Tauri 插件 readImage 取 RGBA 裸像素
 *  （微信/QQ 截图的位图数据原生可读）→ Canvas 编码 PNG 字节。剪贴板无图/读取失败
 *  统一返回 null（hook 提示「剪贴板中没有图片」）。E2E web 模式读 harness 桩。 */
const readClipboardImage = async (): Promise<{ name: string; bytes: Uint8Array } | null> => {
  if (E2E) {
    return (
      (window as unknown as { __zenE2e?: { readClipboardImage(): Promise<{ name: string; bytes: Uint8Array } | null> } })
        .__zenE2e?.readClipboardImage() ?? null
    )
  }
  try {
    const { readImage } = await import('@tauri-apps/plugin-clipboard-manager')
    const img = await readImage()
    const { width, height } = await img.size()
    const bytes = await rgbaToPngBytes(width, height, await img.rgba())
    return { name: pasteImageName('png'), bytes }
  } catch {
    return null
  }
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

/** git 命令端口（M20 版本管理）：生产走 Tauri git_exec（Rust Command 调系统 git）；
 *  E2E web 模式记录命令到 harness 桩（__zenE2e.gitCalls，可配置应答） */
const gitRun: GitRun = E2E
  ? (async (cwd, args) => {
      const z = (window as unknown as Record<string, unknown>).__zenE2e as {
        gitCalls: string[]
        gitAnswers?: Array<{ match: string; ok: boolean; out?: string; err?: string }>
      }
      z.gitCalls.push(`${cwd} $ ${args.join(' ')}`)
      const hit = z.gitAnswers?.find((a) => args.join(' ').startsWith(a.match))
      return hit === undefined ? { ok: true, out: '', err: '' } : { ok: hit.ok, out: hit.out ?? '', err: hit.err ?? '' }
    })
  : async (cwd, args) => {
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke<{ ok: boolean; out: string; err: string }>('git_exec', { cwd, args })
    }

/** 导出与复制图片端口（M5b Task 5）：生产走 Tauri save 对话框 + clipboard-manager writeImage；
 *  E2E web 模式记录到 harness 桩（__zenE2e.savePaths/exportedBytes，固定路径走内存 FS 落盘） */
const exportPorts: ExportPorts = E2E
  ? {
      async pickSavePath(defaultName) {
        const z = (window as unknown as Record<string, unknown>).__zenE2e as {
          savePaths: string[]
        }
        const path = `/ws/导出/${defaultName}`
        z.savePaths.push(path)
        return path
      },
      async writeImage(bytes) {
        ;(
          (window as unknown as Record<string, unknown>).__zenE2e as { exportedBytes: number | null }
        ).exportedBytes = bytes.length
      },
    }
  : {
      async pickSavePath(defaultName) {
        return save({ defaultPath: defaultName })
      },
      async writeImage(bytes) {
        const { writeImage } = await import('@tauri-apps/plugin-clipboard-manager')
        await writeImage(bytes)
      },
    }

export default function App() {
  const { route, currentMdPath, setAdapter, init } = useAppStore()
  const booted = useAppStore((s) => s.booted)
  useEffect(() => {
    useAppStore.setState({ gitRun })
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
        const configPath = await join(await appDataDir(), 'config.json')
        // identifier 迁移（com.tauri.dev → com.mindmapzen.app）：init 前一次性搬旧配置（行为见 services/migration.ts 端口测试）
        await migrateOldConfig(
          tauriFsAdapter,
          configPath,
          configPath.replace('com.mindmapzen.app', 'com.tauri.dev'),
        )
        useAppStore.setState({ configPath })
        await init()
      } catch (e) {
        // 初始化失败也离开启动屏（错误经 banner 呈现），不能永远卡在 loading
        useAppStore.setState({ booted: true })
        useAppStore.getState().setError('初始化失败：' + String(e))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅启动时执行
  }, [])

  // 版本管理定时备份（M20 想法8 免命令）：启用且在工作区内每 10 分钟幂等检查一次
  const gitEnabled = useAppStore((s) => s.gitConfig.enabled)
  const workspaceDir = useAppStore((s) => s.workspaceDir)
  useEffect(() => {
    if (!gitEnabled || workspaceDir === null) return
    void useAppStore.getState().backupNow() // 启用即先备份一次
    const timer = window.setInterval(() => void useAppStore.getState().backupNow(), 10 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [gitEnabled, workspaceDir])

  // auto 模式下跟随系统切换（显式亮/暗不受影响）；E2E web 模式 matchMedia 同样可用，无冲突
  useEffect(() => {
    const stop = watchSystemTheme(() => {
      const { themePref } = useAppStore.getState()
      if (themePref !== 'auto') return
      const resolved = resolveTheme('auto')
      useAppStore.setState({ resolvedTheme: resolved })
      applyDocumentTheme(resolved)
    })
    return stop
  }, [])

  // 启动屏（v2.4 验收）：init 的磁盘 IO 期间不闪开屏/案头，给确定性的加载态
  if (!booted) {
    return (
      <div className="grid h-screen place-items-center bg-background" data-testid="boot-screen">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <AppLogo size={48} />
          <p className="text-sm">正在启动…</p>
        </div>
      </div>
    )
  }

  if (route === 'editor' && currentMdPath) {
    // key：切换文档时强制重挂载 EditorView（组件内部按“仅加载一次”实现，见 EditorView.tsx 注释）
    return (
      <EditorView
        key={currentMdPath}
        mdPath={currentMdPath}
        openInEditor={(p) => void openPath(p)}
        writeClipboard={writeClipboard}
        exportPorts={exportPorts}
        registerCloseGuard={registerCloseGuard}
        exitApp={exitApp}
        pickImageFile={pickImageFile}
        readClipboardImage={readClipboardImage}
      />
    )
  }
  return <LibraryView pickDirectory={pickDirectory} pickImportFile={pickImportFile} />
}
