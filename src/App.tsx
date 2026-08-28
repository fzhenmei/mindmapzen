import { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import { tauriFsAdapter } from './services/fs/TauriFsAdapter'
import LibraryView from './views/LibraryView'
import EditorView from './views/EditorView'
import { open } from '@tauri-apps/plugin-dialog'
import { openPath } from '@tauri-apps/plugin-opener'

const pickDirectory = async (): Promise<string | null> => {
  const dir = await open({ directory: true, multiple: false })
  return typeof dir === 'string' ? dir : null
}

export default function App() {
  const { route, currentMdPath, setAdapter, init } = useAppStore()
  useEffect(() => {
    void (async () => {
      try {
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
    return <EditorView mdPath={currentMdPath} openInEditor={(p) => void openPath(p)} />
  }
  return <LibraryView pickDirectory={pickDirectory} />
}
