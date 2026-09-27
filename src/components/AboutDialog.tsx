import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import AppLogo from './AppLogo'

// 开源仓库地址（git remote github，2026-09-15 全史重写后的公开仓库）
const REPO_URL = 'https://github.com/fzhenmei/mindmapzen'

interface AboutDialogProps {
  onClose(): void
  /** 重看功能引导：激活引导并关闭整个设置栈（引导遮罩需要完整视口，沿设置窗时期口径） */
  onReplayTour(): void
}

/** 关于对话框（2026-09 设置窗手风琴批）：产品名/版本/commit 短哈希/开源地址/引导重看，
 *  自设置窗底部「关于」行打开，叠在设置窗上（嵌套 Dialog，不动 appStore.appDialog 单值）。
 *  版本信息由 vite define 构建期注入（vite.config.ts __APP_VERSION__/__GIT_COMMIT__）；
 *  外链走原生 <a target="_blank">：WebView2 对 http 新窗口链接默认交系统浏览器打开。 */
export default function AboutDialog({ onClose, onReplayTour }: Readonly<AboutDialogProps>) {
  const { t } = useTranslation()
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent data-testid="about-dialog" aria-label={t('settings.about')}>
        <DialogTitle>{t('settings.about')}</DialogTitle>
        {/* 纵轴居中构图（欢迎页 CardHeader 同构）：印标/名称/slogan/版本/开源地址 */}
        <div className="flex flex-col items-center gap-1.5 py-4 text-sm">
          <AppLogo size={48} className="mx-auto" />
          <span className="text-base font-medium">Mind Map Zen</span>
          <span className="text-xs text-muted-foreground">{t('library.welcomeScreen.tagline')}</span>
          <span className="text-xs text-muted-foreground" data-testid="about-version">
            v{__APP_VERSION__} · {__GIT_COMMIT__}
          </span>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline">
            github.com/fzhenmei/mindmapzen
          </a>
        </div>
        <DialogFooter>
          <Button variant="secondary" size="sm" data-testid="tour-replay" onClick={onReplayTour}>
            {t('settings.tourReplayFull')}
          </Button>
          <Button variant="secondary" size="sm" data-testid="about-close" onClick={onClose}>
            {t('settings.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
