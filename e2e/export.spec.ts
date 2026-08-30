import { expect, test } from '@playwright/test'

// E2E 桩（e2eHarness）：App 的 exportPorts 在 ?e2e=1 下记录 pickSavePath 路径与 writeImage
// 字节长度；引擎真链路（svg → canvas → dataURL）在 chromium 内执行，此处只断言桩侧可观测结果。
test('导出与复制为图片：三入口经端口桩可观测', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('导出测试')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('导出测试').first()).toBeVisible()

  // 复制为图片：写剪贴板桩收到字节（长度 > 0）并盖「已复制」墨青印
  await page.getByTestId('btn-export').click()
  await expect(page.getByTestId('export-dialog')).toBeVisible()
  await page.getByTestId('export-copy').click()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __zenE2e: { exportedBytes: number | null } }).__zenE2e.exportedBytes,
      ),
    )
    .toBeGreaterThan(0)
  await expect(page.getByTestId('save-stamp')).toHaveText('已复制')

  // 导出 PNG：pickSavePath 桩记录默认文件名路径（.png 扩展），盖「已存」朱砂印
  await page.getByTestId('btn-export').click()
  await page.getByTestId('export-png').click()
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __zenE2e: { savePaths: string[] } }).__zenE2e.savePaths.length,
      ),
    )
    .toBe(1)
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __zenE2e: { savePaths: string[] } }).__zenE2e.savePaths[0],
      ),
    )
    .toBe('/ws/导出/导出测试.png')
  await expect(page.getByTestId('save-stamp')).toHaveText('已存')
})

test('导出 SVG：桩路径记录 .svg 扩展文件名', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('矢量图')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('矢量图').first()).toBeVisible()
  await page.getByTestId('btn-export').click()
  await page.getByTestId('export-svg').click()
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __zenE2e: { savePaths: string[] } }).__zenE2e.savePaths[0],
      ),
    )
    .toBe('/ws/导出/矢量图.svg')
})
