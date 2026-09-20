// src/components/QuickCapture.tsx —— 点子捕获组件（容器无关，spec §4.1）：
// M1 装在 App 层 Dialog 浮层；M2 原样搬进独立小窗。提交失败不关闭、内容保留（不吞异常：
// 错误就地显示，用户可改后重试）
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'
import { useAppStore } from '../store/appStore'
import { showToast } from '../services/toast'
import { basketAbsPath } from '../services/basket'
import { i18n } from '../i18n'

interface Props {
  open: boolean
  onClose(): void
}

/** 多行输入拆分：首行 = 点子文本，其余 = 正文（空行丢弃） */
function splitIdea(raw: string): { text: string; body?: string } | null {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trimEnd())
  const text = (lines[0] ?? '').trim()
  if (text === '') return null
  const body = lines.slice(1).join('\n').trim()
  return { text, ...(body !== '' ? { body } : {}) }
}

export default function QuickCapture({ open, onClose }: Readonly<Props>) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    const idea = splitIdea(value)
    if (idea === null) return
    try {
      const r = await useAppStore.getState().captureIdea(idea)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setValue('')
      setError(null)
      onClose()
      // 成功反馈带「打开篮子」动作（spec §4.1）；未设工作区时无路径可取，退化为纯文案
      const { workspaceDir, basketRelPath } = useAppStore.getState()
      const basketAbs = workspaceDir !== null && basketRelPath !== null ? basketAbsPath(workspaceDir, basketRelPath) : null
      showToast(
        i18n.t('basket.capture.submitted'),
        basketAbs === null
          ? undefined
          : { label: i18n.t('basket.capture.openBasket'), run: () => void useAppStore.getState().openMap(basketAbs) },
      )
    } catch (e) {
      console.error('捕获提交异常', e)
      setError(i18n.t('basket.errors.writeFailed'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent aria-label={t('basket.capture.title')} className="sm:max-w-md">
        <DialogTitle>{t('basket.capture.title')}</DialogTitle>
        <textarea
          data-testid="capture-input"
          autoFocus
          rows={3}
          value={value}
          placeholder={t('basket.capture.placeholder')}
          className="w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            // 合成期（输入法确认候选）的 Enter 不入篮：Chromium/WebView2 下该 keydown 带
            // isComposing:true，放行即"用户还没打完第一个词就被提交并关框"，且会干扰候选确认
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void submit()
            }
          }}
        />
        {error !== null && (
          <p data-testid="capture-error" role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t('basket.capture.hint')}</p>
      </DialogContent>
    </Dialog>
  )
}
