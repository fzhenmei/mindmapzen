import { expect, test } from '@playwright/test'

// 案头用例走 ?desk=1 预置（见 e2eHarness）：/ws/项目/项目图.md + /ws/根图.md，
// 工作区已设为 /ws。M15 三态：进案头 idle 空态 → 点目录进资源管理器态（文件夹 +
// 导图大图标 tile）→ 点文件进详情态（摘要 + md 预览）
test('案头：三态切换、目录过滤与移动', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')

  // 左树出现预置目录「项目」；初始 idle 空态（未选任何）
  await expect(page.getByTestId('dir-node-项目')).toBeVisible()
  await expect(page.getByTestId('desk-idle')).toBeVisible()

  // 目录态：点「项目」→ 该层导图 tile 一张
  await page.getByTestId('dir-node-项目').click()
  await expect(page.getByTestId('map-item')).toHaveCount(1)
  await expect(page.getByTestId('map-item')).toHaveText(/项目图/)

  // 返回根：根层导图一张 + 子目录「项目」文件夹 tile（资源管理器模式）
  await page.getByTestId('dir-node-all').click()
  await expect(page.getByTestId('map-item')).toHaveCount(1)
  await expect(page.getByTestId('folder-tile-项目')).toBeVisible()

  // 文件夹 tile 单击 = 选中该目录（左树联动，进项目层）
  await page.getByTestId('folder-tile-项目').click()
  await expect(page.getByTestId('map-item')).toHaveCount(1)
  await expect(page.getByTestId('map-item')).toHaveText(/项目图/)

  // 移动流：回根层，根图 tile btn-move → move-dialog → 选目录 → 确认。
  // 对话框树复用 dir-node-<name> testid（与左树同名），严格模式下必须以 move-dialog 圈定
  await page.getByTestId('dir-node-all').click()
  await page.locator('.map-card', { hasText: '根图' }).getByTestId('btn-move').click()
  const dialog = page.getByTestId('move-dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByTestId('dir-node-项目').click()
  await dialog.getByTestId('move-confirm').click()

  // 移动后停留根视图：根层不再有根图 tile（只剩文件夹 tile），不回全部视图
  await expect(page.getByTestId('map-item')).toHaveCount(0)
  await expect(page.getByTestId('folder-tile-项目')).toBeVisible()

  // 项目层：项目图 + 根图两张
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

// M15 交互语义：tile/树文件行单击=选中进详情态（摘要 + md 预览），双击或详情「打开」=进纸面
test('案头：tile 单击出详情、详情打开进纸面', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')

  // 进根目录资源管理器态，单击根图 tile：主区切文件详情态（摘要条 + markdown 预览）
  await page.getByTestId('dir-node-all').click()
  await page.getByTestId('map-item').filter({ hasText: '根图' }).click()
  await expect(page.getByTestId('file-detail')).toBeVisible()
  await expect(page.getByTestId('md-preview')).toHaveText(/根图/)
  await expect(page.getByTestId('detail-size')).toHaveText(/B$/) // 摘要条含大小元信息
  // 仍是案头，未进纸面（命令栏不可见）
  await expect(page.getByTestId('zen-bar')).toHaveCount(0)

  // 详情态「返回目录」回根资源管理器；再进详情走「打开」按钮（双击手势的兜底入口）
  await page.getByTestId('btn-detail-back').click()
  await expect(page.getByTestId('map-item')).toHaveCount(1)
  await page.getByTestId('map-item').filter({ hasText: '根图' }).click()
  await expect(page.getByTestId('file-detail')).toBeVisible()
  await page.getByTestId('btn-detail-open').click()
  await expect(page.getByText('根图').first()).toBeVisible()
})

test('案头：目录树含文件行，双击文件行打开进纸面', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')

  // 树成为完整文件视图（collapsible 文件树默认全展开）：根下与子目录下的 .md 均有文件行
  await expect(page.getByTestId('file-node-根图')).toBeVisible()
  await expect(page.getByTestId('file-node-项目图')).toBeVisible()

  // 双击根图文件行 → 打开进纸面
  await page.getByTestId('file-node-根图').dblclick()
  await expect(page.getByText('根图').first()).toBeVisible()
})

test('案头：文件树折叠扳机收起子树、行面选中不折叠', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')

  // 点「项目」行面：选中进目录态，子树保持展开（file-node-项目图 仍可见）
  await page.getByTestId('dir-node-项目').click()
  await expect(page.getByTestId('map-item')).toHaveCount(1)
  await expect(page.getByTestId('file-node-项目图')).toBeVisible()

  // 点「项目」行尾折叠扳机（aria-label）：子树收起（文件行不可见），目录态不受影响
  await page.getByRole('button', { name: '折叠「项目」' }).click()
  await expect(page.getByTestId('file-node-项目图')).toBeHidden()
  await expect(page.getByTestId('map-item')).toHaveCount(1)

  // 再点扳机展开恢复
  await page.getByRole('button', { name: '折叠「项目」' }).click()
  await expect(page.getByTestId('file-node-项目图')).toBeVisible()
})
