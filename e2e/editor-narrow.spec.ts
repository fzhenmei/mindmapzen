import { expect, test, type Page } from '@playwright/test'

// 窄窗避让（2026-09 UI 评审 P1）：ZenBar 固定 ~778px 居中停泊，窗口最小档 800×600 时
// 左下题签（含朱砂脏印）与右下主题钮同高程 z-[5]，被 z-10 的命令栏整体遮住（题签遮挡
// 带宽实测 800–1102px）。修复口径：编辑器容器 <1150px 时题签/主题钮上移一行（bottom-16）
// 与命令栏分层；≥1150px 维持同线原位（bottom-3），另以 max-w 截断长名防止宽窗越线。
// 题签 pointer-events-none（命中测试不可用），断言走几何分层；主题钮可命中测试。

const openFirstMap = async (page: Page): Promise<void> => {
  await page.goto('/?e2e=1&desk=1')
  await page.getByTestId('file-node-根图').dblclick()
  await expect(page.getByTestId('zen-bar')).toBeVisible()
}

interface Box {
  left: number
  right: number
  top: number
  bottom: number
  cx: number
  cy: number
}

const rects = (page: Page): Promise<{ bar: Box; caption: Box; fab: Box }> =>
  page.evaluate(() => {
    const r = (sel: string): Box => {
      const el = document.querySelector(sel)!
      const b = el.getBoundingClientRect()
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, cx: b.left + b.width / 2, cy: b.top + b.height / 2 }
    }
    return { bar: r('[data-testid="zen-bar"]'), caption: r('.editor-caption'), fab: r('.theme-fab') }
  })

test('编辑器：窄窗题签与主题钮上移一行，不被命令栏遮挡', async ({ page }) => {
  test.setTimeout(30_000)
  await openFirstMap(page)
  // 800×600 = 窗口最小档（tauri.conf.json minWidth/minHeight）
  await page.setViewportSize({ width: 800, height: 600 })

  const { bar, caption, fab } = await rects(page)
  // 上移一行：题签/主题钮底边不越过命令栏顶边（1px 容差）
  expect(caption.bottom).toBeLessThanOrEqual(bar.top + 1)
  expect(fab.bottom).toBeLessThanOrEqual(bar.top + 1)
  // 题签仍在视口内（未被顶出屏外）
  expect(caption.top).toBeGreaterThanOrEqual(0)
  // 主题钮可命中（pointer-events 正常，点击不被命令栏截走）
  const fabHit = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      return el !== null && el.closest('.theme-fab') !== null
    },
    { x: fab.cx, y: fab.cy },
  )
  expect(fabHit).toBe(true)
})

test('编辑器：宽窗题签与主题钮维持同线原位', async ({ page }) => {
  test.setTimeout(30_000)
  await openFirstMap(page)
  // 默认 1280 宽：题签/主题钮与命令栏同线（bottom-3），未因窄窗规则上移
  const { bar, caption, fab } = await rects(page)
  expect(caption.bottom).toBeGreaterThanOrEqual(bar.bottom - 1)
  expect(fab.bottom).toBeGreaterThanOrEqual(bar.bottom - 1)
})
