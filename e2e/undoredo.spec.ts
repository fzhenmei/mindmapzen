import { expect, test } from '@playwright/test'

// v1.1 回退/重做 E2E（想法5）：砚栏 btn-undo/btn-redo 全链路——建子编辑 → 回退到打开基线
// （子节点消失，md 随保存反映回退）→ 重做恢复（md 复原）。
// 回退次数不写死（引擎节流语义非契约）：以按钮禁用为到达栈底/栈顶的信号循环点击——
// 按钮 DOM 状态滞后于引擎时多点的 BACK/FORWARD 是引擎空栈 no-op（其 data_change(undefined)
// 已被画布过滤，无置脏副作用），终态由自带重试的断言收敛。md 侧往返已由 mdTree 单测覆盖，
// 此处覆盖：基线种子（首条编辑可撤销）+ back_forward 驱动的禁用态 + 撤销结果落盘链。
test('回退与重做：撤销建子编辑回打开基线并随保存落盘，重做恢复', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('撤销测试')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('根主题').first()).toBeVisible()

  // 打开即基线种子（净化尾部播入）：尚无编辑，双钮禁用
  await expect(page.getByTestId('btn-undo')).toBeDisabled()
  await expect(page.getByTestId('btn-redo')).toBeDisabled()

  // 建子节点「要点」：点根激活 → Tab 插入（引擎原生）→ 输入文本 → 点画布空白提交
  await page.getByText('根主题').first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('要点')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()
  await expect(page.getByText('要点').first()).toBeVisible()
  await expect(page.getByTestId('btn-undo')).toBeEnabled()

  // 连续回退至栈底（=打开基线）：子节点随回退消失；栈底撤销钮禁用、重做可用
  for (let i = 0; i < 5; i++) {
    if (!(await page.getByTestId('btn-undo').isEnabled())) break
    await page.getByTestId('btn-undo').click()
  }
  await expect(page.getByTestId('btn-undo')).toBeDisabled()
  await expect(page.getByTestId('btn-redo')).toBeEnabled()
  await expect(page.getByText('要点').first()).toBeHidden()

  // 显式保存：md 反映回退（回到仅根节点）
  await page.keyboard.press('Control+s')
  const mdAfterUndo = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/撤销测试.md',
    ),
  )
  expect(mdAfterUndo).toBe('# 根主题\n')

  // 连续重做到栈顶：插入与文本全部恢复
  for (let i = 0; i < 5; i++) {
    if (!(await page.getByTestId('btn-redo').isEnabled())) break
    await page.getByTestId('btn-redo').click()
  }
  await expect(page.getByTestId('btn-redo')).toBeDisabled()
  await expect(page.getByText('要点').first()).toBeVisible()

  await page.keyboard.press('Control+s')
  const mdAfterRedo = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/撤销测试.md',
    ),
  )
  expect(mdAfterRedo).toBe('# 根主题\n\n## 要点\n')
})

// v1.1 修复回归（审查裁定①）：引擎构造器自播种子（addHistoryOnInit 默认 true，index.js:163-166，
// 节流后入史）捕获的是**未净化构造数据**——与宿主 seedUndoBaseline 的「栈非空即跳过」竞态：
// 引擎先落则基线含 [[..]] 标记，打开含连线文件后回退到栈底会把标记文本带回画布（且自播的
// data_change 会开图误置脏）。宿主以 addHistoryOnInit: false 关闭自播，净化后基线种子成唯一路径。
// 复现路径：UI 建含连线图（同 links.spec）→ 返回重开（净化生效）→ 编辑 → 回退到栈底 →
// 断言标记文本永不重现（缺陷在时基线=构造数据，画布将显示「A [[B]]」）。
test('回退不切回含标记态：含连线文件重开后撤销至栈底，[[..]] 标记不重现', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('撤销连线')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('根主题').first()).toBeVisible()

  // 建子节点 A（文本含 [[B]]）与 B（同 links.spec 的建图流程）
  await page.getByText('根主题').first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('A [[B]]')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()
  await page.getByText('根主题').first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('B')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()
  await page.keyboard.press('Control+s')
  await expect(page.getByText('A', { exact: true }).first()).toBeVisible()

  // 返回案头重开：onReady 净化（显示文本剥离标记）——撤销基线应取净化后现态
  await page.getByTestId('btn-back').click()
  await expect(page.getByTestId('map-item')).toBeVisible()
  await page.getByTestId('map-item').dblclick()
  await expect(page.getByText('A', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('A [[B]]')).toHaveCount(0) // 净化已剥离显示标记

  // 打开即双禁用：基线是唯一历史条目（自播种子若在也只是 index=0，此项不 discriminating，
  // 栈底标记断言才是缺陷探针）
  await expect(page.getByTestId('btn-undo')).toBeDisabled()

  // 编辑一条（插入子节点并输入文本）后回退到栈底（=打开基线）
  await page.getByText('根主题').first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('要点')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()
  await expect(page.getByTestId('btn-undo')).toBeEnabled()
  for (let i = 0; i < 5; i++) {
    if (!(await page.getByTestId('btn-undo').isEnabled())) break
    await page.getByTestId('btn-undo').click()
  }
  await expect(page.getByTestId('btn-undo')).toBeDisabled()
  await expect(page.getByText('要点').first()).toBeHidden()

  // 缺陷探针：栈底基线若是引擎自播的未净化构造数据，此处将显示「A [[B]]」（标记带回画布）
  await expect(page.getByText('A', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('A [[B]]')).toHaveCount(0)
  await expect(page.getByText(/\[\[/)).toHaveCount(0)
})
