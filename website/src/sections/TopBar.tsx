import { BrandMark } from '../components/BrandMark'
import { Button } from '../components/ui/button'
import { IS_EN, L } from '../content'

export function TopBar() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <a href="#top" className="flex items-center gap-2.5">
          <BrandMark size={24} />
          <span className="font-mono text-sm font-medium">mind-map-zen</span>
        </a>
        <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label={L.navAria}>
          {L.nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>
        {/* 语言切换:普通链接 + localStorage 记忆(根路径自动检测尊重显式选择) */}
        <a
          href={IS_EN ? '/' : '/en/'}
          data-testid="lang-switch"
          aria-label={IS_EN ? '切换到中文' : 'Switch to English'}
          onClick={() => {
            try {
              localStorage.setItem('zen-lang', IS_EN ? 'zh' : 'en')
            } catch {
              // localStorage 不可用时静默忽略,链接仍可正常跳转
            }
          }}
          className="rounded-md px-3 py-1.5 font-mono text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {IS_EN ? '中文' : 'EN'}
        </a>
        <Button size="sm" asChild className="ml-auto md:ml-2">
          <a href="#download">{L.download}</a>
        </Button>
      </div>
    </header>
  )
}
