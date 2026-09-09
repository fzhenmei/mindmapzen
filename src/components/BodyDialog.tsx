// src/components/BodyDialog.tsx —— 正文编辑弹窗(2026-09-08 spec:模态大弹窗 + VDitor):
// 模态一次编辑一个节点(遮罩锁选中,无联动载入);空态/深层门禁出文案不渲染编辑器;
// 自动保存语义不变(useBodyDialog 防抖写回,onOpenChange(false) → close 冲刷)。
// 字数条沿用中文口径(去空白码点);主题/语言跟随全局(appStore/i18next)。
// 取代 BodyPanel.tsx(右侧常驻面板,2026-09-06 spec 决策被 2026-09-08 spec 推翻)。
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'
import VditorEditor from './VditorEditor'
import { useAppStore } from '../store/appStore'
import type { BodyDialog as BodyDialogState } from '../hooks/useBodyDialog'

/** 空态文案条(无选中 / 深层列表节点两态) */
const Hint = ({ text }: Readonly<{ text: string }>) => (
  <p data-testid="body-empty" className="px-4 py-3 text-sm text-muted-foreground">
    {text}
  </p>
)

/** 空态文案解析:null = 可编辑正常态(nodeText 空串 = 无选中;有选中不可编辑 = 深层列表) */
const hintOf = (nodeText: string, editable: boolean, t: TFunction): string | null => {
  if (nodeText === '') return t('editor.bodyPanel.hintNoSelection')
  if (!editable) return t('editor.bodyPanel.hintListNode')
  return null
}

/** 正文编辑弹窗:header(节点文本截断 + ×)+ VDitor 编辑区 + 底部字数条。
 *  Esc/遮罩/× 关闭均走 onOpenChange(false) → close()(flush 后收起) */
export default function BodyDialog({ open, bodyDraft, nodeText, editable, close, edit }: Readonly<BodyDialogState>) {
  const { t, i18n } = useTranslation()
  const theme = useAppStore((s) => s.resolvedTheme)
  const lang = i18n.language?.startsWith('zh') ? 'zh_CN' : 'en_US'
  const draft = bodyDraft ?? ''
  const count = [...draft.replace(/\s/g, '')].length
  const hint = hintOf(nodeText, editable, t)
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      {/* 宽度类契约：sm:max-w-none 须压过 DialogContent 默认 sm:max-w-lg——裸 max-w-none
          不同 modifier，twMerge 不清、CSS 源序反被默认类覆盖，宽度被钳 512px（2026-09-09；
          契约测试见 EditorView.test.tsx「宽度不被默认 sm:max-w-lg 钳制」） */}
      <DialogContent
        data-testid="body-dialog"
        showCloseButton={false}
        className="body-dialog flex h-[92vh] w-[min(1600px,96vw)] flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
          {/* 无 aria-label（radix 由 DialogTitle 生成 aria-labelledby 会遮蔽它）；可访问名
              全由标题承担——无选中（nodeText 空串）给回退文案防空名弹窗 */}
          <DialogTitle className="min-w-0 flex-1 truncate text-left text-sm font-medium" title={nodeText}>
            {nodeText !== '' ? nodeText : t('editor.bodyPanel.ariaLabel')}
          </DialogTitle>
          <button
            type="button"
            data-testid="body-close"
            aria-label={t('editor.bodyPanel.close')}
            onClick={close}
            className="shrink-0 rounded px-1.5 text-base leading-none text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            ×
          </button>
        </header>
        {hint !== null ? (
          <Hint text={hint} />
        ) : (
          <div data-testid="body-editor" className="min-h-0 flex-1">
            <VditorEditor value={draft} onChange={edit} lang={lang} theme={theme} />
          </div>
        )}
        <footer className="shrink-0 border-t border-border px-4 py-1.5 text-right">
          <span data-testid="body-wordcount" className="text-xs tabular-nums text-muted-foreground">
            {t('editor.bodyPanel.wordCount', { count })}
          </span>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
