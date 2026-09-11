// src/components/AiTurnBadge.tsx —— AI 处理中状态签（spec §6/§7）：回合期间画布右上角
// 常驻提示；被拦截尝试（切图/关窗）触发 blockedPulse 红框脉冲（chatStore 1.6s 自动回落）。
import { useChatStore } from '../store/chatStore'
import { i18n } from '../i18n'

export default function AiTurnBadge() {
  const phase = useChatStore((s) => s.phase)
  const pulse = useChatStore((s) => s.blockedPulse)
  if (phase === 'idle') return null
  return (
    <div
      data-testid="ai-badge"
      className={`pointer-events-none absolute top-3 right-3 z-[5] rounded-full border bg-background px-3 py-1 text-xs ${
        pulse ? 'border-destructive text-destructive' : 'border-border text-muted-foreground'
      }`}
    >
      {i18n.t('ai.turn.badge')}
    </div>
  )
}
