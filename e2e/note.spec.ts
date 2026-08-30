import { expect, test } from '@playwright/test'

// Task 2 缓期的备注 E2E（spec §11）：btn-note 全链路——编辑对话框保存 → md 落引用块 → 重开持久。
// md 侧往返（引用块 ⇄ data.note）已由 mdTree 单测覆盖，此处覆盖引擎接线与落盘链路。
test('节点备注：对话框编辑保存后 md 含引用块，重开持久', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('备注测试')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('根主题').first()).toBeVisible()

  // 建子节点「要点」：引擎「插入→渲染→弹编辑框」异步链路，先等框弹出再输入
  await page.getByText('根主题').first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('要点')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()

  // 选中「要点」→ btn-note 打开对话框 → 预填空 → 输入两行备注保存
  await page.getByText('要点').first().click()
  await page.getByTestId('btn-note').click()
  await expect(page.getByTestId('note-dialog')).toBeVisible()
  const textarea = page.getByTestId('note-text')
  await expect(textarea).toHaveValue('')
  await textarea.fill('第一行\n第二行')
  await page.getByTestId('note-save').click()
  await expect(page.getByTestId('note-dialog')).toBeHidden()

  // 保存后 md 含引用块（serialize：note 输出为节点标题后的 > 行）
  await page.keyboard.press('Control+s')
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/备注测试.md',
    ),
  )
  expect(md).toBe('# 根主题\n\n## 要点\n> 第一行\n> 第二行\n')

  // 返回案头重开：引用块解析回 data.note，引擎渲染备注角标（.smm-node-note）
  await page.getByTestId('btn-back').click()
  // M15：案头初始 idle 空态，先点树根进根目录资源管理器态
  await page.getByTestId('dir-node-all').click()
  await expect(page.getByTestId('map-item')).toBeVisible()
  await page.getByTestId('map-item').dblclick() // M5d 交互变更：双击打开
  await expect(page.getByText('要点').first()).toBeVisible()
  await expect(page.locator('.smm-node-note').first()).toBeVisible()
})
