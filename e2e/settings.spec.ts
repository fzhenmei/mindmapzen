import { expect, test } from '@playwright/test'

// 设置页（M5b Task 4）：复制行为两开关的 UI 冒烟——默认值、切换、重开保持、配置落盘。
// 复制内容的后处理行为由 copyFilter 单测 + EditorView 单测钉死，此处只验证设置链路。
test('设置：开关默认值、切换、重开保持与配置落盘', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-settings').click()
  await expect(page.getByTestId('settings-dialog')).toBeVisible()
  // 默认：复制含备注=off、保留双链=on
  await expect(page.getByTestId('copy-note-toggle')).not.toBeChecked()
  await expect(page.getByTestId('copy-links-toggle')).toBeChecked()
  // 翻转两开关
  await page.getByTestId('copy-note-toggle').check()
  await page.getByTestId('copy-links-toggle').uncheck()
  await expect(page.getByTestId('copy-note-toggle')).toBeChecked()
  await expect(page.getByTestId('copy-links-toggle')).not.toBeChecked()
  // 关闭后重开：设置保持（store 状态与持久化）
  await page.getByTestId('settings-close').click()
  await expect(page.getByTestId('settings-dialog')).toBeHidden()
  await page.getByTestId('btn-settings').click()
  await expect(page.getByTestId('copy-note-toggle')).toBeChecked()
  await expect(page.getByTestId('copy-links-toggle')).not.toBeChecked()
  await page.getByTestId('settings-close').click()
  // 配置文件落盘断言（内存 fs）
  const cfg = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile('/cfg.json'),
  )
  expect(JSON.parse(cfg).settings).toEqual({ copyIncludeNote: true, copyIncludeLinks: false })
})
