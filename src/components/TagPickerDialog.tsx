import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'

interface Props {
  /** 当前节点文本（标题展示） */
  nodeText: string
  /** 当前节点标签（选择器维护/parse 提取） */
  current: readonly string[]
  /** 全图已用标签（打开时快照，供点选；本对话框不回写） */
  used: readonly string[]
  onCancel(): void
  /** 确认：新标签全量列表（SET_NODE_TAG 整组覆写） */
  onConfirm(tags: readonly string[]): void
}

/** 合法标签词：与 md 句尾标记白名单一致（字母/数字（含中文）/下划线/连字符）；
 *  非法名在此拦截——md 侧宽容丢弃会让"看似已添加"的标签保存后凭空消失 */
const TAG_NAME_RE = /^[\p{L}\p{N}_-]+$/u

/** 标签选择器（节点标签的唯一增删 UI 通道）：已选 chips 点击移除 + 全图已用点选
 *  toggle + 输入回车新建（整组覆写语义同图标管理器）。md 句尾 #tag 标记是事实源，
 *  手写标记同样合法（宽容，与图标手写一致） */
export default function TagPickerDialog({ nodeText, current, used, onCancel, onConfirm }: Readonly<Props>) {
  const { t } = useTranslation()
  const [picked, setPicked] = useState<string[]>([...current])
  const [draft, setDraft] = useState('')

  const toggle = (name: string) => {
    setPicked((p) => (p.includes(name) ? p.filter((n) => n !== name) : [...p, name]))
  }

  // 回车提交：trim 后空/含空白/#/超白名单/重复均不收（输入保留供修改）
  const submitDraft = () => {
    const name = draft.trim()
    if (name === '' || !TAG_NAME_RE.test(name) || picked.includes(name)) return
    setPicked((p) => [...p, name])
    setDraft('')
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent data-testid="tag-dialog" aria-label={t('editor.tagPicker.title')} className="sm:max-w-md">
        <DialogTitle>{t('editor.tagPicker.title')}</DialogTitle>
        <p className="truncate text-xs text-muted-foreground" title={nodeText}>
          {nodeText}
        </p>
        {/* 已选行（同图标管理器 2026-09 模式）：全量在场、点击即移除，× 常显可供性 */}
        {picked.length > 0 && (
          <div data-testid="tag-chips" className="flex flex-wrap gap-1">
            {picked.map((name) => (
              <button
                key={name}
                type="button"
                data-testid={`tag-chip-${name}`}
                title={t('editor.tagPicker.removeTag', { name })}
                aria-label={t('editor.tagPicker.removeTag', { name })}
                onClick={() => toggle(name)}
                className="flex items-center gap-0.5 rounded-md bg-secondary px-1.5 py-0.5 text-xs hover:bg-accent"
              >
                {name}
                <span aria-hidden="true" className="text-[10px] leading-none text-muted-foreground">×</span>
              </button>
            ))}
          </div>
        )}
        <Input
          data-testid="tag-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submitDraft()
            }
          }}
          placeholder={t('editor.tagPicker.inputPlaceholder')}
        />
        {/* 全图已用标签：点选 toggle（选中态高亮，同图标网格环）；无已用时引导输入 */}
        {used.length > 0 && (
          <div data-testid="tag-used" className="flex flex-wrap gap-1">
            {used.map((name) => (
              <button
                key={name}
                type="button"
                data-testid={`tag-used-${name}`}
                onClick={() => toggle(name)}
                className={`rounded-md px-1.5 py-0.5 text-xs hover:bg-accent ${
                  picked.includes(name) ? 'bg-secondary ring-2 ring-primary/60' : 'bg-muted/50'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" size="sm" data-testid="tag-cancel" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" data-testid="tag-save" onClick={() => onConfirm(picked)}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
