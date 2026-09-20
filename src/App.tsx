import { useEffect, useState, type ReactNode } from 'react'
import { useAppStore } from './store/appStore'
import { i18n } from './i18n'
import { tauriFsAdapter } from './services/fs/TauriFsAdapter'
import { migrateOldConfig } from './services/migration'
import { writeClipboardViaTauri, writeHtmlClipboardViaTauri, type WriteClipboard, type WriteHtmlClipboard } from './services/clipboard'
import { pasteImageName, rgbaToPngBytes } from './services/pasteImage'
import { describeBackendError } from './services/backendError'
import { closeOrHideMainWindow } from './services/appClose'
import LibraryView, { type PickedImport } from './views/LibraryView'
import EditorView from './views/EditorView'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import type { ExportPorts, GitClone, GitRun, RegisterCloseGuard } from './types/ports'
import { openPath } from '@tauri-apps/plugin-opener'
import { applyDocumentTheme, resolveTheme, watchSystemTheme } from './services/theme'
import AppLogo from './components/AppLogo'
import TitleBar from './components/TitleBar'
import DevBadge from './components/DevBadge'
import ToastHost from './components/ToastHost'
import QuickCapture from './components/QuickCapture'
import AppDialogs from './components/AppDialogs'
import TourOverlay from './components/tour/TourOverlay'
import { useQuickCaptureRuntime } from './hooks/useQuickCaptureRuntime'

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
    // 过滤器名用户可见(OS 对话框),词典随界面语言(调用期求值)
    filters: [{ name: i18n.t('library.importFileFilter'), extensions: ['md', 'xmind'] }],
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
    filters: [{ name: i18n.t('editor.imageDialog.fileFilter'), extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
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

/** 退出/隐藏端口（M2 改造，spec §5.1）：快速捕获开启 → hide 驻留；否则 destroy。
 *  裁决逻辑集中 services/appClose（托盘退出/案头拦截共用） */
const exitApp = (): void => {
  void closeOrHideMainWindow()
}

/** 剪贴板端口：E2E web 模式无 Tauri 剪贴板 → 记录到 harness 桩（__zenE2e.lastCopied），生产走 Tauri */
const writeClipboard: WriteClipboard = E2E
  ? async (text) => {
      ;(
        (window as unknown as Record<string, unknown>).__zenE2e as { lastCopied: string | null }
      ).lastCopied = text
    }
  : writeClipboardViaTauri

/** 富文本剪贴板端口（2026-09 公众号复制）：E2E 记录到 harness 桩（__zenE2e.lastCopiedHtml），生产走 Tauri writeHtml */
const writeHtmlClipboard: WriteHtmlClipboard = E2E
  ? async (html) => {
      ;(
        (window as unknown as Record<string, unknown>).__zenE2e as { lastCopiedHtml: string | null }
      ).lastCopiedHtml = html
    }
  : writeHtmlClipboardViaTauri

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
      try {
        return await invoke<{ ok: boolean; out: string; err: string }>('git_exec', { cwd, args })
      } catch (e) {
        // Rust 稳定码本地化(GIT_TIMEOUT 用户可感;未知原文透传,见 backendError.ts)
        throw describeBackendError(String(e))
      }
    }

/** 导出与复制图片端口（M5b Task 5）：生产走 Tauri save 对话框 + clipboard-manager writeImage；
 *  E2E web 模式记录到 harness 桩（__zenE2e.savePaths/exportedBytes，固定路径走内存 FS 落盘） */
/** git 克隆端口（「从 Git 库打开」）：生产走 Tauri git_clone（600s 超时在 Rust 侧）；
 *  E2E web 模式记录到 harness 桩（__zenE2e.gitCalls，与 gitRun 同账本，恒答成功——
 *  克隆产物由内存 FS 用例自行预置） */
const gitClone: GitClone = E2E
  ? (async (parentDir, url, repoName) => {
      const z = (window as unknown as Record<string, unknown>).__zenE2e as {
        gitCalls: string[]
      }
      z.gitCalls.push(`${parentDir} $ clone ${url} ${repoName}`)
      return { ok: true, out: '', err: '' }
    })
  : async (parentDir, url, repoName) => {
      const { invoke } = await import('@tauri-apps/api/core')
      try {
        return await invoke<{ ok: boolean; out: string; err: string }>('git_clone', { parentDir, url, repoName })
      } catch (e) {
        throw describeBackendError(String(e))
      }
    }

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
  // 编辑器重挂序号（冲突裁决 reload）：同路径递增序号强制重挂 EditorView，从磁盘重载当前图
  const editorSeq = useAppStore((s) => s.editorSeq)
  useEffect(() => {
    useAppStore.setState({ gitRun, gitClone })
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
        useAppStore.getState().setError(i18n.t('errors.initFail', { detail: String(e) }))
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

  // 漫游引导自动触发（2026-09 onboarding tour，spec §3.3）：单一 effect 统一两种时机——
  // 启动已有工作区 / 开屏当场选好工作区落案头；error 非空不触发（遮罩不得盖住错误横幅）
  const bootedForTour = useAppStore((s) => s.booted)
  const workspaceForTour = useAppStore((s) => s.workspaceDir)
  const tourDone = useAppStore((s) => s.tourDone)
  const tourActive = useAppStore((s) => s.tourActive)
  const appError = useAppStore((s) => s.error)
  useEffect(() => {
    if (bootedForTour && workspaceForTour !== null && !tourDone && !tourActive && appError === null) {
      useAppStore.getState().startTour()
    }
  }, [bootedForTour, workspaceForTour, tourDone, tourActive, appError])

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

  // WebView 默认快捷键全局屏蔽（v2.5 案头 Ctrl+P 调起打印）：应用无对应功能的浏览器
  // 默认键（Ctrl+P 打印 / Ctrl+S 保存网页 / Ctrl+F 查找栏 / Ctrl+O 打开 / Ctrl+D 收藏
  // / Ctrl+R、F5 刷新——reload 绕过关闭守卫直接丢未保存内容，最危险）一律阻默认行为。
  // 只 preventDefault 不拦传播：应用自身快捷键（编辑器 Ctrl+P 浮层、Ctrl+S 保存等）
  // 由各视图监听照常收到并处理，preventDefault 幂等不冲突
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      const block =
        e.key === 'F5' ||
        ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && ['p', 's', 'f', 'o', 'd', 'r'].includes(k))
      if (block) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 目录选择端口注入(2026-09 导航系统 spec §6):设置「更换工作区」从 AppDialogs 发起,
  // 与 LibraryView 共用同一个 pickDirectory(生产 Tauri 对话框 / e2e __zenE2e 桩)
  useEffect(() => {
    useAppStore.getState().setPickDirPort(pickDirectory)
  }, [])

  // 快速捕获运行时（M2 spec §5）：快捷键/托盘/案头关窗/跨窗同步接线（hook 内端口注入）
  useQuickCaptureRuntime()

  // 快速捕获（2026-09 点子篮子 M1）：应用内 Ctrl+Alt+I 唤起浮层（M2 启用全局快捷键后
  // 由设置开关禁用此监听——单一捕获入口，见 spec §4.1；2026-09 拆分后只看快捷键开关）
  const [captureOpen, setCaptureOpen] = useState(false)
  const quickCaptureShortcut = useAppStore((s) => s.quickCaptureShortcut)
  useEffect(() => {
    if (quickCaptureShortcut) return // M2 全局快捷键接管：单一捕获入口（spec §4.1）
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        setCaptureOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [quickCaptureShortcut])

  // 顶部条壳（v2.5 自定义标题栏）：三态（boot/编辑器/案头）共用 TitleBar 承担标题栏
  // 职责（logo+品名/拖拽/窗口三键），内容区占余下空间；DevBadge 开发版贴纸同随三态
  // （release 构建组件自渲染 null）
  const shell = (children: ReactNode) => (
    <div className="flex h-screen flex-col">
      <TitleBar />
      <div className="min-h-0 flex-1">{children}</div>
      <AppDialogs />
      <DevBadge />
      <ToastHost />
      <QuickCapture open={captureOpen} onClose={() => setCaptureOpen(false)} />
      <TourOverlay />
    </div>
  )

  // 启动屏（v2.4 验收）：init 的磁盘 IO 期间不闪开屏/案头，给确定性的加载态
  if (!booted) {
    return shell(
      <div className="grid h-full place-items-center bg-background" data-testid="boot-screen">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <AppLogo size={48} />
          <p className="text-sm">{i18n.t('common.booting')}</p>
        </div>
      </div>,
    )
  }

  // 两空间路由（2026-09 画布三态 M3：工作台并入案头）：editor 持图、library 为案头
  //（跨图总览由案头欢迎页 DeskOverview 承接）
  if (route === 'editor' && currentMdPath) {
    // key：切换文档时强制重挂载 EditorView（组件内部按“仅加载一次”实现，见 EditorView.tsx 注释）；
    // #editorSeq（冲突裁决 reload）：同路径递增序号也强制重挂，实现当前图从磁盘重载
    return shell(
      <EditorView
        key={`${currentMdPath}#${editorSeq}`}
        mdPath={currentMdPath}
        openInEditor={(p) => void openPath(p)}
        writeClipboard={writeClipboard}
        exportPorts={exportPorts}
        registerCloseGuard={registerCloseGuard}
        exitApp={exitApp}
        pickImageFile={pickImageFile}
        readClipboardImage={readClipboardImage}
      />,
    )
  }
  return shell(
    <LibraryView pickDirectory={pickDirectory} pickImportFile={pickImportFile} writeClipboard={writeClipboard} writeHtmlClipboard={writeHtmlClipboard} />,
  )
}
