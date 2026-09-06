import { expect, test, type Page } from '@playwright/test'

/** 节点右键菜单 E2E（2026-09 纯鼠标操作）：右键节点弹四项菜单（插入子/插同级/编辑/删除，
 *  与 Tab/Enter/F2/Del 一一对应）→ 各动作落盘校验；根节点同级/删除置灰；空白右键不弹菜单。
 *  md 落盘为树结构权威断言（__zenE2e.readFile，同 multiselect.spec）。 */

const readMd = (page: Page, name: string): Promise<string> =>
  page.evaluate(
    (p) =>
      (window as unknown as { __zenE2e: { readFile(q: string): Promise<string> } }).__zenE2e.readFile(p),
    `/ws/${name}.md`,
  )

/** 建图：根 + 指定子节点（点根 → Tab 插子 → 输入 → 点空白提交），保存并返回图名 */
async function buildTree(page: Page, children: string[]): Promise<string> {
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  const name = `右键菜单${Date.now()}`
  await page.getByTestId('input-name').fill(name)
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText(name).first()).toBeVisible()
  for (const t of children) {
    await page.getByText(name).first().click()
    await page.keyboard.press('Tab')
    await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
    await page.keyboard.type(t)
    await page.getByRole('application').click({ position: { x: 15, y: 15 } })
    await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()
    await expect(page.getByText(t).first()).toBeVisible()
  }
  await page.keyboard.press('Control+s')
  await page.waitForTimeout(300)
  return name
}

/** 断言四项菜单已弹出（标签齐全）并保持打开 */
async function expectMenuOpen(page: Page): Promise<void> {
  await expect(page.getByRole('menu')).toBeVisible()
  for (const label of ['插入子节点', '插入同级节点', '编辑文本', '删除节点']) {
    await expect(page.getByRole('menuitem', { name: label })).toBeVisible()
  }
}

test('右键节点删除：菜单四项弹出，删甲只剩乙，Ctrl+Z 恢复，md 落盘', async ({ page }) => {
  test.setTimeout(30_000)
  const name = await buildTree(page, ['甲', '乙'])
  await page.getByText('甲').first().click({ button: 'right' })
  await expectMenuOpen(page)
  await page.getByTestId('ctx-node-delete').click()
  await expect(page.getByText('甲').first()).toBeHidden()
  await expect(page.getByText('乙').first()).toBeVisible()
  // 一条历史记录可撤销（REMOVE_NODE）
  await page.keyboard.press('Control+z')
  await expect(page.getByText('甲').first()).toBeVisible()
  // 再删一次并保存：md 权威断言
  await page.getByText('甲').first().click({ button: 'right' })
  await page.getByTestId('ctx-node-delete').click()
  await expect(page.getByText('甲').first()).toBeHidden()
  await page.keyboard.press('Control+s')
  expect(await readMd(page, name)).toBe(`# ${name}\n\n## 乙\n`)
})

test('右键插入子节点与编辑文本：甲下添子、乙改名，md 层级落盘', async ({ page }) => {
  test.setTimeout(30_000)
  const name = await buildTree(page, ['甲', '乙'])
  // 插入子节点（等价 Tab）：插入即进编辑，输入提交
  await page.getByText('甲').first().click({ button: 'right' })
  await expectMenuOpen(page)
  await page.getByTestId('ctx-node-child').click()
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('子A')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.getByText('子A').first()).toBeVisible()
  // 编辑文本（等价 F2/双击）：全选替换
  await page.getByText('乙').first().click({ button: 'right' })
  await page.getByTestId('ctx-node-edit').click()
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('乙改')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.getByText('乙改').first()).toBeVisible()
  await page.keyboard.press('Control+s')
  expect(await readMd(page, name)).toBe(`# ${name}\n\n## 甲\n\n### 子A\n\n## 乙改\n`)
})

test('右键根节点：插入子/编辑可用，插入同级与删除置灰', async ({ page }) => {
  test.setTimeout(30_000)
  const name = await buildTree(page, ['甲'])
  await page.getByText(name).first().click({ button: 'right' })
  await expectMenuOpen(page)
  await expect(page.getByTestId('ctx-node-sibling')).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByTestId('ctx-node-delete')).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByTestId('ctx-node-child')).not.toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByTestId('ctx-node-edit')).not.toHaveAttribute('aria-disabled', 'true')
  // Esc 收口
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toBeHidden()
})

test('回归：右键空白不弹菜单（维持清选中现状）', async ({ page }) => {
  test.setTimeout(30_000)
  await buildTree(page, ['甲'])
  await page.getByRole('application').click({ position: { x: 15, y: 15 }, button: 'right' })
  await expect(page.getByRole('menu')).toBeHidden()
})
