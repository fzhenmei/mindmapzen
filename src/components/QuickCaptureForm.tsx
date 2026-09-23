// src/components/QuickCaptureForm.tsx —— 点子捕获表单（容器无关核心，spec §4.1）：
// M1 由 QuickCapture 的 Dialog 壳包裹；M2 捕获小窗原样复用。提交失败不关闭、内容保留
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { i18n } from '../i18n'

interface Props {
  /** 提交成功回调：壳决定收尾（Dialog 壳：关浮层+toast；小窗壳：emit 跨窗事件+隐藏） */
  onSubmitted(): void
  /** 挂载即聚焦（Dialog 壳不传：Radix 自动聚焦首个可聚焦元素，S9379 先例）；小窗壳传 true */
  focusOnMount?: boolean
}

/** 多行输入拆分：首行 = 点子文本，其余 = 正文（空行丢弃） */
function splitIdea(raw: string): { text: string; body?: string } | null {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trimEnd())
  const text = (lines[0] ?? '').trim()
  if (text === '') return null
  const body = lines.slice(1).join('\n').trim()
  return { text, ...(body !== '' ? { body } : {}) }
}

export default function QuickCaptureForm({ onSubmitted, focusOnMount = false }: Readonly<Props>) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (focusOnMount) ref.current?.focus()
  }, [focusOnMount])

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
      onSubmitted()
    } catch (e) {
      console.error('捕获提交异常', e)
      setError(i18n.t('basket.errors.writeFailed'))
    }
  }

  return (
    <>
      <textarea
        ref={ref}
        data-testid="capture-input"
        rows={3}
        value={value}
        placeholder={t('basket.capture.placeholder')}
        className="w-full flex-1 resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // 合成期（输入法确认候选）的 Enter 不入篮：Chromium/WebView2 下该 keydown 带
          // isComposing:true，放行即"用户还没打完第一个词就被提交并关框"（M1 Task5 裁定）
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
    </>
  )
}
