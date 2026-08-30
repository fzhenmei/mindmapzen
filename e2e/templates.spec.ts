import { expect, test } from '@playwright/test'

// M16 模板：新建对话框选模板 → 实例化落盘（根名替换）→ 编辑器/详情态复现。
// 默认空白路径由既有 smoke 用例零适配覆盖（直接输名称确认 = v1.5.0 行为），此处只测模板路径。
// 注意 dev server 下可页面内动态 import 写内存 fs（周会模板用例）

test('模板：内置「软件开发跟踪」实例化——根名替换、结构落盘、详情预览层级', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await expect(page.getByTestId('btn-new')).toBeVisible()

  await page.getByTestId('btn-new').click()
  await expect(page.getByTestId('input-name')).toBeVisible()
  // 默认空白（肌肉记忆零变更的证据）：触发器直显空白导图
  await expect(page.getByTestId('template-select')).toHaveText(/空白导图/)

  // 切换到「软件开发跟踪」
  await page.getByTestId('template-select').click()
  await page.getByRole('option', { name: /软件开发跟踪/ }).click()
  await page.getByTestId('input-name').fill('Mind Map Zen 规划')
  await page.getByTestId('btn-confirm').click()

  // 编辑器打开，根节点为用户输入名（模板根「项目名」被替换）
  await expect(page.getByText('Mind Map Zen 规划').first()).toBeVisible()

  // 磁盘断言：模板结构完整落盘（迭代四态 + 决策记录），根名替换
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/Mind Map Zen 规划.md',
    ),
  )
  expect(md).toContain('# Mind Map Zen 规划\n')
  expect(md).toContain('## 迭代 v0.1')
  expect(md).toContain('### 已交付（待验收）')
  expect(md).toContain('## 决策记录')

  // 返回案头进详情态：md 预览渲染模板层级
  await page.getByTestId('btn-back').click()
  await page.getByTestId('dir-node-all').click()
  await page.getByTestId('map-item').filter({ hasText: 'Mind Map Zen 规划' }).click()
  await expect(page.getByTestId('md-preview')).toContainText('已交付（待验收）')
})

test('模板：工作区 templates/ 目录的用户模板可选可实例化', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await expect(page.getByTestId('btn-new')).toBeVisible()

  // 页面内写用户模板（dev server 动态 import，同 M15 验证手法）
  await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts')
    const s = m.useAppStore.getState()
    await s.adapter.mkdir('/ws/templates')
    await s.adapter.writeTextFileAtomic('/ws/templates/周会.md', '# 周会模板\n\n## 本周进展\n\n## 下周计划\n')
  })

  await page.getByTestId('btn-new').click()
  await page.getByTestId('template-select').click()
  await page.getByRole('option', { name: /周会/ }).click()
  await page.getByTestId('input-name').fill('第42周周会')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('第42周周会').first()).toBeVisible()

  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/第42周周会.md',
    ),
  )
  expect(md).toContain('# 第42周周会\n')
  expect(md).toContain('## 本周进展')
  expect(md).toContain('## 下周计划')
})
