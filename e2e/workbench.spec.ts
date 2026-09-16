import { expect, test } from '@playwright/test'

// 工作台聚合与跨图定位回归（spec §10）：跨图定位（openMap + pendingLocate →
// onReady 消费 → locateNode 活树链路）单测 fake 盖不住引擎行为分歧（收起分支
// 事故教训，见 kanban.spec 同款注释），必须有真实引擎 e2e。e2e 启动落案头
// （appStore isE2eMode 分叉，spec §11）——从案头按钮进工作台，同时覆盖互达入口。
test('工作台聚合看板与跨图定位', async ({ page }) => {
  test.setTimeout(30_000)
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.goto('/?e2e=1')
  await page.evaluate(async () => {
    const w = window as unknown as { __zenE2e: { writeFile(p: string, t: string): Promise<void> } }
    await w.__zenE2e.writeFile('/ws/工作/驾驶舱.md', '# 驾驶舱\n\n## 任务甲 @todo\n\n### 备注\n\n## 任务乙 @doing\n')
    await w.__zenE2e.writeFile('/ws/工作/子/图B.md', '# 图B\n\n## 任务丙 @blocked\n')
  })
  await page.getByTestId('btn-workbench').click()
  await expect(page.getByTestId('workbench-view')).toBeVisible()
  await expect(page.getByTestId('workbench-col-todo').getByText('任务甲')).toBeVisible()
  await expect(page.getByTestId('workbench-col-doing').getByText('任务乙')).toBeVisible()
  // 来源徽标（跨图来源可辨）
  await expect(page.getByTestId('workbench-col-blocked').getByText('图B')).toBeVisible()
  // 建议区：R1 doing（任务乙）与 R2 blocked（任务丙）至少各一条
  await expect(page.getByTestId('workbench-suggestion').filter({ hasText: '任务乙' })).toBeVisible()
  await expect(page.getByTestId('workbench-suggestion').filter({ hasText: '任务丙' })).toBeVisible()
  // 跨图定位：点任务丙卡片 → 进纸面 → 节点可见（真实引擎链路）
  await page.getByTestId('workbench-col-blocked').getByTestId('workbench-card').filter({ hasText: '任务丙' }).click()
  await expect(page.getByText('图B').first()).toBeVisible()
  await expect(page.getByText('任务丙').first()).toBeVisible()
  expect(pageErrors).toEqual([])
})
