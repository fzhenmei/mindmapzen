import { BrandMark } from '../components/BrandMark'
import { Button } from '../components/ui/button'

const NAV = [
  { href: '#why', label: '为什么' },
  { href: '#onefile', label: '一图一文件' },
  { href: '#features', label: '功能' },
]

export function TopBar() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <a href="#top" className="flex items-center gap-2.5">
          <BrandMark size={24} />
          <span className="font-mono text-sm font-medium">mind-map-zen</span>
        </a>
        <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="页面导航">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <Button size="sm" asChild className="ml-auto md:ml-2">
          <a href="#download">下载</a>
        </Button>
      </div>
    </header>
  )
}
