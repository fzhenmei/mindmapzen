import { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import { tauriFsAdapter } from './services/fs/TauriFsAdapter'
import LibraryView from './views/LibraryView'
import EditorView from './views/EditorView'
import { open } from '@tauri-apps/plugin-dialog'
import { openPath } from '@tauri-apps/plugin-opener'

// E2E（?e2e=1）以 web 模式运行：无 Tauri 环境，harness 已注入内存 FS 并预设 /ws 工作区
const E2E = new URLSearchParams(window.location.search).has('e2e')

const pickDirectory = async (): Promise<string | null> => {
  if (E2E) return null
  const dir = await open({ directory: true, multiple: false })
  return typeof dir === 'string' ? dir : null
}

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
      <EditorView key={currentMdPath} mdPath={currentMdPath} openInEditor={(p) => void openPath(p)} />
    )
  }
  return <LibraryView pickDirectory={pickDirectory} />
}
