import { expect, test } from '@playwright/test'

// 节点搜索（2026-09）：Ctrl+F / 砚栏搜索钮呼出顶部浮层，全树候选（含收起隐藏子树）
// 输入即过滤、Enter 跳转（展开收起祖先 + 居中 + 激活高亮）、浮层保持连续跳、Esc 关。
test('节点搜索:收起子树可搜,跳转展开定位,浮层保持', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('搜索图')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('搜索图').first()).toBeVisible()

  // 两层:根 > 分支甲 > 目标乙(Tab 录入链路同 collapse.spec)
  await page.getByText('搜索图').first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('分支甲')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.getByText('分支甲').first()).toBeVisible()

  await page.getByText('分支甲').first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('目标乙')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()
  await expect(page.getByText('目标乙').first()).toBeVisible()

  // 收起分支甲(悬停折叠钮链路同 collapse.spec)——目标乙进隐藏子树
  await page.getByText('分支甲').first().hover()
  await page.getByText('分支甲').first().click()
  await expect(page.locator('.smm-expand-btn').first()).toBeVisible()
  await page.locator('.smm-expand-btn').first().click()
  await expect(page.getByText('目标乙')).toHaveCount(0)

  // Ctrl+F 呼出:收起隐藏子树里的节点仍在候选里(全树快照)
  await page.keyboard.press('Control+f')
  await expect(page.getByTestId('node-search-input')).toBeVisible()
  await page.getByTestId('node-search-input').fill('目标')
  await expect(page.getByTestId('node-search-item')).toHaveCount(1)
  await expect(page.getByTestId('node-search-item')).toContainText('目标乙')
  await expect(page.getByTestId('node-search-count')).toHaveText('1 个匹配节点')

  // Enter 跳转:展开收起祖先、节点回画布,浮层保持(输入框仍在)
  await page.keyboard.press('Enter')
  await expect(page.getByText('目标乙').first()).toBeVisible()
  await expect(page.getByTestId('node-search-input')).toBeVisible()

  // Esc 关闭浮层
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('node-search-input')).toHaveCount(0)
})

test('节点搜索:砚栏按钮路径呼出 + 空态', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('搜索空态图')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('搜索空态图').first()).toBeVisible()

  // 砚栏搜索钮呼出(Ctrl+F 的按钮路径)
  await page.getByTestId('btn-search').click()
  await expect(page.getByTestId('node-search-input')).toBeVisible()
  // 空候选出空态(输入过滤无匹配)
  await page.getByTestId('node-search-input').fill('不存在的词')
  await expect(page.getByTestId('node-search-empty')).toBeVisible()
  await page.keyboard.press('Escape')
})
