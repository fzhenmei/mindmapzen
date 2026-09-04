import { expect, test } from '@playwright/test'

// M17 mermaid（备注即宿主）：备注引用块内嵌 ```mermaid 围栏，详情态 md 预览渲染成 SVG。
// md 事实源零改动（note 多行 roundtrip 既有），本用例锁端到端渲染链路。
test('mermaid：备注围栏在详情态预览渲染成 SVG；语法错误降级为源码', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await expect(page.getByTestId('btn-new')).toBeVisible()

  // 页面内写入含 mermaid 备注的导图（好图 + 坏图各一）——harness 通道（防裸
  // import 模块双实例，见 e2eHarness.writeFile 注释）
  await page.evaluate(async () => {
    const z = (window as unknown as { __zenE2e: { writeFile(p: string, t: string): Promise<void> } }).__zenE2e
    await z.writeFile(
      '/ws/架构图解.md',
      [
        '# 架构图解',
        '',
        '## 核心链路',
        '',
        '> 这条链路是主数据流：',
        '> ```mermaid',
        '> graph LR',
        '>   A[画布] --> B{md 事实源}',
        '>   B --> C[AI 协作]',
        '> ```',
        '',
        '## 坏图',
        '',
        '> ```mermaid',
        '> 这不是合法的 mermaid',
        '> ```',
        '',
      ].join('\n'),
    )
  })

  // 详情态：好图渲染出 SVG
  await page.getByTestId('file-node-架构图解').click()
  await expect(page.getByTestId('file-detail')).toBeVisible()
  const svg = page.getByTestId('mermaid-svg')
  await expect(svg).toBeVisible({ timeout: 15_000 }) // mermaid 库懒加载首渲染
  await expect(svg.locator('svg')).toBeVisible()
  // 坏图降级：错误摘要 + 源码保底
  await expect(page.getByTestId('mermaid-error')).toBeVisible()
  await expect(page.getByTestId('mermaid-error')).toContainText('这不是合法的 mermaid')

  // md 落盘事实源不变（围栏仍在引用块内）
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/架构图解.md',
    ),
  )
  expect(md).toContain('> ```mermaid')
  expect(md).toContain('> graph LR')
})

// M17b：画布备注悬停窗渲染 mermaid（引擎 customNoteContentShow 官方通道接管）
test('mermaid：画布备注悬停窗渲染成图，移出隐藏', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('悬停图')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('悬停图').first()).toBeVisible()

  // 选中根 → 备注对话框写入 mermaid 备注
  await page.getByText('悬停图').first().click()
  await page.getByTestId('btn-note').click()
  await page.getByTestId('note-text').fill('流程说明：\n```mermaid\ngraph LR\n  A --> B\n```')
  await page.getByTestId('note-save').click()

  // 悬停备注角标（必在节点 group 内——直接 hover 文本元素在画布 transform 下坐标
  // 可能落偏，角标是更稳的命中目标）→ 悬停窗出现并渲染 SVG（mermaid 懒加载留 15s）
  const noteIcon = page.locator('.smm-node-note').first()
  await expect(noteIcon).toBeVisible()
  await noteIcon.hover()
  const tip = page.getByTestId('zen-note-tip')
  await expect(tip).toBeVisible()
  await expect(tip).toContainText('流程说明：')
  await expect(tip.getByTestId('zen-note-tip-mermaid').locator('svg')).toBeVisible({ timeout: 15_000 })

  // 移出节点 → 悬停窗隐藏
  await page.getByTestId('btn-save').hover()
  await expect(tip).toBeHidden()
})
