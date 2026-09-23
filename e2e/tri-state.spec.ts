import { expect, test } from '@playwright/test'

// 画布三态 M1（2026-09-17 spec §5-§7）：三态切换 / Markdown 渲染 / Esc 回导图 /
// 工具栏矩阵 / 快捷键直达。内存 FS 预置一张含层级与任务的图。
async function seed(page: import('@playwright/test').Page): Promise<void> {
  // harness 异步装配（main.tsx 顶层 await），早于其就绪的 evaluate 拿不到 __zenE2e（icons.spec 同款守卫）
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as { __zenE2e?: object }).__zenE2e)))
    .toBe(true)
  await page.evaluate(async () => {
    const w = window as unknown as { __zenE2e: { writeFile(p: string, t: string): Promise<void> } }
    await w.__zenE2e.writeFile(
      '/ws/三态回归.md',
      '# 三态回归\n\n## 章节甲\n\n### 任务一 @doing\n\n### 任务二 @todo\n\n## 章节乙\n',
    )
  })
  await page.getByTestId('file-node-三态回归').dblclick()
  await expect(page.getByText('章节甲').first()).toBeVisible()
}

test('三态切换与 Markdown 渲染：视图组/Ctrl+2/Esc 全链', async ({ page }) => {
  test.setTimeout(30_000)
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.goto('/?e2e=1')
  await seed(page)

  // 视图组进 Markdown：渲染序列化文本（标题可见）
  await page.getByTestId('btn-view-markdown').click()
  const mdView = page.getByTestId('markdown-view')
  await expect(mdView).toBeVisible()
  await expect(mdView.getByText('章节甲').first()).toBeVisible()
  await expect(mdView.getByText('任务一').first()).toBeVisible()

  // Esc 回导图
  await page.keyboard.press('Escape')
  await expect(mdView).toHaveCount(0)
  await expect(page.getByText('章节甲').first()).toBeVisible()

  // Ctrl+2 直达 + Ctrl+3 切看板 + Ctrl+1 回导图
  await page.keyboard.press('Control+2')
  await expect(page.getByTestId('markdown-view')).toBeVisible()
  await page.keyboard.press('Control+3')
  await expect(page.getByTestId('kanban-view')).toBeVisible()
  await page.keyboard.press('Control+1')
  await expect(page.getByTestId('kanban-view')).toHaveCount(0)
  expect(pageErrors).toEqual([])
})

// 2026-09 发布复制进画布：Markdown 视图右上角「复制为公众号格式」钮走真渲染全链
// （与案头树右键同链，数据源 = 内存序列化——所见即所复制，含未保存修改），
// 富文本剪贴板经 App E2E 装配记录到 __zenE2e.lastCopiedHtml；真实粘贴往返归真机项
test('Markdown 态「复制为公众号格式」：视图内按钮出内联样式 HTML + 成功轻提示', async ({ page }) => {
  test.setTimeout(30_000)
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.goto('/?e2e=1')
  await seed(page)

  await page.getByTestId('btn-view-markdown').click()
  await expect(page.getByTestId('markdown-view')).toBeVisible()
  await page.getByTestId('btn-copy-wechat').click()
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __zenE2e: { lastCopiedHtml: string | null } }).__zenE2e.lastCopiedHtml,
      ),
    )
    .toContain('<section')
  const html = await page.evaluate(
    () => (window as unknown as { __zenE2e: { lastCopiedHtml: string | null } }).__zenE2e.lastCopiedHtml,
  )
  // 全量文档进产物：section 根承担正文排版，标题在真渲染产物上获得内联样式
  expect(html).toContain('三态回归')
  expect(html).toContain('章节甲')
  expect(html).toContain('font-size: 15px')
  expect(html).toContain('font-size: 20px')
  // 成功轻提示：ToastHost（z-50）浮于 z-[9] 视图之上，可读可断言
  await expect(page.getByTestId('toast')).toContainText('已复制为公众号格式')
  expect(pageErrors).toEqual([])
})

test('工具栏矩阵：Markdown 态隐藏撤销/缩放，大纲钮双向切换', async ({ page }) => {
  test.setTimeout(30_000)
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.goto('/?e2e=1')
  await seed(page)

  await page.keyboard.press('Control+2')
  await expect(page.getByTestId('markdown-view')).toBeVisible()
  await expect(page.getByTestId('btn-undo')).toHaveCount(0)
  await expect(page.getByTestId('btn-zoom-in')).toHaveCount(0)
  await expect(page.getByTestId('btn-copy')).toBeVisible()

  // 大纲钮（brief 微调：默认 pref auto，默认视口 1280 ≥ OUTLINE_WIDE_MIN 900，
  // auto+wide → Markdown 态大纲初始已可见）：点击隐藏（pref off）、再点显示（pref on）
  await expect(page.getByTestId('outline-panel')).toBeVisible()
  await page.getByTestId('btn-outline-toggle').click()
  await expect(page.getByTestId('outline-panel')).toHaveCount(0)
  await page.getByTestId('btn-outline-toggle').click()
  await expect(page.getByTestId('outline-panel')).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('看板态归档钮：展开归档列', async ({ page }) => {
  test.setTimeout(30_000)
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.goto('/?e2e=1')
  await seed(page)

  await page.keyboard.press('Control+3')
  await expect(page.getByTestId('kanban-view')).toBeVisible()
  await page.getByTestId('btn-kanban-archive').click()
  await expect(page.getByTestId('kanban-col-archived')).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('三态主题钮常驻：z-10 常驻件层不被 z-[9] 全屏视图盖住（2026-09 修复回归锁）', async ({ page }) => {
  test.setTimeout(30_000)
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.goto('/?e2e=1')
  await seed(page)

  // 导图态基准：可点且切夜航
  await page.getByTestId('btn-theme').click()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe('dark')

  // Markdown 态：按钮浮于 z-[9] 视图之上——可点（被盖时 click 会一直被拦截至超时）
  await page.keyboard.press('Control+2')
  await expect(page.getByTestId('markdown-view')).toBeVisible()
  await page.getByTestId('btn-theme').click()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe('light')
  // 按钮确实在视图上层（层叠断言，防「可见但被盖」的假绿）
  const above = await page.evaluate(() => {
    const fab = document.querySelector('.theme-fab')
    const view = document.querySelector('[data-testid="markdown-view"]')
    if (fab === null || view === null) return null
    return parseInt(getComputedStyle(fab).zIndex, 10) > parseInt(getComputedStyle(view).zIndex, 10)
  })
  expect(above).toBe(true)

  // 看板态：同款常驻
  await page.keyboard.press('Control+3')
  await expect(page.getByTestId('kanban-view')).toBeVisible()
  await page.getByTestId('btn-theme').click()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe('dark')
  expect(pageErrors).toEqual([])
})
