import { expect, test } from '@playwright/test'

// 一条关联线 = 容器直挂 2 个 path（可见线 + 透明点击线；箭头 marker 内 path 非直挂子元素不计）
const LINE_PATHS = '.smm-associative-line-container > path'

test('节点连线：[[名称]] 建线、保存重开复现', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  // pickDirectory 在 e2e 模式下无 Tauri 对话框：harness 已将 workspaceDir 预设为 /ws
  // （btn-new 仅在选择工作区后渲染，与 smoke/collapse 用例同款前置）
  await page.getByTestId('btn-workspace').click()
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('连线测试')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('根主题').first()).toBeVisible()

  // 建子节点 A（文本含 [[B]]）与 B：引擎「插入→渲染→弹编辑框」异步链路，先等框弹出再输入
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

  // 保存后按 md 双链重建：A→B 一条关联线出现（保存链 onSaved 触发 rebuildLinks）
  await page.keyboard.press('Control+s')
  await expect(page.locator(LINE_PATHS)).toHaveCount(2)

  // md 只含纯文本标记，不含引擎连线数据（连线不落盘，重开时按文本重建）
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/连线测试.md',
    ),
  )
  expect(md).toBe('# 根主题\n\n## A [[B]]\n\n## B\n')

  // 返回案头重开：onReady 重建，连线复现
  await page.getByTestId('btn-back').click()
  await expect(page.getByTestId('map-item')).toBeVisible()
  await page.getByTestId('map-item').click()
  await expect(page.getByText('A [[B]]').first()).toBeVisible()
  await expect(page.locator(LINE_PATHS)).toHaveCount(2)
})
