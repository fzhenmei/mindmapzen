import { expect, test, type Page } from '@playwright/test'

/** 圈选多节点 E2E（2026-09）：右键 / Ctrl+左键圈选 → 多选浮条计数 → 批量删除（浮条按钮 /
 *  Del 键）→ Ctrl+Z 撤销恢复；圈选后批量拖拽 reparent；回归：左键空白拖拽仍平移画布、不触发圈选。
 *  md 落盘为树结构权威断言（__zenE2e.readFile，同 undoredo.spec）。
 *  默认布局（logicalStructure 右向）：根在左、子节点右侧纵向排列——圈「甲乙」可避开根与下方「丙丁」。
 *  圈选框拖动时引擎 AutoMove 距边 <50px 会自动滚屏，故框坐标统一留 60px 边距。 */

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
  const name = `圈选${Date.now()}`
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

/** 全画布圈选（覆盖所有节点含根）：ctrl=true 走 Ctrl+左键，否则裸右键。
 *  mouse.up 前持留 >300ms（引擎 Select.checkInNodes 节流窗）：拖拽期间节流窗内的
 *  调用被丢弃、命中检测延迟到窗尾才以最新坐标执行——快速甩拖 + 高负载下曾出现
 *  「mouseup 先于最终矩形评估」的时序竞态（浮条未渲染，2026-09 抖动）。持留跨过
 *  节流窗让最终矩形在松键前完成选择 + mouseup 的变更兜底即时发射，输入侧确定性化 */
async function marqueeAll(page: Page, ctrl: boolean): Promise<void> {
  if (ctrl) await page.keyboard.down('Control')
  const box = (await page.getByRole('application').boundingBox())!
  await page.mouse.move(box.x + 60, box.y + 60)
  await page.mouse.down({ button: ctrl ? 'left' : 'right' })
  await page.mouse.move(box.x + box.width - 60, box.y + box.height - 60, { steps: 12 })
  await page.waitForTimeout(350)
  await page.mouse.up({ button: ctrl ? 'left' : 'right' })
  if (ctrl) await page.keyboard.up('Control')
}

test('右键圈选全部节点：浮条计数，浮条删除只剩根，Ctrl+Z 恢复', async ({ page }) => {
  test.setTimeout(30_000)
  const name = await buildTree(page, ['甲', '乙', '丙'])
  await marqueeAll(page, false)
  await expect(page.getByTestId('multi-select-bar')).toBeVisible()
  await expect(page.getByTestId('multi-select-bar')).toContainText('已选 4 个节点')
  await page.getByTestId('multi-select-delete').click()
  await expect(page.getByText('甲').first()).toBeHidden()
  await expect(page.getByText('乙').first()).toBeHidden()
  await expect(page.getByText('丙').first()).toBeHidden()
  // 撤销恢复三子（REMOVE_NODE 一条历史记录）
  await page.keyboard.press('Control+z')
  await expect(page.getByText('甲').first()).toBeVisible()
  await expect(page.getByText('丙').first()).toBeVisible()
  await page.keyboard.press('Control+s')
  expect(await readMd(page, name)).toBe(`# ${name}\n\n## 甲\n\n## 乙\n\n## 丙\n`)
})

test('Ctrl+左键圈选：浮条计数，Del 键批删，左键点空白清选后浮条消失', async ({ page }) => {
  test.setTimeout(30_000)
  // 常驻取证（2026-09 抖动排查）：本用例曾全量长跑下偶发「圈选生效但浮条未渲染」
  // （activeCount 未达 2+），取证条件下 7 轮未复现；pageerror/console 落 runner 输出，
  // 再现时现场自留（根因未定，见 memory/e2e-flaky-known）
  page.on('pageerror', (e) => console.log('[pageerror]', String(e)))
  const name = await buildTree(page, ['甲', '乙'])
  await marqueeAll(page, true)
  await expect(page.getByTestId('multi-select-bar')).toContainText('已选 3 个节点')
  // 键盘批删（引擎原生 Del → REMOVE_NODE）
  await page.keyboard.press('Delete')
  await expect(page.getByText('甲').first()).toBeHidden()
  await expect(page.getByText('乙').first()).toBeHidden()
  await page.keyboard.press('Control+z')
  await expect(page.getByText('乙').first()).toBeVisible()
  // 再次圈选后点空白：draw_click 清空选中，浮条随之消失（既有语义回归）
  await marqueeAll(page, true)
  await expect(page.getByTestId('multi-select-bar')).toContainText('已选 3 个节点')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.getByTestId('multi-select-bar')).toBeHidden()
  await page.keyboard.press('Control+s')
  expect(await readMd(page, name)).toBe(`# ${name}\n\n## 甲\n\n## 乙\n`)
})

test('圈选甲乙拖到丙：批量 reparent 成丙的子节点，md 层级落盘', async ({ page }) => {
  test.setTimeout(30_000)
  const name = await buildTree(page, ['甲', '乙', '丙', '丁'])
  const app = (await page.getByRole('application').boundingBox())!
  const root = (await page.getByText(name).first().boundingBox())!
  const a = (await page.getByText('甲').first().boundingBox())!
  const b = (await page.getByText('乙').first().boundingBox())!
  const c = (await page.getByText('丙').first().boundingBox())!
  // 右向布局：x 从根右缘外起、y 到乙下缘止——圈中甲乙，避开左侧的根与下方的丙丁
  await page.mouse.move(root.x + root.width + 6, Math.min(a.y, b.y) - 4)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(app.x + app.width - 60, Math.max(a.y + a.height, b.y + b.height) + 4, { steps: 10 })
  await page.mouse.up({ button: 'right' })
  await expect(page.getByTestId('multi-select-bar')).toContainText('已选 2 个节点')
  // 拖甲（选中集内任一节点）到丙中心：甲乙一起 reparent（Drag 按激活列表拖全部顶层祖先）
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 8 })
  await page.waitForTimeout(400) // Drag 碰撞检测 300ms 节流窗口
  await page.mouse.up()
  await page.waitForTimeout(300)
  await page.keyboard.press('Control+s')
  expect(await readMd(page, name)).toBe(`# ${name}\n\n## 丙\n\n### 甲\n\n### 乙\n\n## 丁\n`)
})

test('回归：左键空白拖拽仍平移画布，不触发圈选', async ({ page }) => {
  test.setTimeout(30_000)
  await buildTree(page, ['甲'])
  const before = (await page.getByText('甲').first().boundingBox())!
  const app = (await page.getByRole('application').boundingBox())!
  await page.mouse.move(app.x + 30, app.y + 30)
  await page.mouse.down()
  await page.mouse.move(app.x + 130, app.y + 110, { steps: 8 })
  await page.mouse.up()
  const after = (await page.getByText('甲').first().boundingBox())!
  expect(after.x).toBeGreaterThan(before.x + 50)
  expect(after.y).toBeGreaterThan(before.y + 50)
  await expect(page.getByTestId('multi-select-bar')).toBeHidden()
})
