import { expect, test } from '@playwright/test'

// 案头用例走 ?desk=1 预置（见 e2eHarness）：/ws/项目/项目图.md + /ws/根图.md，
// 工作区已设为 /ws。2026-09 主区纯预览化两态：未选文件（idle/选中目录）→ 欢迎页；
// 树文件行单击 → 详情态（md 预览）。文件浏览与导航全在左树（目录下直列文件行）
test('案头：目录选中主区欢迎页、树文件行进详情与移动', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')

  // 左树出现预置目录「项目」与直列文件行；初始欢迎页（未选任何）
  await expect(page.getByTestId('dir-node-项目')).toBeVisible()
  await expect(page.getByTestId('file-node-根图')).toBeVisible()
  await expect(page.getByTestId('file-node-项目图')).toBeVisible()
  await expect(page.getByTestId('desk-idle')).toBeVisible()

  // 选中目录「项目」：主区仍是欢迎页（纯预览化：目录态不换主区内容）
  await page.getByTestId('dir-node-项目').click()
  await expect(page.getByTestId('desk-idle')).toBeVisible()
  await expect(page.getByTestId('file-detail')).toHaveCount(0)

  // 树文件行单击 = 选中进详情态（md 预览铺满主区）
  await page.getByTestId('file-node-根图').click()
  await expect(page.getByTestId('file-detail')).toBeVisible()
  await expect(page.getByTestId('md-preview')).toHaveText(/根图/)

  // 移动流：详情页首 btn-move → move-dialog → 选目录 → 确认。
  // 对话框树复用 dir-node-<name> testid（与左树同名），严格模式下必须以 move-dialog 圈定
  await page.getByTestId('btn-move').click()
  const dialog = page.getByTestId('move-dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByTestId('dir-node-项目').click()
  await dialog.getByTestId('move-confirm').click()

  // 移动后左树重读：根图文件行消失于根层，「项目」下两行俱在（树按目录归位）
  await expect(page.getByTestId('file-node-项目图')).toBeVisible()
  await expect(page.getByTestId('file-node-根图')).toBeVisible()

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

// 容器合并改版：窗体缩窄（header 容器 < 680px），详情动作组整组收进「更多」浮层
// （容器查询 @container 纯 CSS 分流，零 JS 测量；常驻 4 钮不受影响）
test('案头：窄窗详情动作收纳进「更多」浮层', async ({ page }) => {
  test.setTimeout(30_000)
  // 900px 视口：侧栏 256px + inset 边距后 header ≈ 628px < 680px 阈值
  await page.setViewportSize({ width: 900, height: 720 })
  await page.goto('/?e2e=1&desk=1')

  // 进详情态：宽组整组收起（btn-move 隐藏），「更多」钮出现
  await page.getByTestId('file-node-根图').click()
  await expect(page.getByTestId('file-detail')).toBeVisible()
  await expect(page.getByTestId('btn-move')).toBeHidden()
  await expect(page.getByTestId('btn-detail-more')).toBeVisible()

  // 浮层平铺全部详情动作；菜单「关闭预览」回欢迎页
  await page.getByTestId('btn-detail-more').click()
  await expect(page.getByTestId('more-btn-detail-back')).toBeVisible()
  await page.getByTestId('more-btn-detail-back').click()
  await expect(page.getByTestId('desk-idle')).toBeVisible()
})

// 2026-09 交互语义：树文件行单击=选中进详情态（md 预览），双击或详情「打开」=进纸面
test('案头：树文件行单击出详情、详情打开进纸面', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')

  // 单击根图文件行：主区切文件详情态（页首即卡头 + markdown 预览）
  await page.getByTestId('file-node-根图').click()
  await expect(page.getByTestId('file-detail')).toBeVisible()
  await expect(page.getByTestId('md-preview')).toHaveText(/根图/)
  // 仍是案头，未进纸面（命令栏不可见）
  await expect(page.getByTestId('zen-bar')).toHaveCount(0)

  // 详情态「关闭预览」回欢迎页；再进详情走「打开」按钮（双击手势的兜底入口）
  await page.getByTestId('btn-detail-back').click()
  await expect(page.getByTestId('desk-idle')).toBeVisible()
  await page.getByTestId('file-node-根图').click()
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

  // 点「项目」行面：选中目录，子树保持展开（file-node-项目图 仍可见）；主区欢迎页
  await page.getByTestId('dir-node-项目').click()
  await expect(page.getByTestId('file-node-项目图')).toBeVisible()
  await expect(page.getByTestId('desk-idle')).toBeVisible()

  // 点「项目」行尾折叠扳机（aria-label）：子树收起（文件行不可见），主区不受影响
  await page.getByRole('button', { name: '折叠「项目」' }).click()
  await expect(page.getByTestId('file-node-项目图')).toBeHidden()
  await expect(page.getByTestId('desk-idle')).toBeVisible()

  // 再点扳机展开恢复
  await page.getByRole('button', { name: '折叠「项目」' }).click()
  await expect(page.getByTestId('file-node-项目图')).toBeVisible()
})

// v2.4 欢迎页：最近打开列表（VSCode Welcome 布局）——打开过的导图出现在右列，点击直达
test('欢迎页：最近打开列表展示与直达', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')

  // 打开根图（树文件行双击）→ 返回案头（落欢迎页）
  await page.getByTestId('file-node-根图').dblclick()
  await expect(page.getByText('根图').first()).toBeVisible()
  await page.getByTestId('btn-back').click()

  // 欢迎页右列出现该图；点击直达编辑器
  const recent = page.getByTestId('recent-item-根图')
  await expect(recent).toBeVisible()
  await recent.click()
  await expect(page.getByText('根图').first()).toBeVisible()
})
