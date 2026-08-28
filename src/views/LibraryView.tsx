import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import { deleteMap, renameMap } from '../services/workspace'
import { commitImport } from '../services/importMap'
import { parse } from '../services/mdTree'
import NameDialog from '../components/NameDialog'
import ThemeToggle from '../components/ThemeToggle'
import type { MapInfo } from '../types/files'
import type { IgnoredBlock, ZenNode } from '../types/tree'

interface Props {
  pickDirectory: () => Promise<string | null>
  /** 选择外部 .md 文件：生产为 Tauri 对话框单选 + adapter 读取，测试注入桩；取消返回 null */
  pickMdFile: () => Promise<{ name: string; text: string } | null>
}

/** 导入预览挂起态：解析成功但存在忽略块，待用户确认后才入库（取消则丢弃） */
interface ImportPreview {
  name: string
  tree: ZenNode
  blocks: IgnoredBlock[]
}

export default function LibraryView({ pickDirectory, pickMdFile }: Readonly<Props>) {
  const { workspaceDir, maps, error } = useAppStore()
  const store = useAppStore.getState()
  const [dialog, setDialog] = useState<'new' | 'rename' | 'delete' | null>(null)
  // 重命名/删除对话框当前操作的导图（由所在行的按钮选定，而非 maps[0]）
  const [target, setTarget] = useState<MapInfo | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)

  const closeDialog = () => {
    setDialog(null)
    setTarget(null)
  }

  const chooseWorkspace = async () => {
    try {
      const dir = await pickDirectory()
      if (dir) await store.setWorkspace(dir)
    } catch (e) {
      store.setError('设置工作区失败：' + String(e))
    }
  }

  /** 导入 .md：复制入库（内容按规范序列化另存，不移动原文件）；有忽略块先预览确认 */
  const startImport = async () => {
    if (!workspaceDir) return
    try {
      const picked = await pickMdFile()
      if (picked === null) return
      const r = parse(picked.text)
      if (!r.ok) {
        store.setError('导入失败：' + r.error)
        return
      }
      if (r.ignoredBlocks.length > 0) {
        setImportPreview({ name: picked.name, tree: r.tree, blocks: r.ignoredBlocks })
        return
      }
      const info = await commitImport(store.adapter, workspaceDir, picked.name, r.tree, store.preferredLayout)
      await store.openMap(info.mdPath)
    } catch (e) {
      store.setError('导入失败：' + String(e))
    }
  }

  const confirmImport = async () => {
    const pending = importPreview
    if (pending === null || !workspaceDir) return
    setImportPreview(null)
    try {
      const info = await commitImport(store.adapter, workspaceDir, pending.name, pending.tree, store.preferredLayout)
      await store.openMap(info.mdPath)
    } catch (e) {
      store.setError('导入失败：' + String(e))
    }
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
              onClick={() => {
                setTarget(m)
                setDialog('rename')
              }}
              title="重命名"
            >
              重命名
            </button>
            <button
              type="button"
              data-testid="btn-delete"
              onClick={() => {
                setTarget(m)
                setDialog('delete')
              }}
              title="删除"
            >
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
          <button type="button" data-testid="btn-import" onClick={() => void startImport()}>
            导入 .md
          </button>
        )}
        {workspaceDir && (
          <button type="button" data-testid="btn-new" onClick={() => setDialog('new')}>
            新建导图
          </button>
        )}
        {/* 主题三态切换（页首常驻；编辑器右下角挂载见 M4 Task 4） */}
        <ThemeToggle />
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
      {dialog === 'rename' && target && (
        <NameDialog
          title="重命名导图"
          initial={target.name}
          confirmText="重命名"
          onCancel={closeDialog}
          onConfirm={async (name) => {
            closeDialog()
            try {
              await renameMap(store.adapter, workspaceDir!, target.name, name)
              await store.refreshMaps()
              store.setError(null)
            } catch (e) {
              store.setError(e instanceof Error ? e.message : String(e))
            }
          }}
        />
      )}
      {dialog === 'delete' && target && (
        <div className="dialog-mask" role="dialog" aria-label="删除确认">
          <div className="dialog">
            <h3>删除「{target.name}」？</h3>
            <p>将移入回收站（.md 与 .zen.json 一起删除）。</p>
            <div className="dialog-actions">
              <button type="button" onClick={closeDialog}>
                取消
              </button>
              <button
                type="button"
                data-testid="btn-delete-confirm"
                onClick={async () => {
                  closeDialog()
                  try {
                    await deleteMap(store.adapter, workspaceDir!, target.name)
                    await store.refreshMaps()
                  } catch (e) {
                    store.setError('删除失败：' + String(e))
                  }
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
      {importPreview && (
        <div className="dialog-mask" role="dialog" aria-label="导入预览">
          <div className="dialog" data-testid="import-preview">
            <h3>导入「{importPreview.name}」</h3>
            <p>{importPreview.blocks.length} 个内容块未映射，这些内容不会出现在导图中：</p>
            <ul className="ignored-preview-list">
              {importPreview.blocks.map((b) => (
                <li key={`${b.type}:${b.excerpt}`}>
                  {b.type}：{b.excerpt}
                </li>
              ))}
            </ul>
            <div className="dialog-actions">
              <button
                type="button"
                data-testid="import-cancel"
                onClick={() => setImportPreview(null)}
              >
                取消
              </button>
              <button
                type="button"
                data-testid="import-confirm"
                onClick={() => void confirmImport()}
              >
                导入
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
