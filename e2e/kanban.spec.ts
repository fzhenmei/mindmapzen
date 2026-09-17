import { expect, test } from '@playwright/test'

// 看板批量归档回归（2026-09-13 真机 bug）：收起分支下的 done 卡曾在批量归档中静默遗留。
// 根因是 expandToUid 直写 mm.getData() 深拷贝副本（引擎 Command.js getCopyData =
// copyRenderTree）、从未落引擎活树 renderer.renderTree——重渲后节点不可寻址、挂起回调
// 因无后续渲染事件永不再触发。单测 fake 的 getData 返回同引用掩盖了这一分歧行为，
// 此用例以真实引擎守卫（copyRenderTree 语义单元层无法复现）。
test('批量归档含收起分支：done 列清空、归档列三卡在场', async ({ page }) => {
  test.setTimeout(30_000)
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.goto('/?e2e=1')
  await page.evaluate(async () => {
    const w = window as unknown as { __zenE2e: { writeFile(p: string, t: string): Promise<void> } }
    await w.__zenE2e.writeFile(
      '/ws/归档回归.md',
      '# 归档回归\n\n## 分支甲\n\n### 任务一 @done\n\n### 任务二 @done\n\n## 明面任务 @done\n',
    )
  })
  await page.getByTestId('file-node-归档回归').dblclick()
  await expect(page.getByText('归档回归').first()).toBeVisible()
  // UI 折叠「分支甲」（collapse.spec 同款：hover 显钮 → 点击）
  await page.getByText('分支甲').first().hover()
  await page.getByText('分支甲').first().click()
  await expect(page.locator('.smm-expand-btn').first()).toBeVisible()
  await page.locator('.smm-expand-btn').first().click()
  await expect(page.getByText('任务一').first()).toHaveCount(0)

  // Ctrl+3 直达看板（2026-09 画布三态：Ctrl+1 导图 / Ctrl+2 Markdown / Ctrl+3 看板）
  await page.keyboard.press('Control+3')
  await expect(page.getByTestId('kanban-view')).toBeVisible()
  const done = page.getByTestId('kanban-col-done')
  await expect(done.getByText('任务一')).toBeVisible()
  await expect(done.getByText('任务二')).toBeVisible()
  await expect(done.getByText('明面任务')).toBeVisible()

  await page.getByTestId('btn-kanban-archive-all').click()
  // done 列清空：挂起回调经真实渲染事件（node_tree_render_end）落命令后重投影
  await expect(done.getByText('暂无任务')).toBeVisible({ timeout: 10_000 })
  // 归档去向（2026-09 画布三态：收起条已退役）：点砚栏归档钮展开归档列，
  // 三张卡在场（含收起分支下的两张——挂起回调不丢）
  await page.getByTestId('btn-kanban-archive').click()
  await expect(page.getByTestId('kanban-col-archived').getByText('任务一')).toBeVisible()
  await expect(page.getByTestId('kanban-col-archived').getByText('任务二')).toBeVisible()
  await expect(page.getByTestId('kanban-col-archived').getByText('明面任务')).toBeVisible()
  expect(pageErrors).toEqual([])
})
