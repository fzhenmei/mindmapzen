import { expect, test } from '@playwright/test'

// 验收实案：引擎无容器尺寸自动监听，窗口最大化/还原后画布保持挂载时尺寸。
// 宿主在 window resize 时调用 mm.resize()（MindMapCanvas），本用例在真实浏览器验证该链路。
test('窗口尺寸变化画布跟随重算', async ({ page }) => {
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('自适应')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('根主题').first()).toBeVisible()

  const svg = page.locator('.canvas-host svg').first()
  const widthBefore = parseInt((await svg.getAttribute('width')) ?? '0', 10)

  await page.setViewportSize({ width: 1500, height: 950 })
  await expect
    .poll(async () => parseInt((await svg.getAttribute('width')) ?? '0', 10))
    .toBeGreaterThan(widthBefore)

  // 视图工具组：缩放/根居中/适配存在可点不报错（视觉效果属人工清单）
  for (const id of ['btn-zoom-out', 'btn-zoom-in', 'btn-center-root', 'btn-fit']) {
    await expect(page.getByTestId(id)).toBeEnabled()
    await page.getByTestId(id).click()
  }
})
