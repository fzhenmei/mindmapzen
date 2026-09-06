import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { IconImport, IconMarkdown, IconPlus } from './icons'
import AppLogo from './AppLogo'
import { i18n } from '../i18n'
import type { MapInfo } from '../types/files'

interface Props {
  /** 最近打开的导图（已过滤截断） */
  recent: readonly MapInfo[]
  onNew(): void
  onImport(): void
  onOpen(m: MapInfo): void
}

/** 时段问候键（本地钟；Sonar S3358：早返回展平，不嵌套三元） */
function greetingKey(h: number): 'welcome.greetingNight' | 'welcome.greetingMorning' | 'welcome.greetingAfternoon' | 'welcome.greetingEvening' {
  if (h < 5) return 'welcome.greetingNight'
  if (h < 12) return 'welcome.greetingMorning'
  if (h < 18) return 'welcome.greetingAfternoon'
  return 'welcome.greetingEvening'
}

/** 时段问候（本地钟，词典取词） */
function greeting(): string {
  return i18n.t(greetingKey(new Date().getHours()))
}

/** 人性化时间（Intl 格式化）：今天 HH:mm / 昨天 HH:mm / M月d日（同年）/ YYYY年M月d日；
 *  英文对应 Today 2:30 PM / Yesterday 9:00 AM（en locale 默认 12 小时制，zh 为 24 小时制
 *  ——hour12 未显式指定，随 locale 各取默认）/ January 5 / January 5, 2026 */
function friendlyTime(ms: number, locale: string): string {
  const d = new Date(ms)
  const now = new Date()
  const sameDay = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const hm = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(d)
  if (sameDay(d, now)) return `${i18n.t('welcome.today')} ${hm}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return `${i18n.t('welcome.yesterday')} ${hm}`
  const sameYear = d.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat(
    locale,
    sameYear ? { month: 'long', day: 'numeric' } : { year: 'numeric', month: 'long', day: 'numeric' },
  ).format(d)
}

/** 案头欢迎页（v2.5 纵轴轮）：单一居中纵轴（max-w-xl），对齐问题结构性消除——
 *  品牌头（印标 + 名 + 问候，问候行不带工作区名——页首/侧栏已示，且本地工具无「用户」）；
 *  居中并排双按钮承担「开始」（新建导图 + 导入均 outline，等宽对称，窄屏竖排通栏）；
 *  「最近的」居中小节题（朱砂印点签名，呼应 logo 印面）+ 全宽行列表（发丝分隔线 +
 *  hover 浮起 + 人性化时间）；页脚落款寄语一行收尾。空态保持邀请语气。
 *  testid 契约不变（desk-idle/desk-idle-new/desk-recent/recent-item-*） */
export default function WelcomePane({ recent, onNew, onImport, onOpen }: Readonly<Props>) {
  const { t } = useTranslation()
  return (
    <div
      className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-8 p-10"
      data-testid="desk-idle"
    >
      {/* 品牌头：身份 + 语境（时段问候 · 品牌标语） */}
      <header className="flex flex-col items-center gap-2 text-center">
        <AppLogo size={56} />
        <h1 className="text-2xl font-semibold tracking-tight">Mind Map Zen</h1>
        <p className="text-sm text-muted-foreground">
          {greeting()} {t('welcome.greetingSuffix')}
        </p>
      </header>

      {/* 开始：居中并排双按钮，等宽对称（窄屏竖排通栏） */}
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <Button type="button" variant="outline" data-testid="desk-idle-new" className="sm:w-32" onClick={onNew}>
          <IconPlus />
          <span>{t('welcome.newMap')}</span>
        </Button>
        <Button type="button" variant="outline" className="sm:w-32" onClick={onImport}>
          <IconImport />
          <span>{t('welcome.importMap')}</span>
        </Button>
      </div>

      {/* 最近的：居中小节题（朱砂印点）+ 全宽行列表（发丝分隔线） */}
      <section className="w-full">
        <h2 className="mb-3 flex items-center justify-center gap-1.5 text-xs font-medium tracking-widest text-muted-foreground">
          <span aria-hidden="true" className="size-1.5 rounded-[1px] bg-destructive" />
          {t('welcome.recentTitle')}
        </h2>
        {recent.length === 0 ? (
          <p className="rounded-lg bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
            {t('welcome.emptyHint')}
          </p>
        ) : (
          <ul className="flex flex-col divide-y" data-testid="desk-recent">
            {recent.map((m) => (
              <li key={m.mdPath}>
                <button
                  type="button"
                  data-testid={`recent-item-${m.name}`}
                  className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent"
                  onClick={() => onOpen(m)}
                >
                  <span className="shrink-0 text-muted-foreground group-hover:text-primary">
                    <IconMarkdown size={16} />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-file text-[13px]">{m.name}</span>
                  {m.relDir !== '' && (
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-file text-xs text-muted-foreground">
                      {m.relDir}
                    </span>
                  )}
                  <span className="shrink-0 font-file text-xs text-muted-foreground">
                    {friendlyTime(m.modifiedAt, i18n.language)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 落款：页脚寄语（居中，案头题跋气质） */}
      <footer className="text-center text-xs text-muted-foreground">{t('welcome.footer')}</footer>
    </div>
  )
}
