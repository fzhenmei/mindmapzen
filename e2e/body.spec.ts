import { expect, test } from '@playwright/test'

// 正文面板端到端（2026-09 写作）：面板真实键入 → 关面板冲刷防抖 → 显式保存落盘 →
// 返回案头重开正文仍在。md 侧往返（正文块 ⇄ data.body）已由 mdTree 单测钉死，
// 此处覆盖面板接线（选中载入/防抖写回/flush）与落盘链路（harness 沿用 note.spec 模式）。
// 键入驱动走真实交互：点击 .ProseMirror 聚焦后 keyboard.type——引擎 KeyCommand 的
// defaultEnableCheck 只认 body/引擎编辑框目标，宿主 window 监听亦放行 contenteditable，
// 面板内键入不会误触画布快捷键（Tab 插节点等）。
test('正文：面板写入→保存→回案头重开正文仍在、md 含正文段', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('正文测试')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('正文测试').first()).toBeVisible()

  // 建子节点「要点」（note.spec 模式：点根 → Tab → 等编辑框 → 输入 → 点空白提交）
  await page.getByText('正文测试').first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('要点')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()

  // 选中「要点」→ 开面板 → 点击编辑区聚焦 → 真实键入正文
  await page.getByText('要点').first().click()
  await page.getByTestId('btn-body').click()
  await expect(page.getByTestId('body-panel')).toBeVisible()
  const editor = page.getByTestId('body-editor').locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('围绕要点的论述。')
  // 字数条即时随键入走（中文字数口径：去空白码点数，含句号共 8）
  await expect(page.getByTestId('body-wordcount')).toHaveText('8 字')

  // 关面板即冲刷防抖窗内草稿（SET_NODE_DATA 置脏）→ 显式保存 → 读盘精确断言
  await page.getByTestId('body-close').click()
  await expect(page.getByTestId('body-panel')).toHaveCount(0)
  await expect(page.getByTestId('dirty-badge')).toBeVisible()
  await page.keyboard.press('Control+s')
  await expect(page.getByTestId('save-stamp')).toBeVisible()
  // serialize 顺序：节点行 → 正文（原样块）→ 备注 → 子结构；zen_body 角标不进 md
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/正文测试.md',
    ),
  )
  expect(md).toBe('# 正文测试\n\n## 要点\n围绕要点的论述。\n')

  // 返回案头 → 重开（面板已收起，「要点」文本唯一指画布节点）→ 正文随 data.body 载回
  await page.getByTestId('btn-back').click()
  await page.getByTestId('file-node-正文测试').dblclick()
  await expect(page.getByText('要点').first()).toBeVisible()
  await page.getByText('要点').first().click()
  await page.getByTestId('btn-body').click()
  await expect(page.getByTestId('body-panel')).toBeVisible()
  await expect(page.getByTestId('body-editor')).toContainText('围绕要点的论述。')
  await expect(page.getByTestId('body-wordcount')).toHaveText('8 字')
})

// 深层门禁（spec v1 深度限制，Task 6 留下的真机验证）：根起连按 Tab×6 建到第 7 层
// （layerIndex=6，md 序列化 ≥7 深进列表层），选中开面板——空态文案 + 只读不可键入。
// 视口加宽到 1920：引擎无自动平移，7 层单链的末层节点须在视口内可点（节点名单字压缩纵深）。
test('深层门禁：第 7 层节点开面板空态且不可编辑', async ({ page }) => {
  test.setTimeout(30_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('深层门禁')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('深层门禁').first()).toBeVisible()

  // 逐层建链（每层：点父节点 → Tab → 等编辑框 → 输入 → 点空白提交）
  let parent = '深层门禁'
  for (const name of ['甲', '乙', '丙', '丁', '戊', '己']) {
    await page.getByText(parent).first().click()
    await page.keyboard.press('Tab')
    await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
    await page.keyboard.type(name)
    await page.getByRole('application').click({ position: { x: 15, y: 15 } })
    await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()
    parent = name
  }

  // 选中第 7 层「己」开面板：空态文案出现，编辑器只读（contenteditable=false），键入无效
  await page.getByText('己').first().click()
  await page.getByTestId('btn-body').click()
  await expect(page.getByTestId('body-panel')).toBeVisible()
  await expect(page.getByTestId('body-empty')).toContainText('深层列表节点暂不支持正文')
  const editor = page.getByTestId('body-editor').locator('.ProseMirror')
  await expect(editor).toHaveAttribute('contenteditable', 'false')
  await editor.click()
  await page.keyboard.type('不应写入')
  await expect(page.getByTestId('body-wordcount')).toHaveText('0 字')
  await expect(page.getByTestId('body-editor')).not.toContainText('不应写入')
})
