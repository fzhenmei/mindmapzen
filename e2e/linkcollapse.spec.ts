import { expect, test } from '@playwright/test'

// 收起态连线回归（2026-09 数据丢失修复）：净化/重建曾走渲染树（仅可见节点），收起子树内的
// 连线源节点不被收割/剥离——重开展开后文本残留 [[..]] 标记、targets 未写、无线；残留标记随
// 文本编辑被吞（连线唯一事实源），下轮保存 md 不再注入 → 连线永久丢失。
// 修复：applyRegistryToEngine / rebuildEngineLinks 走数据树（renderer.renderTree，含隐藏子树）。
const LINE_PATHS = '.smm-associative-line-container > path'

/** 读取内存 FS 中的 md（harness __zenE2e.readFile） */
const readMd = (page: import('@playwright/test').Page, path: string): Promise<string> =>
  page.evaluate(
    (p) =>
      (window as unknown as { __zenE2e: { readFile(q: string): Promise<string> } }).__zenE2e.readFile(p),
    path,
  )

test('收起态连线：隐藏源节点全量净化，展开即复现（不残留标记、不等自动保存）', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('收起丢线')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('收起丢线').first()).toBeVisible()

  // 结构：根 → P → A（连线源）、根 → B（连线目标）。Tab 建子 → 等编辑框 → 输入 → 点空白提交
  const addChild = async (parent: string, text: string) => {
    await page.getByText(parent, { exact: true }).first().click()
    await page.keyboard.press('Tab')
    await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
    await page.keyboard.type(text)
    await page.getByRole('application').click({ position: { x: 15, y: 15 } })
    await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible()
  }
  await addChild('收起丢线', 'P')
  await addChild('P', 'A')
  await addChild('收起丢线', 'B')

  // 桥接建线 A → B（操作条连线按钮）
  await page.getByText('A', { exact: true }).first().click()
  await page.getByTestId('node-action-link').click()
  await page.getByText('B', { exact: true }).first().click()
  await expect(page.locator(LINE_PATHS)).toHaveCount(2)

  // 收起 P：A 及其连线从画布消失；保存（md 含 [[B]] 标记——保存链收割本就走全量 getData 快照）
  await page.getByText('P', { exact: true }).first().hover()
  await page.getByText('P', { exact: true }).first().click()
  await expect(page.locator('.smm-expand-btn').first()).toBeVisible()
  await page.locator('.smm-expand-btn').first().click()
  await expect(page.getByText('A', { exact: true })).toHaveCount(0)
  await expect(page.locator(LINE_PATHS)).toHaveCount(0)
  await page.keyboard.press('Control+s')
  await expect(page.getByTestId('save-stamp')).toBeVisible()
  await expect
    .poll(() => readMd(page, '/ws/收起丢线.md'), { timeout: 10_000 })
    .toBe('# 收起丢线\n\n## P\n\n### A [[B]]\n\n## B\n')

  // 重开（A 隐藏）：净化走数据树，隐藏节点标记已剥离、targets 已落位
  await page.getByTestId('btn-back').click()
  // 主区纯预览化：树文件行双击重开
  await page.getByTestId('file-node-收起丢线').dblclick()
  await expect(page.getByText('P', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('A', { exact: true })).toHaveCount(0) // 折叠态保持

  // 展开 P：A 文本干净（无 [[B]] 残留）+ 连线立即复现（数据树 targets → 渲染自动画线，不等自动保存）
  await page.getByText('P', { exact: true }).first().hover()
  await page.getByText('P', { exact: true }).first().click()
  await expect(page.locator('.smm-expand-btn').first()).toBeVisible()
  await page.locator('.smm-expand-btn').first().click()
  await expect(page.getByText('A', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('A [[B]]')).toHaveCount(0) // 标记不残留画布
  await expect(page.locator(LINE_PATHS)).toHaveCount(2) // 连线即刻复现

  // 终态：md 标记仍在（连线事实源未丢）
  const md = await readMd(page, '/ws/收起丢线.md')
  expect(md).toContain('[[B]]')
})

test('收起态连线：重开展开后立即编辑源节点文本，连线不丢失（永久丢失路径回归）', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('编辑吞线')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('编辑吞线').first()).toBeVisible()

  const addChild = async (parent: string, text: string) => {
    await page.getByText(parent, { exact: true }).first().click()
    await page.keyboard.press('Tab')
    await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
    await page.keyboard.type(text)
    await page.getByRole('application').click({ position: { x: 15, y: 15 } })
    await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible()
  }
  await addChild('编辑吞线', 'P')
  await addChild('P', 'A')
  await addChild('编辑吞线', 'B')

  await page.getByText('A', { exact: true }).first().click()
  await page.getByTestId('node-action-link').click()
  await page.getByText('B', { exact: true }).first().click()
  await expect(page.locator(LINE_PATHS)).toHaveCount(2)

  // 收起 P → 保存 → 重开（修复前：隐藏节点净化遗漏，A 文本残留 [[B]]、注册表缺条目）
  await page.getByText('P', { exact: true }).first().hover()
  await page.getByText('P', { exact: true }).first().click()
  await expect(page.locator('.smm-expand-btn').first()).toBeVisible()
  await page.locator('.smm-expand-btn').first().click()
  await expect(page.getByText('A', { exact: true })).toHaveCount(0)
  await page.keyboard.press('Control+s')
  await expect(page.getByTestId('save-stamp')).toBeVisible()
  await page.getByTestId('btn-back').click()
  // 主区纯预览化：树文件行双击重开
  await page.getByTestId('file-node-编辑吞线').dblclick()
  await expect(page.getByText('P', { exact: true }).first()).toBeVisible()

  // 展开 P → 立即编辑 A 文本提交（不等 5s 自动保存自愈——修复前残留标记随编辑被吞，线永久丢失）
  await page.getByText('P', { exact: true }).first().hover()
  await page.getByText('P', { exact: true }).first().click()
  await expect(page.locator('.smm-expand-btn').first()).toBeVisible()
  await page.locator('.smm-expand-btn').first().click()
  const aNode = page.getByText('A', { exact: true }).first()
  await expect(aNode).toBeVisible()
  await aNode.dblclick()
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('A2') // 改名：连线事实在 targets/注册表上，不随文本走
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()

  // 保存 → 重开：md 标记随 uid 注入（改名不丢线）、连线复现
  await page.keyboard.press('Control+s')
  await expect(page.getByTestId('save-stamp')).toBeVisible()
  await expect
    .poll(() => readMd(page, '/ws/编辑吞线.md'), { timeout: 10_000 })
    .toBe('# 编辑吞线\n\n## P\n\n### A2 [[B]]\n\n## B\n')
  await page.getByTestId('btn-back').click()
  // 主区纯预览化：树文件行双击重开
  await page.getByTestId('file-node-编辑吞线').dblclick()
  await expect(page.getByText('A2', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('A2 [[B]]')).toHaveCount(0) // 净化剥离照常
  await expect(page.locator(LINE_PATHS)).toHaveCount(2) // 连线复现
})
