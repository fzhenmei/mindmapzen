import { useEffect, useState } from 'react'
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
  /** 确认：名称 + 选中模板的 md（undefined = 空白，传内置 blank 亦同效） */
  onConfirm(name: string, templateContent?: string): void
}

/** 新建导图对话框（M16）：名称输入 + 模板选择（ui Select，内置 + 工作区 templates/）。
 *  testid 沿用 NameDialog 契约（input-name/btn-confirm）——既有 E2E 新建流零适配
 *  （默认空白模板，直接输名称回车 = v1.5.0 行为）。模板清单挂载时拉取一次 */
export default function NewMapDialog({ onCancel, onConfirm }: Readonly<Props>) {
  const [name, setName] = useState('')
  const [templates, setTemplates] = useState<readonly TemplateInfo[]>([])
  const [picked, setPicked] = useState<string>('builtin:blank')

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

  const confirm = () => {
    const tpl = templates.find((t) => t.key === picked)
    // 空白模板走 createMap 缺省路径（与旧行为同一落盘内容）
    onConfirm(name.trim(), tpl !== undefined && tpl.key !== 'builtin:blank' ? tpl.content : undefined)
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent aria-label="新建导图">
        <DialogTitle>新建导图</DialogTitle>
        <Input
          data-testid="input-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirm()
          }}
          autoFocus
        />
        <Select value={picked} onValueChange={setPicked}>
          <SelectTrigger data-testid="template-select" aria-label="选择模板" className="w-full">
            <SelectValue placeholder="选择模板" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.key} value={t.key}>
                {t.name}
                {t.desc !== '' && <span className="ml-2 text-xs text-muted-foreground">{t.desc}</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button size="sm" data-testid="btn-confirm" onClick={confirm}>
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
