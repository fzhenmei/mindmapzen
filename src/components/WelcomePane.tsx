import { IconFile, IconImport, IconPlus } from './icons'
import AppLogo from './AppLogo'
import type { MapInfo } from '../types/files'

interface Props {
  /** 工作区显示名（问候行展示） */
  workspaceName: string
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

/** 案头欢迎页（v2.4 美化轮）：VSCode Welcome 骨架 × 青松语言——
 *  开扬无卡布局（居中 max-w-4xl），品牌头（印标 + 名 + 问候 · 工作区）承担身份感；
 *  左「开始」链接列（青松图标点），右「最近的」行卡片（hover 浮起 + 人性化时间）；
 *  空态保持邀请语气。testid 契约不变（desk-idle/desk-idle-new/recent-item-*） */
export default function WelcomePane({ workspaceName, recent, onNew, onImport, onOpen }: Readonly<Props>) {
  return (
    <div
      className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-10 p-10"
      data-testid="desk-idle"
    >
      {/* 品牌头：身份 + 语境（问候 · 工作区名） */}
      <header className="flex flex-col items-center gap-2 text-center">
        <AppLogo size={56} />
        <h1 className="text-2xl font-semibold tracking-tight">Mind Map Zen</h1>
        <p className="text-sm text-muted-foreground">
          {greeting()}，{workspaceName} —— 想法落成 .md
        </p>
      </header>

      <div className="grid gap-10 md:grid-cols-[2fr_3fr]">
        {/* 左列：开始 */}
        <section>
          <h2 className="mb-2 text-xs font-medium tracking-widest text-muted-foreground">开始</h2>
          <div className="flex flex-col items-start gap-1">
            <button
              type="button"
              data-testid="desk-idle-new"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
              onClick={onNew}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                <IconPlus size={16} />
              </span>
              <span>
                <span className="block text-sm font-medium">新建导图</span>
                <span className="block text-xs text-muted-foreground">空白或从模板开始</span>
              </span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
              onClick={onImport}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <IconImport size={16} />
              </span>
              <span>
                <span className="block text-sm font-medium">导入</span>
                <span className="block text-xs text-muted-foreground">.md 或 .xmind 文件</span>
              </span>
            </button>
          </div>
        </section>

        {/* 右列：最近的 */}
        <section>
          <h2 className="mb-2 text-xs font-medium tracking-widest text-muted-foreground">最近的</h2>
          {recent.length === 0 ? (
            <p className="rounded-lg bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
              还没有打开过的导图，从左边新建一张吧
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5" data-testid="desk-recent">
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
      </div>
    </div>
  )
}
