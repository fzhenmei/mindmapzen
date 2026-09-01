import { Button } from './ui/button'
import { IconFile, IconImport, IconPlus } from './icons'
import AppLogo from './AppLogo'
import type { MapInfo } from '../types/files'

interface Props {
  /** 最近打开的导图（已过滤截断） */
  recent: readonly MapInfo[]
  onNew(): void
  onImport(): void
  onOpen(m: MapInfo): void
}

/** 时段问候（本地钟） */
function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return '夜深了'
  if (h < 12) return '早上好'
  if (h < 18) return '下午好'
  return '晚上好'
}

/** 人性化时间：今天 HH:mm / 昨天 / M月d日（同年）/ YYYY年M月d日 */
function friendlyTime(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  const sameDay = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (sameDay(d, now)) return `今天 ${hm}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return `昨天 ${hm}`
  const md = `${d.getMonth() + 1}月${d.getDate()}日`
  return d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}年${md}`
}

/** 案头欢迎页（v2.5 纵轴轮）：单一居中纵轴（max-w-xl），对齐问题结构性消除——
 *  品牌头（印标 + 名 + 问候，问候行不带工作区名——页首/侧栏已示，且本地工具无「用户」）；
 *  居中并排双按钮承担「开始」（新建导图 + 导入均 outline，等宽对称，窄屏竖排通栏）；
 *  「最近的」居中小节题（朱砂印点签名，呼应 logo 印面）+ 全宽行列表（发丝分隔线 +
 *  hover 浮起 + 人性化时间）；页脚落款寄语一行收尾。空态保持邀请语气。
 *  testid 契约不变（desk-idle/desk-idle-new/desk-recent/recent-item-*） */
export default function WelcomePane({ recent, onNew, onImport, onOpen }: Readonly<Props>) {
  return (
    <div
      className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-8 p-10"
      data-testid="desk-idle"
    >
      {/* 品牌头：身份 + 语境（时段问候 · 品牌标语） */}
      <header className="flex flex-col items-center gap-2 text-center">
        <AppLogo size={56} />
        <h1 className="text-2xl font-semibold tracking-tight">Mind Map Zen</h1>
        <p className="text-sm text-muted-foreground">{greeting()} —— 想法落成 .md</p>
      </header>

      {/* 开始：居中并排双按钮，等宽对称（窄屏竖排通栏） */}
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <Button type="button" variant="outline" data-testid="desk-idle-new" className="sm:w-32" onClick={onNew}>
          <IconPlus />
          新建导图
        </Button>
        <Button type="button" variant="outline" className="sm:w-32" onClick={onImport}>
          <IconImport />
          导入
        </Button>
      </div>

      {/* 最近的：居中小节题（朱砂印点）+ 全宽行列表（发丝分隔线） */}
      <section className="w-full">
        <h2 className="mb-3 flex items-center justify-center gap-1.5 text-xs font-medium tracking-widest text-muted-foreground">
          <span aria-hidden="true" className="size-1.5 rounded-[1px] bg-destructive" />
          最近的
        </h2>
        {recent.length === 0 ? (
          <p className="rounded-lg bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
            还没有打开过的导图，从上面新建一张吧
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
                    <IconFile size={16} />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-file text-[13px]">{m.name}</span>
                  {m.relDir !== '' && (
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-file text-xs text-muted-foreground">
                      {m.relDir}
                    </span>
                  )}
                  <span className="shrink-0 font-file text-xs text-muted-foreground">
                    {friendlyTime(m.modifiedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 落款：页脚寄语（居中，案头题跋气质） */}
      <footer className="text-center text-xs text-muted-foreground">
        踏上取经路比到达灵山更重要
      </footer>
    </div>
  )
}
