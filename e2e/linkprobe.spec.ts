import { expect, test, type Page } from '@playwright/test'

/** 诊断探针（临时，勿合入）：连线"有时不能"——用不同时序组合复现并打印内部态。
 *  每个用例建 A（左上）与 B（右下）两张独立图外，全部走真实 UI。 */
const LINE_PATHS = '.smm-associative-line-container > path'

async function buildAB(page: Page) {
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill(`探针${Date.now()}`)
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('根主题').first()).toBeVisible()

  // 建子节点 A（根的左子）与 B（根的右子）——布局自动左右分开
  for (const t of ['甲', '乙']) {
    await page.getByText('根主题').first().click()
    await page.keyboard.press('Tab')
    await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
    await page.keyboard.type(t)
    await page.getByRole('application').click({ position: { x: 15, y: 15 } })
    await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()
  }
  await page.keyboard.press('Control+s')
  await page.waitForTimeout(300)
}

async function state(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const w = window as unknown as { __zenProbe?: () => Record<string, unknown> }
    return w.__zenProbe?.() ?? {}
  })
}

test.describe('连线时序探针', () => {
  test('场景A：进建线后立即点目标（<50ms，不移动）', async ({ page }) => {
    await buildAB(page)
    await page.getByText('甲').first().click()
    await page.getByTestId('node-action-link').click()
    await page.getByText('乙').first().click({ timeout: 2_000 }).catch(() => {})
    console.log('A-state', JSON.stringify(await state(page)))
    const n = await page.locator(LINE_PATHS).count()
    console.log('A-lines', n)
    expect(true).toBe(true) // 探针不设断言，只取证据
  })

  test('场景B：进建线后移动鼠标再点（150ms，命中节点的 hover 高亮后）', async ({ page }) => {
    await buildAB(page)
    await page.getByText('甲').first().click()
    await page.getByTestId('node-action-link').click()
    const b = page.getByText('乙').first()
    await b.hover()
    await page.waitForTimeout(150)
    await b.click({ timeout: 2_000 }).catch(() => {})
    console.log('B-state', JSON.stringify(await state(page)))
    console.log('B-lines', await page.locator(LINE_PATHS).count())
  })

  test('场景C：进建线后大幅移动再点（400ms）', async ({ page }) => {
    await buildAB(page)
    await page.getByText('甲').first().click()
    await page.getByTestId('node-action-link').click()
    await page.getByRole('application').hover({ position: { x: 200, y: 300 } })
    await page.waitForTimeout(400)
    const b = page.getByText('乙').first()
    await b.hover()
    await page.waitForTimeout(120)
    await b.click({ timeout: 2_000 }).catch(() => {})
    console.log('C-state', JSON.stringify(await state(page)))
    console.log('C-lines', await page.locator(LINE_PATHS).count())
  })

  test('场景D：目标为根节点', async ({ page }) => {
    await buildAB(page)
    await page.getByText('甲').first().click()
    await page.getByTestId('node-action-link').click()
    await page.getByText('根主题').first().click({ timeout: 2_000 }).catch(() => {})
    console.log('D-state', JSON.stringify(await state(page)))
    console.log('D-lines', await page.locator(LINE_PATHS).count())
  })

  test('场景E：同一对连续画两次（重复链）', async ({ page }) => {
    await buildAB(page)
    await page.getByText('甲').first().click()
    await page.getByTestId('node-action-link').click()
    const b = page.getByText('乙').first()
    await b.hover()
    await page.waitForTimeout(120)
    await b.click().catch(() => {})
    await page.waitForTimeout(200)
    await page.getByText('甲').first().click()
    await page.getByTestId('node-action-link').click().catch(() => {})
    await b.click().catch(() => {})
    console.log('E-state', JSON.stringify(await state(page)))
    console.log('E-lines', await page.locator(LINE_PATHS).count())
  })
})

test('场景F：目标上按下后微移 6px 再抬起（真实鼠标抖动 → Drag 插件截胡？）', async ({ page }) => {
  await buildAB(page)
  await page.getByText('甲').first().click()
  await page.getByTestId('node-action-link').click()
  const b = page.getByText('乙').first()
  const box = await b.boundingBox()
  if (box) {
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 6, cy + 4, { steps: 3 })
    await page.mouse.up()
  }
  await page.waitForTimeout(300)
  console.log('F-state', JSON.stringify(await state(page)))
  console.log('F-lines', await page.locator(LINE_PATHS).count())
})

test('场景G：源节点上按下后微移再抬（建线按钮前的抖动使源被拖走）', async ({ page }) => {
  await buildAB(page)
  const a = page.getByText('甲').first()
  const box = await a.boundingBox()
  if (box) {
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 5, cy + 3, { steps: 3 })
    await page.mouse.up()
  }
  await page.waitForTimeout(200)
  const barVisible = await page.getByTestId('node-action-link').isVisible().catch(() => false)
  console.log('G-barVisibleAfterDragClick', barVisible)
  if (barVisible) {
    await page.getByTestId('node-action-link').click()
    const b = page.getByText('乙').first()
    await b.hover(); await page.waitForTimeout(100); await b.click()
    await page.waitForTimeout(300)
    console.log('G-lines', await page.locator(LINE_PATHS).count())
  }
})

test('场景H：目标名不唯一（两节点同名，连其中之一）', async ({ page }) => {
  await buildAB(page)
  // 再建一个与乙同名的节点（根→Tab→丙 改名为 乙）
  await page.getByText('根主题').first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('乙')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await page.keyboard.press('Control+s')
  await page.waitForTimeout(300)
  await page.getByText('甲').first().click()
  await page.getByTestId('node-action-link').click()
  const targets = page.getByText('乙', { exact: true })
  console.log('H-targetCount', await targets.count())
  await targets.first().hover()
  await page.waitForTimeout(120)
  await targets.first().click()
  await page.waitForTimeout(400)
  const hn = await page.locator(LINE_PATHS).count()
  console.log('H-lines', hn)
  expect(hn).toBeGreaterThan(0)
  console.log('H-state', JSON.stringify(await state(page)))
})

test('场景I：先折叠根再展开后连（渲染树时点）', async ({ page }) => {
  await buildAB(page)
  // 折叠根（点根的展开钮）
  const btn = page.locator('.smm-expand-btn').first()
  if (await btn.count()) {
    await btn.click()
    await page.waitForTimeout(200)
    await btn.click()
    await page.waitForTimeout(200)
  }
  await page.getByText('甲').first().click()
  await page.getByTestId('node-action-link').click()
  const b = page.getByText('乙').first()
  await b.hover(); await page.waitForTimeout(120); await b.click()
  await page.waitForTimeout(300)
  console.log('I-lines', await page.locator(LINE_PATHS).count())
})
