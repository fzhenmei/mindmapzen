import { expect, test } from '@playwright/test'

// e2e/ai-skill.spec.ts —— skill 全链（Task 9，spec §9：fake transport + fake 网关，真网络不进 e2e）：
// 新建导图 → 编辑器内设置配 BYOK + 微信读书 key（onBlur 即存）→
// 开 AI 面板 → 空态 skill 引导（方案 D：随空态渲染派生）→ 点引导示例「看看我的书架」→
// skill_invoke 走 fake 网关 → 工具卡渲染 → 文本定稿。
// 断言面：网关收到的 body 含 skill_version（manifest 自动附带）；system prompt 含 SKILL.md 段
// （引导句 skill_invoke + 原文「微信读书」，防未注入假绿）；URL 恒来自 manifest（安全口径）。

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // fake 网关：记录调用（url/apiKey/body）供 spec 断言——body 的 skill_version 由
    // executeSkillTool 自动附带，url 永远来自 manifest（AI 只能给 skill id + api_name）
    ;(window as unknown as { __gwCalls?: unknown[] }).__gwCalls = []
    ;(window as unknown as { __SKILL_GATEWAY_FACTORY__: unknown }).__SKILL_GATEWAY_FACTORY__ =
      () => ({
        async callGateway(url: string, apiKey: string, body: unknown) {
          ;(window as unknown as { __gwCalls: unknown[] }).__gwCalls.push({ url, apiKey, body })
          const b = body as { api_name: string }
          if (b.api_name === '/shelf/sync') {
            return { ok: true, status: 200, json: { errcode: 0, books: [{ bookId: '1', title: '三体' }] } }
          }
          return { ok: true, status: 200, json: { errcode: 0 } }
        },
      })
    ;(window as unknown as { __AI_TRANSPORT_FACTORY__: unknown }).__AI_TRANSPORT_FACTORY__ =
      () => ({
        start(payload: { body: { messages: Array<{ role: string; content: string }> } }, onDelta: (d: string) => void) {
          const sys = payload.body.messages.find((m) => m.role === 'system')?.content ?? ''
          // 分片内容嵌入 chunk JSON 前必须转义（ai.spec 既有教训：裸模板拼接引号不闭合 →
          // 非法 JSON，parseDeltaChunk 静默丢弃、流式 tool_calls 全丢）
          const esc = (s: string): string => JSON.stringify(s).slice(1, -1)
          if (!(window as unknown as { __aiRound?: number }).__aiRound) {
            ;(window as unknown as { __aiRound?: number }).__aiRound = 1
            // 第一轮 system prompt 存 window 供后查（skill 段注入断言，防未注入假绿）
            ;(window as unknown as { __skillPrompt?: string }).__skillPrompt = sys
            const args = JSON.stringify({ skill: 'weread', api_name: '/shelf/sync' })
            onDelta(`{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"skill_invoke","arguments":"${esc(args)}"}}]}}]}`)
            onDelta('{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}')
            return Promise.resolve({ endedWith: 'done' as const })
          }
          onDelta('{"choices":[{"delta":{"content":"书架有 1 本书：《三体》"}}]}')
          onDelta('{"choices":[{"delta":{},"finish_reason":"stop"}]}')
          return Promise.resolve({ endedWith: 'done' as const })
        },
        abort() {},
      })
  })
})

test('skill 全链：配 key→引导→invoke→工具卡→定稿', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/?e2e=1')

  // 新建导图并进编辑视图（配置动作在编辑器内完成，见文件头注释）
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('skill 全链测试')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('skill 全链测试').first()).toBeVisible()

  // 编辑器内配置 BYOK + 微信读书 key（设置 AI 分区；skill 输入 onBlur 即存）
  await page.getByTestId('btn-editor-settings').click()
  await page.getByTestId('settings-ai-section').click()
  await page.getByTestId('set-ai-baseurl').fill('https://fake.local/v1')
  await page.getByTestId('set-ai-key').fill('sk-e2e')
  await page.getByTestId('set-ai-model').fill('fake-model')
  await page.getByTestId('set-ai-save').click()
  await page.getByTestId('set-skill-weread').fill('wrk-e2e')
  await page.getByTestId('set-skill-weread').blur()
  await page.keyboard.press('Escape') // 关设置（ai.spec 同款）

  // 开 AI 面板：空会话空态常驻 skill 引导（方案 D：随空态渲染派生,与配置时机/会话 reset 解耦）
  await page.getByTestId('ai-toggle').click()
  await expect(page.getByTestId('ai-panel')).toBeVisible()
  await expect(page.getByTestId('ai-skill-intro').filter({ hasText: '微信读书' })).toBeVisible()

  // lute 预热（ai.spec 同款）：定稿文本走 MarkdownPreview，预装 lute 消除 vditor
  // addScript 双 script 竞态噪音（失败注入不掩盖 skill 链路本身的断言）
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

  // 点引导示例填入输入框（空态引导只填不发，用户看过再发）
  await page.getByRole('button', { name: '看看我的书架' }).click()
  await expect(page.getByTestId('ai-input')).toHaveValue('看看我的书架')
  await page.getByTestId('ai-send').click()

  // 回合结束（ai-send 重现 = finally 已跑）→ 操作卡收起为摘要行 → 展开验明细
  await expect(page.getByTestId('ai-send')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId(/^ai-cards-toggle-/)).toContainText('1 项操作')
  await page.getByTestId(/^ai-cards-toggle-/).click()
  // 工具卡 kind skill → i18n ai.card.skill「技能 {{text}}」，text 为网关回包 JSON（含《三体》）
  const card = page.getByTestId(/^ai-card-/).filter({ hasText: '三体' })
  await expect(card).toBeVisible()
  await expect(card).toContainText('技能')
  // 定稿文本走 MarkdownPreview 异步渲染（超时与全链路断言对齐）
  await expect(page.getByText(/书架有 1 本书/).first()).toBeVisible({ timeout: 15_000 })

  // system prompt 注入断言：引导句 skill_invoke + SKILL.md 原文「微信读书」（spec §4.5）
  const sys = await page.evaluate(() => (window as unknown as { __skillPrompt?: string }).__skillPrompt ?? '')
  expect(sys).toContain('skill_invoke')
  expect(sys).toContain('微信读书')

  // 网关调用断言：body 自动附带 manifest 的 skill_version；URL 恒来自 manifest（AI 无法
  // 诱导请求任意地址，spec §4.2 安全口径）；apiKey 用配置凭据原样上送
  const calls = await page.evaluate(() => (window as unknown as { __gwCalls: Array<{ url: string; apiKey: string; body: Record<string, unknown> }> }).__gwCalls)
  expect(calls).toHaveLength(1)
  expect(calls[0]!.url).toBe('https://i.weread.qq.com/api/agent/gateway')
  expect(calls[0]!.apiKey).toBe('wrk-e2e')
  expect(calls[0]!.body.api_name).toBe('/shelf/sync')
  expect(calls[0]!.body.skill_version).toBe('1.0.4')

  // 全程无错误消息：工厂注入生效即不该出现错误卡
  await expect(page.getByTestId('ai-msg-error')).toHaveCount(0)
})
