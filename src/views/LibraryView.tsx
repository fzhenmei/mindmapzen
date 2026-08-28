import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import { deleteMap, renameMap } from '../services/workspace'
import NameDialog from '../components/NameDialog'

interface Props {
  pickDirectory: () => Promise<string | null>
}

export default function LibraryView({ pickDirectory }: Readonly<Props>) {
  const { workspaceDir, maps, error } = useAppStore()
  const store = useAppStore.getState()
  const [dialog, setDialog] = useState<'new' | 'rename' | 'delete' | null>(null)

  const chooseWorkspace = async () => {
    const dir = await pickDirectory()
    if (dir) await store.setWorkspace(dir)
  }

  const renderBody = () => {
    if (!workspaceDir)
      return (
        <p className="hint">请选择导图工作区：所有导图将以 .md 文件保存在该文件夹，可直接交给 AI 或其他工具使用。</p>
      )
    if (maps.length === 0)
      return <p className="hint">工作区还没有导图，点击右上角「新建导图」开始。</p>
    return (
      <ul className="map-list">
        {maps.map((m) => (
          <li key={m.mdPath}>
            <button
              type="button"
              data-testid="map-item"
              className="map-item"
              onClick={() => store.openMap(m.mdPath)}
            >
              <span className="map-name">{m.name}</span>
              <span className="map-time">{new Date(m.modifiedAt).toLocaleString('zh-CN')}</span>
            </button>
            <button
              type="button"
              data-testid="btn-rename"
              onClick={() => setDialog('rename')}
              title="重命名"
            >
              重命名
            </button>
            <button type="button" data-testid="btn-delete" onClick={() => setDialog('delete')} title="删除">
              删除
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="library">
      <header className="library-header">
        <h1>导图工作区{workspaceDir ? `：${workspaceDir}` : ''}</h1>
        <button type="button" data-testid="btn-workspace" onClick={chooseWorkspace}>
          选择工作区
        </button>
        {workspaceDir && (
          <button type="button" data-testid="btn-new" onClick={() => setDialog('new')}>
            新建导图
          </button>
        )}
      </header>
      {error && <div className="error-banner">{error}</div>}
      {renderBody()}

      {dialog === 'new' && (
        <NameDialog
          title="新建导图"
          confirmText="创建"
          onCancel={() => setDialog(null)}
          onConfirm={async (name) => {
            setDialog(null)
            await store.createAndOpen(name)
          }}
        />
      )}
      {dialog === 'rename' && maps[0] && (
        <NameDialog
          title="重命名导图"
          initial={maps[0].name}
          confirmText="重命名"
          onCancel={() => setDialog(null)}
          onConfirm={async (name) => {
            setDialog(null)
            try {
              await renameMap(store.adapter, workspaceDir!, maps[0]!.name, name)
              await store.refreshMaps()
              store.setError(null)
            } catch (e) {
              store.setError(e instanceof Error ? e.message : String(e))
            }
          }}
        />
      )}
      {dialog === 'delete' && maps[0] && (
        <div className="dialog-mask" role="dialog" aria-label="删除确认">
          <div className="dialog">
            <h3>删除「{maps[0].name}」？</h3>
            <p>将移入回收站（.md 与 .zen.json 一起删除）。</p>
            <div className="dialog-actions">
              <button type="button" onClick={() => setDialog(null)}>
                取消
              </button>
              <button
                type="button"
                data-testid="btn-delete-confirm"
                onClick={async () => {
                  setDialog(null)
                  await deleteMap(store.adapter, workspaceDir!, maps[0]!.name)
                  await store.refreshMaps()
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
