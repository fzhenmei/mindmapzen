import { expect, test } from '@playwright/test'

// 方向键导航（M12a Task 3）：引擎 KeyboardNavigation 插件接入后的集成核验。
// 默认 mindmap 布局根居左、子树全右：ArrowRight 从根进入右侧子节点、ArrowLeft 回根。
// 选中态锚点：激活节点的 SVG g 带 active class（MindMapNode.js:579 addClass('active')），
// 事件链与几何语义见 docs/notes/engine-api.md「v1.2 核验」。
test('方向键导航：ArrowRight 入右子节点、ArrowLeft 回根', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('方向键图')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('根主题').first()).toBeVisible()

  // 两个子节点（smoke/collapse 同款录入链路：点根选中 → Tab 建子 → 等编辑框 → 输入 → 点空白提交）
  for (const name of ['分支甲', '分支乙']) {
    await page.getByText('根主题').first().click()
    await page.keyboard.press('Tab')
    await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
    await page.keyboard.type(name)
    await page.getByRole('application').click({ position: { x: 15, y: 15 } })
    await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()
  }
  await expect(page.getByText('分支甲').first()).toBeVisible()
  await expect(page.getByText('分支乙').first()).toBeVisible()

  // 点根激活：无选中时方向键聚焦根，有选中才按几何移动（核验 (a)）
  await page.getByText('根主题').first().click()
  await expect(page.locator('g.active')).toContainText('根主题')

  // ArrowRight：选中移到右侧子节点之一。两子节点与根等距时引擎取 bfsWalk 首见者
  // （checkNodeDis 严格 <，见核验 (a)），故断言「移到两子节点之一」而非具体哪个
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('g.active')).not.toContainText('根主题')
  const activeText = ((await page.locator('g.active').textContent()) ?? '').trim()
  expect(['分支甲', '分支乙']).toContain(activeText)

  // ArrowLeft：根是唯一左侧候选（区域/简单算法兜底命中），选中回到根
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('g.active')).toContainText('根主题')
})

// 编辑框内方向键（核验 (b) 的行为断言）：引擎在编辑框打开期间经 keyCommand.save() 清空快捷键表，
// 框内方向键只剩 contenteditable 原生光标移动。若被劫持：GO_TARGET_NODE → targetNode.active()
// → before_node_active → hideEditTextBox——编辑框会被立即关闭且选中漂移，下列断言即失败。
test('编辑框内方向键：移动光标而非跳节点', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('编辑框方向键')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('根主题').first()).toBeVisible()

  // 一个子节点：若框内 ArrowRight 被劫持，选中会跳到它
  await page.getByText('根主题').first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('分支甲')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()

  // 双击根开编辑框（selectTextOnEnterEditText 默认 false，focusInput 不全选）
  await page.getByText('根主题').first().dblclick()
  const editor = page.locator('div.smm-node-edit-wrap')
  await expect(editor).toBeVisible()

  // 四方向连按：编辑框不关闭、选中仍是根（方向键未触达 GO_TARGET_NODE）
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowUp')
  await expect(editor).toBeVisible()
  await expect(page.locator('g.active')).toContainText('根主题')

  // 框内仍是正常文本编辑（光标语义健在）：Ctrl+A 全选替换后提交
  // （引擎 Control+a 快捷键同样在 save() 清空之列，原生全选在框内生效，核验 (b)）
  await page.keyboard.press('Control+a')
  await page.keyboard.type('根主题印')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(editor).toBeHidden()
  await expect(page.getByText('根主题印').first()).toBeVisible()
})
