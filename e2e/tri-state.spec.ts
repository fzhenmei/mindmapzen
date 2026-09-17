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
