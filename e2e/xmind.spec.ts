import { expect, test } from '@playwright/test'

// M21 XMind 导入：一个入口（btn-import）双流（.md / .xmind），xmind 经 ZIP 解析转
// 树入库。样例在用例内现造（fflate zipSync），经 harness pickImportStub 注入。
// 导入预览通道复用：xmind 的游离主题/标签等摘要走既有 import-preview 确认框。

test('XMind 导入：新版 content.json 转树入库；未映射内容进预览确认', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await expect(page.getByTestId('btn-new')).toBeVisible()

  // 现造 .xmind 字节（content.json：含游离主题/标签 → 触发预览）并注入桩
  await page.evaluate(async () => {
    const fflate = await import('/node_modules/fflate/esm/browser.js')
    const content = JSON.stringify([
      {
        rootTopic: {
          title: 'XMind 迁入',
          notes: { plain: { content: '从 XMind 搬来的备注' } },
          children: {
            attached: [
              { title: '目标', children: { attached: [{ title: '上线' }] } },
              { title: '带标签', labels: ['P1'] },
            ],
            detached: [{ title: '游离' }],
          },
        },
      },
    ])
    const bytes = fflate.zipSync({ 'content.json': fflate.strToU8(content) })
    // bytes → 桩（postMessage 结构化克隆安全：转普通数组）
    const z = (window as unknown as { __zenE2e: { pickImportStub: unknown } }).__zenE2e
    z.pickImportStub = { name: 'XMind 迁入', kind: 'xmind', bytes: Uint8Array.from(bytes) }
  })

  await page.getByTestId('btn-import').click()
  // 预览确认：摘要列出游离主题与标签（不静默丢）
  await expect(page.getByTestId('import-preview')).toBeVisible()
  await expect(page.getByTestId('import-preview')).toContainText('游离主题')
  await expect(page.getByTestId('import-preview')).toContainText('标签')
  await page.getByTestId('import-confirm').click()
  await expect(page.getByText('XMind 迁入').first()).toBeVisible()

  // 落盘断言：规范 md（根/子级/正文原样块——2026-09-06 备注合并后 XMind 备注归正文，无 > 前缀）
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/XMind 迁入.md',
    ),
  )
  expect(md).toContain('# XMind 迁入\n')
  expect(md).toContain('## 目标')
  expect(md).toContain('### 上线')
  expect(md).toContain('# XMind 迁入\n从 XMind 搬来的备注\n')
})
