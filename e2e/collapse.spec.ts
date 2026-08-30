import { expect, test } from '@playwright/test'

// 验收修复 4：折叠状态持久化回归用例（原探针定位后保留）。
// 与任务稿的差异及依据：引擎 nodeExpandBtn.js renderExpandBtn 对根节点直接 return
// （`if (this.getChildrenLength() <= 0 || this.isRoot) return`），根节点没有折叠钮——
// 故搭三层图（根主题 → 分支甲 → 叶一），折叠「分支甲」并断言其路径 '/根主题/分支甲' 落 sidecar。
// 定位结论：engineTreeToZen 收集 / zenToEngineTree 应用 / getData 均正常；
// 缺陷在事件时序——引擎 data_change 经 addHistory 尾随节流（默认 100ms）延迟发出，
// 干净图上折叠后立即保存会被 writeOnce 的 !dirty 早退吞掉（见第二用例）。
test('折叠状态持久化：折叠→保存→重开保持', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  // M5d 适配：btn-workspace 已随工具栏重构移除（harness 已预设 workspaceDir=/ws）
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('折叠图')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('根主题').first()).toBeVisible()

  // 三层图：根主题 → 分支甲 → 叶一（与冒烟用例同款录入链路：Tab → 等编辑框 → 输入 → 点空白提交）
  await page.getByText('根主题').first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('分支甲')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()
  await expect(page.getByText('分支甲').first()).toBeVisible()

  await page.getByText('分支甲').first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('叶一')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()
  await expect(page.getByText('叶一').first()).toBeVisible()

  // 折叠钮悬停显现（引擎默认 hover 显示）：先点「分支甲」激活（激活态不自动隐藏），再取按钮
  await page.getByText('分支甲').first().hover()
  await page.getByText('分支甲').first().click()
  const expandBtn = page.locator('.smm-expand-btn').first()
  await expect(expandBtn).toBeVisible()
  await expandBtn.click()

  // 折叠后子树应从画布消失
  await expect(page.getByText('叶一')).toHaveCount(0)

  // 立即显式保存（不等 5s 自动保存），读 sidecar 断言折叠路径已收集（save 侧）
  await page.keyboard.press('Control+s')
  await expect(page.getByTestId('save-stamp')).toBeVisible()
  const sidecarRaw = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/折叠图.zen.json',
    ),
  )
  const sidecar = JSON.parse(sidecarRaw) as { collapsed: string[] }
  expect(sidecar.collapsed).toContain('/根主题/分支甲')

  // 返回文件库 → 重新打开 → 折叠应保持（apply 侧）
  await page.getByTestId('btn-back').click()
  // M15：案头初始 idle 空态，先点树根进根目录资源管理器态
  await page.getByTestId('dir-node-all').click()
  await expect(page.getByTestId('map-item')).toBeVisible()
  await page.getByTestId('map-item').dblclick()
  await expect(page.getByText('根主题').first()).toBeVisible()
  await expect(page.getByText('叶一')).toHaveCount(0)
})

// 竞态回归（用户上报根因）：干净图上「折叠/展开 → 同一瞬时显式保存」不得被 !dirty 早退吞掉。
// 场景取「重开后的全新引擎」作确定性前置：无残留自动保存定时器、dirty 必为假，
// 规避编辑残留的节流补发事件与在途保存轮对结果的干扰（探针定位期已验证会偶发救场）。
test('折叠竞态：干净图同瞬时折叠+保存不丢失', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  // M5d 适配：btn-workspace 已随工具栏重构移除（harness 已预设 workspaceDir=/ws）
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('竞态图')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('根主题').first()).toBeVisible()

  await page.getByText('根主题').first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('分支甲')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()

  await page.getByText('分支甲').first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('叶一')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()

  // 折叠「分支甲」并保存，随后返回文件库重开——得到干净图 + 全新引擎（零定时器）的受控起点
  await page.getByText('分支甲').first().hover()
  await page.getByText('分支甲').first().click()
  await expect(page.locator('.smm-expand-btn').first()).toBeVisible()
  await page.locator('.smm-expand-btn').first().click()
  await expect(page.getByTestId('dirty-badge')).toBeVisible()
  await page.keyboard.press('Control+s')
  await expect(page.getByTestId('save-stamp')).toBeVisible()
  await expect(page.getByTestId('dirty-badge')).toHaveCount(0)
  await page.getByTestId('btn-back').click()
  // M15：案头初始 idle 空态，先点树根进根目录资源管理器态
  await page.getByTestId('dir-node-all').click()
  await expect(page.getByTestId('map-item')).toBeVisible()
  await page.getByTestId('map-item').dblclick()
  await expect(page.getByText('根主题').first()).toBeVisible()

  // 同一 JS 任务连发「展开点击 + Ctrl+S」（引擎 data_change 尾随节流 100ms 窗内）：
  // 修复后展开命令同步置脏，Ctrl+S 落盘 collapsed:[]；修复前 !dirty 早退，sidecar 残留旧值
  await page.getByText('分支甲').first().hover()
  await expect(page.locator('.smm-expand-btn').first()).toBeVisible()
  await page.evaluate(() => {
    document
      .querySelector('.smm-expand-btn')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
  })
  await expect(page.getByTestId('save-stamp')).toBeVisible()
  await expect(page.getByTestId('dirty-badge')).toHaveCount(0)

  const sidecarRaw = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/竞态图.zen.json',
    ),
  )
  const sidecar = JSON.parse(sidecarRaw) as { collapsed: string[] }
  expect(sidecar.collapsed).toEqual([])

  // 重开验证展开态被持久化（子树重新可见）
  await page.getByTestId('btn-back').click()
  // M15：案头初始 idle 空态，先点树根进根目录资源管理器态
  await page.getByTestId('dir-node-all').click()
  await expect(page.getByTestId('map-item')).toBeVisible()
  await page.getByTestId('map-item').dblclick()
  await expect(page.getByText('分支甲').first()).toBeVisible()
})
