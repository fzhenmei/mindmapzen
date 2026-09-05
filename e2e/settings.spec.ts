import { expect, test } from '@playwright/test'

// 复制选项下拉（2026-09 自设置面板移入砚栏复制钮）：默认值、切换、菜单保持、
// 收起重开保持、配置落盘。复制内容的后处理行为由 copyFilter 单测 + EditorView
// 单测钉死，此处只验证选项链路（UI 驱动沿用 note.spec 建图路径进入编辑器）。
test('砚栏复制选项：默认值、切换、重开保持与配置落盘', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('复制选项测试')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByTestId('zen-bar')).toBeVisible()
  // 展开下拉：默认 复制含备注=off、保留双链=on、含正文=on（2026-09 正文起第三项）
  await page.getByTestId('btn-copy-options').click()
  await expect(page.getByTestId('copy-note-option')).not.toBeChecked()
  await expect(page.getByTestId('copy-links-option')).toBeChecked()
  await expect(page.getByTestId('copy-include-body')).toBeChecked()
  // 翻转两项：菜单保持打开，可连续切换
  await page.getByTestId('copy-note-option').click()
  await page.getByTestId('copy-links-option').click()
  await expect(page.getByTestId('copy-note-option')).toBeChecked()
  await expect(page.getByTestId('copy-links-option')).not.toBeChecked()
  // 收起后重开：选项保持（store 状态与持久化）
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('copy-note-option')).toBeHidden()
  await page.getByTestId('btn-copy-options').click()
  await expect(page.getByTestId('copy-note-option')).toBeChecked()
  await expect(page.getByTestId('copy-links-option')).not.toBeChecked()
  await page.keyboard.press('Escape')
  // 配置文件落盘断言（内存 fs）
  const cfg = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile('/cfg.json'),
  )
  expect(JSON.parse(cfg).settings).toEqual({ copyIncludeNote: true, copyIncludeLinks: false, copyIncludeBody: true })
})
