import { expect, test } from '@playwright/test'

// 语言切换 e2e（2026-09 i18n）：显式 English 三段验证——①即时生效（html lang、设置
// 对话框标题、编辑器砚栏返回钮全部英文化，react 订阅无需重启）；②配置落盘（内存 fs
// 读 /cfg.json 断言 language=en，走应用自身 load-merge-save 写路径）；③重启保持
// （?lang=en 预置 cfg 模拟上一会话落盘的全新启动，同 tour.spec ?tourdone 先例——
// harness 每次页面加载重建内存 FS，真 reload 丢配置属 harness 语义非产品行为；且启动
// 恒落案头，故重启后断言案头英文而非砚栏）。auto 跟随系统（zh）由全量存量 spec 覆盖。
test('语言设置：切 English 即时生效，配置落盘并重启保持', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  // 中文基线：locale 钉 zh-CN，auto 跟随系统
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  // 建图进编辑器再返回：覆盖切换前的中文态链路（新建对话框 → 砚栏 → 返回案头）
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('语言切换测试')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByTestId('zen-bar')).toBeVisible()
  await expect(page.getByRole('button', { name: '返回案头' })).toBeVisible()
  await page.getByTestId('btn-back').click()
  // 案头页首设置入口 → 显式 English
  await page.getByTestId('btn-settings').click()
  await page.getByTestId('lang-en').click()
  // 即时生效：html lang 与设置对话框标题（aria-label 随语言重渲染）
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  // 编辑器词典同步：关设置再建图，砚栏返回钮英文化（词典真实值 backToDesk='Back to desk'）
  await page.keyboard.press('Escape')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('en map')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByRole('button', { name: 'Back to desk' })).toBeVisible()
  // 配置落盘（内存 fs）：language=en
  const cfg = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile('/cfg.json'),
  )
  expect(JSON.parse(cfg).language).toBe('en')
  // 重启保持：预置 language=en 的全新启动，案头即英文（html lang + 新建钮 aria；
  // 空案头另有同文案空态 CTA，role 定位会撞 strict mode，走 testid 断 aria-label）
  await page.goto('/?e2e=1&lang=en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByTestId('btn-new')).toHaveAttribute('aria-label', 'New map')
})
