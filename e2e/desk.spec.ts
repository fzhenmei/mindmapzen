import { expect, test } from '@playwright/test'

// 案头用例走 ?desk=1 预置（见 e2eHarness）：/ws/项目/项目图.md + /ws/根图.md，
// 工作区已设为 /ws，左树与卡片随 setWorkspace 一并生成
test('案头：目录过滤与移动', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')

  // 左树出现预置目录「项目」
  await expect(page.getByTestId('dir-node-项目')).toBeVisible()

  // 目录过滤：点「项目」→ 卡片只剩项目图一张
  await page.getByTestId('dir-node-项目').click()
  await expect(page.getByTestId('map-item')).toHaveCount(1)
  await expect(page.getByTestId('map-item')).toHaveText(/项目图/)

  // 返回全部：两张图恢复，「全部」视图卡片附所在层小字（根图在根）
  await page.getByTestId('dir-node-all').click()
  await expect(page.getByTestId('map-item')).toHaveCount(2)
  await expect(page.getByTestId('map-item').filter({ hasText: '根图' }).getByTestId('map-reldir')).toHaveText('根')

  // 移动流：根图卡 btn-move → move-dialog → 选目录 → 确认。
  // 对话框树复用 dir-node-<name> testid（与左树同名），严格模式下必须以 move-dialog 圈定
  await page.locator('.map-card', { hasText: '根图' }).getByTestId('btn-move').click()
  const dialog = page.getByTestId('move-dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByTestId('dir-node-项目').click()
  await dialog.getByTestId('move-confirm').click()

  // 移动后停留「全部」视图：根图换层（所在层小字 根 → 项目）
  await expect(page.getByTestId('map-item').filter({ hasText: '根图' }).getByTestId('map-reldir')).toHaveText('项目')

  // 项目层：项目图 + 根图两张，根层不再有根图
  await page.getByTestId('dir-node-项目').click()
  await expect(page.getByTestId('map-item')).toHaveCount(2)
  await expect(page.getByTestId('map-item').filter({ hasText: '根图' })).toBeVisible()

  // 磁盘断言（内存 fs）：根图内容移入项目层、根位文件消失
  const moved = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/项目/根图.md',
    ),
  )
  expect(moved).toBe('# 根图\n')
  const rootGone = await page.evaluate(async () => {
    try {
      await (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
        '/ws/根图.md',
      )
      return false
    } catch {
      return true
    }
  })
  expect(rootGone).toBe(true)
})
