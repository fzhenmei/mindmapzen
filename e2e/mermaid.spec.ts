import { expect, test } from '@playwright/test'

// M17 mermaid（正文即宿主）：正文引用块内嵌 ```mermaid 围栏，悬浮预览浮窗 md 预览渲染成 SVG。
// md 事实源零改动（正文块原样 roundtrip 既有，mdTree 单测钉死），本用例锁端到端渲染链路。
// 2026-09-06 备注合并：引用块归正文（画布悬停成图链路已并入 body.spec「正文 mermaid」用例）。
// 2026-09 渲染统一：案头预览切 vditor(lute)（M2 起由悬浮预览浮窗承接），mermaid 成图由 vditor dist 自带资源驱动
// （MermaidBlock/项目 mermaid 包退役）——好图成 flowchart SVG；语法错误降级为 mermaid
// 错误图（error SVG）+ 附注保留源码文本。
test('mermaid：正文围栏在详情态预览渲染成 SVG；语法错误降级为错误图', async ({ page }) => {
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

  // 悬浮预览：好图渲染出 SVG（vditor dist 自带 mermaid 懒加载首渲染）
  await page.getByTestId('file-node-架构图解').click()
  await expect(page.getByTestId('file-preview-popover')).toBeVisible()
  const preview = page.getByTestId('md-preview')
  const goodSvg = preview.locator('div.language-mermaid svg.flowchart')
  await expect(goodSvg).toBeVisible({ timeout: 15_000 })
  // 坏图降级：mermaid 错误图（error roledescription）+ 附注保留源码文本
  const errSvg = preview.locator('div.language-mermaid svg[aria-roledescription="error"]')
  await expect(errSvg).toBeVisible()
  await expect(preview.locator('div.language-mermaid small')).toContainText('这不是合法的 mermaid')

  // md 落盘事实源不变（围栏仍在引用块内——正文原样块，打开即面板可见内容）
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/架构图解.md',
    ),
  )
  expect(md).toContain('> ```mermaid')
  expect(md).toContain('> graph LR')
})
