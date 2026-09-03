import { expect, test } from '@playwright/test'

// 漫游引导（2026-09 onboarding tour）：全流程 / 完成后不再出现 / 跳过 / 设置重看。
// harness 默认预写 tourDone:true（豁免既有用例），故要看引导须显式 ?tour=1；
// 「完成后重启」用 ?tourdone=1 预设 config 模拟（harness 每次页面加载重建内存 FS）。
test('引导：全流程走完（案头→编辑器跨视图）并落盘 tourDone', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/?e2e=1&tour=1')
  await expect(page.getByTestId('tour-overlay')).toBeVisible()
  await expect(page.getByTestId('tour-step-indicator')).toHaveText('1 / 11')
  // 案头段步进到「进入编辑器」提示步（步 6，索引 5）
  for (let i = 0; i < 5; i++) await page.getByTestId('tour-next').click()
  await expect(page.getByTestId('tour-step-indicator')).toHaveText('6 / 11')
  // 跨视图：下一步触发 before（打开漫游示例）→ 编辑器段命令栏步
  await page.getByTestId('tour-next').click()
  await expect(page.getByTestId('zen-bar')).toBeVisible()
  await expect(page.getByTestId('tour-step-indicator')).toHaveText('7 / 11')
  // 走到末步（完成）
  for (let i = 0; i < 4; i++) await page.getByTestId('tour-next').click()
  await expect(page.getByTestId('tour-next')).toHaveText('完成')
  await page.getByTestId('tour-next').click()
  await expect(page.getByTestId('tour-overlay')).toBeHidden()
  // 配置落盘
  const cfg = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile('/cfg.json'),
  )
  expect(JSON.parse(cfg).tourDone).toBe(true)
})

test('引导：已完成（?tourdone=1）再次启动不再出现', async ({ page }) => {
  await page.goto('/?e2e=1&tourdone=1')
  await expect(page.getByTestId('tour-overlay')).toBeHidden()
})

test('引导：跳过即完成（Esc 同效），配置落盘', async ({ page }) => {
  await page.goto('/?e2e=1&tour=1')
  await expect(page.getByTestId('tour-overlay')).toBeVisible()
  await page.getByTestId('tour-skip').click()
  await expect(page.getByTestId('tour-overlay')).toBeHidden()
  const cfg = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile('/cfg.json'),
  )
  expect(JSON.parse(cfg).tourDone).toBe(true)
})

test('引导：设置页重看再次出现（示例图已存在时幂等打开）', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/?e2e=1&tour=1')
  await expect(page.getByTestId('tour-overlay')).toBeVisible()
  await page.keyboard.press('Escape') // 跳过，落 tourDone
  await expect(page.getByTestId('tour-overlay')).toBeHidden()
  // 设置重看
  await page.getByTestId('btn-settings').click()
  await page.getByTestId('tour-replay').click()
  await expect(page.getByTestId('tour-overlay')).toBeVisible()
  await expect(page.getByTestId('tour-step-indicator')).toHaveText('1 / 11')
})
