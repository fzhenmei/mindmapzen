import { Download } from './sections/Download'
import { Features } from './sections/Features'
import { Footer } from './sections/Footer'
import { Hero } from './sections/Hero'
import { OneFile } from './sections/OneFile'
import { TopBar } from './sections/TopBar'
import { Why } from './sections/Why'

/** 一页流:顶栏 → Hero(画布⇄文件对照)→ 为什么 → 一图一文件 → 功能 → 下载 → 页脚 */
export default function App() {
  return (
    <div id="top" className="min-h-screen">
      <TopBar />
      <main>
        <Hero />
        <Why />
        <OneFile />
        <Features />
        <Download />
      </main>
      <Footer />
    </div>
  )
}
