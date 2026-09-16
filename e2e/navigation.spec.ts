import { expect, test } from '@playwright/test'

// 导航系统回归(spec 2026-09-16-navigation-system §3/§5/§6):返回=回来路(工作台进→
// 返回落工作台;案头进→落案头)+ 看板退出收敛砚栏 toggle(关闭钮已移除)+ 编辑器设置
// 入口。e2e 启动落案头(isE2eMode 分叉),案头钮进工作台复用互达入口(workbench.spec 同款)。
test('返回来路:案头进图返回落案头,工作台进图返回落工作台', async ({ page }) => {
  test.setTimeout(30_000)
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.goto('/?e2e=1')
  // 等 harness __zenE2e 挂载(body.spec 同款):evaluate 无 locator 自动等待,暖启动竞态下窗口变量未注入
  await expect(page.getByTestId('btn-new')).toBeVisible()
  await page.evaluate(async () => {
    const w = window as unknown as { __zenE2e: { writeFile(p: string, t: string): Promise<void> } }
    // 种进 工作/ 子树:工作台聚合只扫该子树(scanWorkTasks),根层图不产卡片(与 workbench.spec 同款)
    await w.__zenE2e.writeFile('/ws/工作/图甲.md', '# 图甲\n\n## 甲任务 @todo\n')
  })
  // 工作台 → 图(经聚合看板卡片)→ 返回落工作台。先走此腿:卡片进图不依赖左树,
  // 而 writeFile 只刷 maps(文件行)不重建目录节点(readDirTree 仅在 LibraryView
  // 挂载/切工作区时跑)——渲染后新建的 工作/ 子树要等案头重挂载才可见,案头腿后置
  await page.getByTestId('btn-workbench').click()
  await expect(page.getByTestId('workbench-view')).toBeVisible()
  await page.getByTestId('workbench-card').filter({ hasText: '甲任务' }).click()
  await expect(page.getByText('图甲').first()).toBeVisible()
  await page.getByTestId('btn-back').click()
  await expect(page.getByTestId('workbench-view')).toBeVisible()
  // 工作台头部「去案头」:LibraryView 重挂载,readDirTree 重建左树,工作/图甲 方入树
  await page.getByRole('button', { name: '去案头' }).click()
  await expect(page.getByTestId('file-node-图甲')).toBeVisible()
  // 案头 → 图 → 返回落案头
  await page.getByTestId('file-node-图甲').dblclick()
  await expect(page.getByText('图甲').first()).toBeVisible()
  await page.getByTestId('btn-back').click()
  await expect(page.getByTestId('file-node-图甲')).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('看板退出走砚栏视图组,右上角关闭钮已移除', async ({ page }) => {
  test.setTimeout(30_000)
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.goto('/?e2e=1')
  // 等 harness __zenE2e 挂载(body.spec 同款):evaluate 无 locator 自动等待,暖启动竞态下窗口变量未注入
  await expect(page.getByTestId('btn-new')).toBeVisible()
  await page.evaluate(async () => {
    const w = window as unknown as { __zenE2e: { writeFile(p: string, t: string): Promise<void> } }
    await w.__zenE2e.writeFile('/ws/图乙.md', '# 图乙\n\n## 乙任务 @todo\n')
  })
  await page.getByTestId('file-node-图乙').dblclick()
  await expect(page.getByText('图乙').first()).toBeVisible()
  await page.getByTestId('btn-view-kanban').click()
  await expect(page.getByTestId('kanban-view')).toBeVisible()
  await expect(page.getByTestId('kanban-close')).toHaveCount(0)
  await page.getByTestId('btn-view-mindmap').click()
  await expect(page.getByTestId('kanban-view')).toHaveCount(0)
  expect(pageErrors).toEqual([])
})

test('编辑器砚栏设置齿轮打开设置对话框', async ({ page }) => {
  test.setTimeout(30_000)
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.goto('/?e2e=1')
  // 等 harness __zenE2e 挂载(body.spec 同款):evaluate 无 locator 自动等待,暖启动竞态下窗口变量未注入
  await expect(page.getByTestId('btn-new')).toBeVisible()
  await page.evaluate(async () => {
    const w = window as unknown as { __zenE2e: { writeFile(p: string, t: string): Promise<void> } }
    await w.__zenE2e.writeFile('/ws/图丙.md', '# 图丙\n')
  })
  await page.getByTestId('file-node-图丙').dblclick()
  await expect(page.getByText('图丙').first()).toBeVisible()
  await page.getByTestId('btn-editor-settings').click()
  await expect(page.getByTestId('settings-dialog')).toBeVisible()
  expect(pageErrors).toEqual([])
})
