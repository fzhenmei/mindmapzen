import { expect, test, type Page } from '@playwright/test'

// 手机捕获 e2e(2026-09-26 spec §11,按 web 模式现实修正):Rust 服务/真机不在 e2e 面——
// 用 harness 桩 __zenE2e.mockMobileIdeas 模拟 Rust emit 的前端接线(整批 → captureIdea
// → toast),断言篮子文件落盘与提首位语义。Rust 侧行为由 mobile_sync 单测覆盖。
// ?basket=1 预置见 src/test/e2eHarness.ts(同 basket.spec.ts)。

async function readFile(page: Page, path: string): Promise<string> {
  return page.evaluate(
    (p) => (window as unknown as { __zenE2e: { readFile(path: string): Promise<string> } }).__zenE2e.readFile(p),
    path,
  )
}

function mdLines(md: string): string[] {
  return md.split('\n').map((l) => l.trim()).filter((l) => l !== '')
}

test('手机点子事件:整批入篮 + toast + 提首位', async ({ page }) => {
  await page.goto('/?e2e=1&basket=1')
  await expect(page.getByTestId('file-node-点子篮子')).toBeVisible()

  const ok = await page.evaluate(() => {
    const w = window as unknown as { __zenE2e?: { mockMobileIdeas?: (ideas: unknown[]) => void } }
    if (!w.__zenE2e?.mockMobileIdeas) return false
    w.__zenE2e.mockMobileIdeas([
      { id: 'e2e-u1', text: '手机点子甲', body: '手机上补的说明', capturedAt: 1 },
      { id: 'e2e-u2', text: '手机点子乙', body: '', capturedAt: 2 },
    ])
    return true
  })
  expect(ok).toBe(true)

  await expect(page.getByTestId('toast')).toBeVisible()
  const md = await readFile(page, '/ws/点子篮子.md')
  expect(md).toContain('手机点子甲')
  expect(md).toContain('手机上补的说明')
  expect(md).toContain('手机点子乙')
  // 后到的点子新在最上(spec §3.2 同篮子约定:根的第一子节点)
  expect(mdLines(md)[1]).toContain('手机点子乙')
})
