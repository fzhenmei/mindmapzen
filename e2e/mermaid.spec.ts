import { expect, test } from '@playwright/test'

// M17 mermaid（正文即宿主）：正文引用块内嵌 ```mermaid 围栏，详情态 md 预览渲染成 SVG。
// md 事实源零改动（正文块原样 roundtrip 既有，mdTree 单测钉死），本用例锁端到端渲染链路。
// 2026-09-06 备注合并：引用块归正文（画布悬停成图链路已并入 body.spec「正文 mermaid」用例）。
test('mermaid：正文围栏在详情态预览渲染成 SVG；语法错误降级为源码', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await expect(page.getByTestId('btn-new')).toBeVisible()

  // 页面内写入含 mermaid 正文的导图（好图 + 坏图各一）——harness 通道（防裸
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

  // md 落盘事实源不变（围栏仍在引用块内——正文原样块，打开即面板可见内容）
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/架构图解.md',
    ),
  )
  expect(md).toContain('> ```mermaid')
  expect(md).toContain('> graph LR')
})
