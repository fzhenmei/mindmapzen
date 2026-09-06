import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { listTemplates, type TemplateInfo } from '../services/templates'
import { useAppStore } from '../store/appStore'

interface Props {
  onCancel(): void
  /** 确认（M16 抛错语义）：resolve = 成功（调用方在成功路径上关框）；抛错 = 对话框
   *  就地显示 error.message、不关框——输入类错误不再散落到全局 banner */
  onConfirm(name: string, templateContent?: string): void | Promise<void>
  /** 目标目录显示名（2026-09 树右键「在此新建导图」）：缺省 = 工作区根（标题不示目录） */
  inDirLabel?: string
}

/** 新建导图对话框（M16）：名称输入 + 模板选择（ui Select，内置 + 工作区 templates/）。
 *  testid 沿用 NameDialog 契约（input-name/btn-confirm）——既有 E2E 新建流零适配
 *  （默认空白模板，直接输名称回车 = v1.5.0 行为）。模板清单挂载时拉取一次 */
export default function NewMapDialog({ onCancel, onConfirm, inDirLabel }: Readonly<Props>) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [templates, setTemplates] = useState<readonly TemplateInfo[]>([])
  const [picked, setPicked] = useState<string>('builtin:blank')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const list = await listTemplates(useAppStore.getState().adapter, useAppStore.getState().workspaceDir)
      if (!cancelled) setTemplates(list)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const confirm = async () => {
    setError(null)
    if (name.trim() === '') {
      setError(t('errors.nameEmpty'))
      return
    }
    const tpl = templates.find((tpl) => tpl.key === picked)
    // 空白模板走 createMap 缺省路径（与旧行为同一落盘内容）
    const content = tpl !== undefined && tpl.key !== 'builtin:blank' ? tpl.content : undefined
    try {
      await onConfirm(name.trim(), content)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent aria-label={inDirLabel === undefined ? t('library.dialogs.newMap.title') : t('library.dialogs.newMap.titleIn', { dir: inDirLabel })}>
        <DialogTitle>{inDirLabel === undefined ? t('library.dialogs.newMap.title') : t('library.dialogs.newMap.titleIn', { dir: inDirLabel })}</DialogTitle>
        <Input
          data-testid="input-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void confirm()
          }}
          autoFocus
        />
        {error !== null && (
          <p data-testid="dialog-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Select value={picked} onValueChange={setPicked}>
          <SelectTrigger data-testid="template-select" aria-label={t('library.dialogs.newMap.templateSelect')} className="w-full">
            <SelectValue placeholder={t('library.dialogs.newMap.templateSelect')} />
          </SelectTrigger>
          <SelectContent>
            {templates.map((tpl) => (
              <SelectItem key={tpl.key} value={tpl.key}>
                {tpl.name}
                {tpl.desc !== '' && <span className="ml-2 text-xs text-muted-foreground">{tpl.desc}</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" data-testid="btn-confirm" onClick={() => void confirm()}>
            {t('library.dialogs.newMap.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
