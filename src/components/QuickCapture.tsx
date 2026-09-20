// src/components/QuickCapture.tsx —— 捕获浮层的 Dialog 壳（M1 形态，spec §4.1）：
// 表单本体在 QuickCaptureForm（容器无关，M2 小窗复用）；本壳只负责浮层与成功反馈
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'
import { useAppStore } from '../store/appStore'
import { showToast } from '../services/toast'
import { basketAbsPath } from '../services/basket'
import { i18n } from '../i18n'
import QuickCaptureForm from './QuickCaptureForm'

interface Props {
  open: boolean
  onClose(): void
}

export default function QuickCapture({ open, onClose }: Readonly<Props>) {
  const { t } = useTranslation()

  // 成功反馈带「打开篮子」动作（spec §4.1）；未设工作区时无路径可取，退化为纯文案
  const handleSubmitted = (): void => {
    onClose()
    const { workspaceDir, basketRelPath } = useAppStore.getState()
    const basketAbs = workspaceDir !== null && basketRelPath !== null ? basketAbsPath(workspaceDir, basketRelPath) : null
    showToast(
      i18n.t('basket.capture.submitted'),
      basketAbs === null
        ? undefined
        : { label: i18n.t('basket.capture.openBasket'), run: () => void useAppStore.getState().openMap(basketAbs) },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent aria-label={t('basket.capture.title')} className="sm:max-w-md">
        <DialogTitle>{t('basket.capture.title')}</DialogTitle>
        {/* 刻意不传 focusOnMount：Radix Dialog 挂载期自动聚焦首个可聚焦元素（S9379 先例） */}
        <QuickCaptureForm onSubmitted={handleSubmitted} />
      </DialogContent>
    </Dialog>
  )
}
