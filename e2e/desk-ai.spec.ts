import { expect, test } from '@playwright/test'

// e2e/desk-ai.spec.ts —— 案头 AI 文件整理 e2e：两段式确认门 + 移动落地（spec §1.5/§2.4）。
// fake transport 三段轮次：round1 纯文本方案（未确认阶段零工具）→ round2 move_file
// （确认门放行）→ round3 收尾文本；文件落位断言走左树 file-node-*/dir-node-* testid +
// __zenE2e 磁盘口径（desk.spec.ts 同款）。真网络不进 e2e（ai.spec 先例）

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __AI_TRANSPORT_FACTORY__?: unknown; __deskAiRound?: number }
    const esc = (s: string): string => JSON.stringify(s).slice(1, -1)
    const tool = (id: string, name: string, args: string): string =>
      `{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"${id}","function":{"name":"${name}","arguments":"${esc(args)}"}}]}}]}`
    w.__AI_TRANSPORT_FACTORY__ = () => ({
      start(_p: unknown, onDelta: (d: string) => void) {
        w.__deskAiRound = (w.__deskAiRound ?? 0) + 1
        if (w.__deskAiRound === 1) {
          onDelta('{"choices":[{"delta":{"content":"方案：把「临时图」移动到 归档/ 目录。确认执行吗？"}}]}')
          onDelta('{"choices":[{"delta":{},"finish_reason":"stop"}]}')
          return Promise.resolve({ endedWith: 'done' as const })
        }
        if (w.__deskAiRound === 2) {
          onDelta(tool('c1', 'move_file', JSON.stringify({ relDir: '', name: '临时图', toRelDir: '归档' })))
          onDelta('{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}')
          return Promise.resolve({ endedWith: 'done' as const })
        }
        onDelta('{"choices":[{"delta":{"content":"已移动「临时图」到 归档/。"}}]}')
        onDelta('{"choices":[{"delta":{},"finish_reason":"stop"}]}')
        return Promise.resolve({ endedWith: 'done' as const })
      },
      abort() {},
    })
  })
})

test('案头 AI 整理：方案→确认→移动落地；未确认阶段文件不动', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/?e2e=1')

  // BYOK 配置（ai.spec.ts / ai-full-editing.spec.ts 同款：设置对话框，Escape 关闭）
  await page.getByTestId('btn-settings').click()
  await page.getByTestId('set-ai-baseurl').fill('https://fake.local/v1')
  await page.getByTestId('set-ai-key').fill('sk-e2e')
  await page.getByTestId('set-ai-model').fill('fake-model')
  await page.getByTestId('set-ai-save').click()
  await page.keyboard.press('Escape')

  // 建一张待整理的图（desk.spec.ts 页首新建流程：btn-new → input-name → btn-confirm，
  // 创建即打开进编辑器；desk-ai-toggle 挂在案头 LibraryView——btn-back 返回案头再开面板）
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('临时图')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('临时图').first()).toBeVisible()
  await page.getByTestId('btn-back').click()
  await expect(page.getByTestId('file-node-临时图')).toBeVisible()

  // 开案头 AI 面板（BYOK 三项全非空竖条入口才渲染）
  await page.getByTestId('desk-ai-toggle').click()
  await expect(page.getByTestId('ai-panel')).toBeVisible()

  // lute 预热（ai.spec.ts 同款）：工具回合里「空文本 finalize→文本重渲染」的 vditor
  // addScript 双 script 竞态会把收尾文本清成空白，预先装好 lute 消除上游竞态噪音
  await page.evaluate(() => {
    const LUTE = 'vendor/vditor/dist/js/lute/lute.min.js'
    const ID = 'vditorLuteScript'
    return new Promise<void>((resolve) => {
      if (document.getElementById(ID) !== null) return resolve()
      const s = document.createElement('script')
      s.src = LUTE
      s.onload = () => {
        if (document.getElementById(ID) === null) s.id = ID
        resolve()
      }
      s.onerror = () => resolve() // 预热失败不阻断用例，后续走应用原生加载路径
      document.head.append(s)
    })
  })

  // 首条指令 → AI 出方案（纯文本零工具，确认门未放行）
  await page.getByTestId('ai-input').fill('帮我整理')
  await page.getByTestId('ai-send').click()
  await expect(page.getByText(/方案：把「临时图」移动到 归档\//)).toBeVisible({ timeout: 20_000 })

  // 未确认：文件仍在根层文件行（desk.spec 口径），「归档」目录尚未出现
  await expect(page.getByTestId('file-node-临时图')).toBeVisible()
  await expect(page.getByTestId('dir-node-归档')).toHaveCount(0)

  // 确认 → 确认门放行本轮写工具 → move_file 执行
  await page.getByTestId('ai-input').fill('确认')
  await page.getByTestId('ai-send').click()

  // 「已移动」卡片：回合收尾明细折叠成摘要行（ai-full-editing.spec.ts 同款口径），
  // 点开再验明细——成功卡 ✓ + move_file 的 detail 文本
  const toggles = page.getByTestId(/^ai-cards-toggle-/)
  await expect(toggles).toContainText('1 项操作', { timeout: 20_000 })
  await toggles.click()
  await expect(page.getByTestId(/^ai-card-/).filter({ hasText: '已移动「临时图」到 归档/' })).toContainText('✓')
  // 收尾文本经 MarkdownPreview 渲染（lute 预热后可判）
  await expect(page.getByTestId('ai-msg-md').filter({ hasText: '已移动「临时图」到 归档/' })).toBeVisible({ timeout: 15_000 })

  // 左树：出现「归档」目录且其下直列「临时图」文件行（desk.spec 文件行口径）
  await expect(page.getByTestId('dir-node-归档')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('file-node-临时图')).toBeVisible()

  // 磁盘断言（内存 fs，desk.spec 同款）：文件内容落 归档/、根位原文件消失
  const moved = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/归档/临时图.md',
    ),
  )
  expect(moved).toBe('# 临时图\n')
  const rootGone = await page.evaluate(async () => {
    try {
      await (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
        '/ws/临时图.md',
      )
      return false
    } catch {
      return true
    }
  })
  expect(rootGone).toBe(true)
})
