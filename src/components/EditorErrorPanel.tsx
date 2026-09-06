// src/components/EditorErrorPanel.tsx —— 打开失败错误面板（2026-09 自 EditorView 拆出，
// 优雅恢复改版）：读文件失败（被删/移动/权限）与解析失败（内容坏）分型给文案与操作。
// 面板只占画布内容区（壳层保留：对话框照常挂载），任何失败都留逃生门——
// 返回案头 / 打开其他导图；「以纯文本打开修复」仅解析失败提供（文件还在才有得修）
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { IconArrowLeft, IconPencil, IconSwitch } from './icons'
import { toNativePath } from '../services/nativePath'

interface Props {
  /** 失败分型：read = 文件读不到（可能已被移动/删除/无权限）；parse = 内容解析失败（文件仍在） */
  kind: 'read' | 'parse'
  /** 失败原因（中文，含原文细节） */
  error: string
  /** parse 失败时的原文（读文件失败为空串） */
  raw: string
  /** 以纯文本打开修复（Tauri opener，路径由 EditorView 传） */
  onRawEdit(path: string): void
  /** 返回案头（错误态仍可达） */
  onBack(): void
  /** 打开其他导图（呼快速切换浮层，Ctrl+P 的按钮路径） */
  onSwitch(): void
  /** 导图文件路径 */
  mdPath: string
}

export default function EditorErrorPanel({ kind, error, raw, onRawEdit, onBack, onSwitch, mdPath }: Readonly<Props>) {
  const { t } = useTranslation()
  return (
    <div className="editor-error">
      <h2>{kind === 'read' ? t('editor.errorPanel.readTitle') : t('editor.errorPanel.parseTitle')}</h2>
      {kind === 'read' ? (
        <>
          <p className="error-detail">{t('editor.errorPanel.readDetail')}</p>
          {/* 路径出口归一（同「复制文件路径」修复）：给人看的分隔符按平台转原生形态 */}
          <p className="error-path text-muted-foreground break-all text-xs">{toNativePath(mdPath)}</p>
        </>
      ) : (
        <>
          <p className="error-detail">{error}</p>
          <pre className="raw-preview">{raw}</pre>
        </>
      )}
      <div className="error-actions flex gap-2">
        <Button type="button" data-testid="btn-error-back" onClick={onBack}>
          <IconArrowLeft />
          {t('editor.zenbar.backToDesk')}
        </Button>
        <Button type="button" variant="outline" data-testid="btn-error-switch" onClick={onSwitch}>
          <IconSwitch />
          {t('editor.errorPanel.openOther')}
        </Button>
        {kind === 'parse' && (
          <Button type="button" variant="outline" data-testid="btn-raw-edit" onClick={() => onRawEdit(mdPath)}>
            <IconPencil />
            {t('editor.errorPanel.rawEdit')}
          </Button>
        )}
      </div>
    </div>
  )
}
