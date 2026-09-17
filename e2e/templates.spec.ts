import { expect, test } from '@playwright/test'

// M16 模板：新建对话框选模板 → 实例化落盘（根名替换）→ 编辑器/详情态复现。
// 默认空白路径由既有 smoke 用例零适配覆盖（直接输名称确认 = v1.5.0 行为），此处只测模板路径。
// 注意 dev server 下可页面内动态 import 写内存 fs（周会模板用例）

test('模板：内置「AI 协作开发」实例化——根名替换、结构落盘、详情预览层级', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await expect(page.getByTestId('btn-new')).toBeVisible()

  await page.getByTestId('btn-new').click()
  await expect(page.getByTestId('input-name')).toBeVisible()
  // 默认空白（肌肉记忆零变更的证据）：触发器直显空白导图
  await expect(page.getByTestId('template-select')).toHaveText(/空白导图/)

  // 切换到「AI 协作开发」
  await page.getByTestId('template-select').click()
  await page.getByRole('option', { name: /AI 协作开发/ }).click()
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
  expect(md).toContain('## 想法池')
  expect(md).toContain('## 待我验收')
  expect(md).toContain('## 规范与决策')

  // 返回案头进详情态：md 预览渲染模板层级（lute 异步渲染，全量并发下默认 5s 偶发不够，
  // 15s 与 desk/mermaid 悬浮预览断言同口径）
  await page.getByTestId('btn-back').click()
  await page.getByTestId('file-node-Mind Map Zen 规划').click()
  await expect(page.getByTestId('md-preview')).toContainText('待我验收', { timeout: 15_000 })
})

test('模板：工作区 templates/ 目录的用户模板可选可实例化', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await expect(page.getByTestId('btn-new')).toBeVisible()

  // 页面内写用户模板（harness 通道——防裸 import 模块双实例，目录隐式推导无需 mkdir）
  await page.evaluate(async () => {
    const z = (window as unknown as { __zenE2e: { writeFile(p: string, t: string): Promise<void> } }).__zenE2e
    await z.writeFile('/ws/templates/周会.md', '# 周会模板\n\n## 本周进展\n\n## 下周计划\n')
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
