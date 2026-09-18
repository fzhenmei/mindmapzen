import { expect, test } from '@playwright/test'

// 案头总览回归（2026-09 画布三态 M3，原工作台聚合与跨图定位 spec §10）：跨图定位
// （openMap + pendingLocate → onReady 消费 → locateNode 活树链路）单测 fake 盖不住
// 引擎行为分歧（收起分支事故教训，见 kanban.spec 同款注释），必须有真实引擎 e2e。
// e2e 启动落案头且 idle 态——总览直接在欢迎页可见，无跳转入口（原 btn-workbench
// 已退役）。欢迎页仅在 maps 非空时渲染（LibraryView 空态分支先拦截）：种图触发
// refreshMaps 后欢迎页才首挂，DeskOverview 首扫必含种子数据（挂载晚于落盘，无竞态）。
test('案头总览聚合与跨图定位', async ({ page }) => {
  test.setTimeout(30_000)
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.goto('/?e2e=1')
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as { __zenE2e?: object }).__zenE2e)))
    .toBe(true) // harness 异步装配(main.tsx 顶层 await),早于其就绪的 evaluate 拿不到 __zenE2e(icons.spec 同款)
  await page.evaluate(async () => {
    const w = window as unknown as { __zenE2e: { writeFile(p: string, t: string): Promise<void> } }
    await w.__zenE2e.writeFile('/ws/工作/驾驶舱.md', '# 驾驶舱\n\n## 任务甲 @todo\n\n### 备注\n\n## 任务乙 @doing\n')
    await w.__zenE2e.writeFile('/ws/工作/子/图B.md', '# 图B\n\n## 任务丙 @blocked\n')
  })
  // e2e 落案头 idle 态：总览在欢迎页直接可见（原 btn-workbench 入口已退役）
  await expect(page.getByTestId('desk-overview')).toBeVisible()
  // 行列表形态：workbench-row-* 挂状态段容器（行头「状态名 · 计数」+ 全宽行），直接下钻
  const rowTodo = page.getByTestId('workbench-row-todo')
  const rowDoing = page.getByTestId('workbench-row-doing')
  const rowBlocked = page.getByTestId('workbench-row-blocked')
  await expect(rowTodo.getByTestId('workbench-card').filter({ hasText: '任务甲' })).toBeVisible()
  await expect(rowDoing.getByText('任务乙')).toBeVisible()
  // 来源徽标（跨图来源可辨）
  await expect(rowBlocked.getByText('图B')).toBeVisible()
  // 建议区：R1 doing（任务乙）与 R2 blocked（任务丙）至少各一条
  await expect(page.getByTestId('workbench-suggestion').filter({ hasText: '任务乙' })).toBeVisible()
  await expect(page.getByTestId('workbench-suggestion').filter({ hasText: '任务丙' })).toBeVisible()
  // 跨图跳看板（2026-09 案头跳看板）：点任务丙行 → 该图以看板态打开 + 命中卡滚动高亮
  // （真实引擎链路：openTask 先置 viewMode+view:'kanban' 寻址器 → onReady 消费分派 →
  // KanbanView 按 path+text 匹配命中卡）；断言须赶在限时淡出窗（2.5s）内
  await rowBlocked.getByTestId('workbench-card').filter({ hasText: '任务丙' }).click()
  await expect(page.getByTestId('kanban-view')).toBeVisible()
  const cardC = page.getByTestId('kanban-col-blocked').locator('li', { hasText: '任务丙' })
  await expect(cardC).toBeVisible()
  await expect(cardC).toHaveClass(/ring-2/)
  expect(pageErrors).toEqual([])
})

test('工作目录不存在：轻引导创建后引导退场（目录在但无任务，内容整段退场）', async ({ page }) => {
  test.setTimeout(30_000)
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.goto('/?e2e=1')
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as { __zenE2e?: object }).__zenE2e)))
    .toBe(true) // 同上：harness 暖启动竞态守卫
  // 欢迎页（含总览）仅在 maps 非空时渲染：种一张根层图占位即可，不预置 工作/ 目录
  await page.evaluate(async () => {
    const w = window as unknown as { __zenE2e: { writeFile(p: string, t: string): Promise<void> } }
    await w.__zenE2e.writeFile('/ws/根图.md', '# 根图\n')
  })
  // 轻引导可见（工作台页面退役后的唯一创建入口）
  await expect(page.getByTestId('desk-overview-create')).toBeVisible()
  await page.getByTestId('desk-overview-create').click()
  // 目录创建后（空）总览内容整段退场、引导消失（根容器零高度不为 visible，但仍在
  // 文档中——退场是内容退场不是卸载，用 attached 把关）
  await expect(page.getByTestId('desk-overview-create')).toHaveCount(0)
  await expect(page.getByTestId('desk-overview')).toBeAttached()
  expect(pageErrors).toEqual([])
})
