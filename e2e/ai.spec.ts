import { expect, test } from '@playwright/test'

// e2e/ai.spec.ts —— AI 对话全链路（Task 14，spec §9：e2e 只走 fake transport，真网络不进 e2e）：
// 案头配置 BYOK → 新建导图 → 开 AI 面板 → 对话 → AI 加节点（真实引擎落画布）→
// 卡片/状态签可见 → 回合结束解锁。add_node 的 parentUid 从 system prompt 里动态提取
// （fake transport 能读请求 body，uid 缩进树格式见 services/ai/prompt.ts）。

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as unknown as { __AI_TRANSPORT_FACTORY__: unknown }).__AI_TRANSPORT_FACTORY__ =
      () => ({
        start(payload: { body: { messages: Array<{ role: string; content: string }> } }, onDelta: (d: string) => void) {
          const sys = payload.body.messages.find((m) => m.role === 'system')?.content ?? ''
          // 根 uid 提取：锚定行首（^…m）——system prompt 的说明行含字面 "- [uid] 文本"，
          // 非锚定正则首个命中是它；树根行无缩进、子节点行有缩进，行首锚定唯一命中根
          const rootUid = (sys.match(/^- \[([^\]]+)\]/m) ?? [])[1] ?? 'root'
          const args = JSON.stringify({ parentUid: rootUid, text: 'AI 要点' })
          // 分片内容嵌入 chunk JSON 前必须转义（裸模板拼接引号不闭合 → 非法 JSON，
          // parseDeltaChunk 静默丢弃、流式 tool_calls 全丢）
          const esc = (s: string): string => JSON.stringify(s).slice(1, -1)
          // 第一轮：tool_calls（分片模拟流式拼接路径）；第二轮：纯文本收尾
          if (!(window as unknown as { __aiRound?: number }).__aiRound) {
            ;(window as unknown as { __aiRound?: number }).__aiRound = 1
            onDelta(`{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"add_node","arguments":"${esc(args.slice(0, 10))}"}}]}}]}`)
            onDelta(`{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"${esc(args.slice(10))}"}}]}}]}`)
            onDelta('{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}')
            return Promise.resolve({ endedWith: 'done' as const })
          }
          onDelta('{"choices":[{"delta":{"content":"已添加「AI 要点」"}}]}')
          onDelta('{"choices":[{"delta":{},"finish_reason":"stop"}]}')
          return Promise.resolve({ endedWith: 'done' as const })
        },
        abort() {},
      })
  })
})

test('AI 对话：配置→开面板→AI 加节点→卡片→解锁', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/?e2e=1')

  // 案头配置 BYOK（设置对话框是库视图入口，先进设置）
  await page.getByTestId('btn-settings').click()
  await page.getByTestId('set-ai-baseurl').fill('https://fake.local/v1')
  await page.getByTestId('set-ai-key').fill('sk-e2e')
  await page.getByTestId('set-ai-model').fill('fake-model')
  await page.getByTestId('set-ai-save').click()
  await page.keyboard.press('Escape') // 关设置（既有 e2e 同款：settings.spec/language-switch.spec）

  // 新建导图并进编辑视图
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('AI 对话测试')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('AI 对话测试').first()).toBeVisible()

  // 开 AI 面板 → 发送
  await page.getByTestId('ai-toggle').click()
  await expect(page.getByTestId('ai-panel')).toBeVisible()
  // 面板与窗口右/下缘留 5px 缝（2026-09 视觉打磨，对齐 canvas-host 留缝先例：顶边平贴
  // 标题栏、右下留缝）；面板贴死窗口右/下边框，圆角窗口下边框线会被裁进圆角
  {
    const vp = page.viewportSize()!
    const box = await page.getByTestId('ai-panel').boundingBox()
    expect(box).not.toBeNull()
    expect(Math.round(box!.x + box!.width)).toBe(vp.width - 5)
    expect(Math.round(box!.y + box!.height)).toBe(vp.height - 5)
  }

  // lute 预热：收尾文本走 MarkdownPreview(vditor lute 管线)。vditor addScript 存在
  // 双 script 竞态（onload 后才挂 id，加载中二次调用会再建 script），回合内"空文本
  // 首渲染→文本重渲染"两个并发渲染的完成顺序不定，空串后完成则 innerHTML 被清。
  // 预先以同 URL 同 id 装好 lute，后续 addScript 全部命中缓存同步 resolve，渲染
  // 序恢复为调用序，消除该上游竞态噪音（失败注入不掩盖 AI 链路本身的断言）
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

  await page.getByTestId('ai-input').fill('帮我在根节点下加一个要点')
  await page.getByTestId('ai-send').click()

  // AI 真实落画布：引擎画布出现新节点文本（真实 execCommand 路径）
  await expect(page.getByText('AI 要点').first()).toBeVisible({ timeout: 15_000 })
  // 画布级钉死：收尾文本/成功卡同样含「AI 要点」，全页 getByText 存在"工具失败仍绿"的
  // 假阴性，此处限定在引擎节点容器上（.smm-node 惯例见 canvas.spec）
  await expect(page.locator('.smm-node', { hasText: 'AI 要点' })).toBeVisible({ timeout: 15_000 })
  // 对话流出现改图卡片（成功卡「新增「AI 要点」」」，失败卡不含该文本）与收尾文本。
  // 语义定位：testid 前缀 + 文本过滤，不钉消息下标——卡片 testid 为 ai-card-<消息下标>-<卡序>
  // （ChatPanel MessageRow），7106d41 起首轮发送前插入 notice 安全网信息卡，messages 变为
  // [notice, user, assistant]，消息下标随前置消息数漂移（曾 ai-card-1-0 → ai-card-2-0）；
  // 卡片 append-only 无重排，文本即稳定标识
  await expect(page.getByTestId(/^ai-card-/).filter({ hasText: 'AI 要点' })).toBeVisible()
  // 收尾文本走 MarkdownPreview 异步渲染，超时与全链路断言对齐（默认 5s 偶发不够）
  await expect(page.getByText(/已添加/).first()).toBeVisible({ timeout: 15_000 })
  // 定稿消息字号对齐 md 正文令牌（2026-09 字号修复回潮护栏）：vditor 基线 16px 应被
  // App.css 压到 --font-size-sm（13px）。该规则曾写成后代选择器永不命中——vditor 静态
  // preview 把 vditor-reset 加在 md-preview 容器自身，AI 总结与案头 md 视图因此恒 16px
  const summaryFont = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="ai-msg-md"] .vditor-reset')
    if (el === null) throw new Error('定稿消息未渲染出 vditor-reset 容器')
    return getComputedStyle(el).fontSize
  })
  expect(summaryFont).toBe('13px')
  // 全程无错误消息：web 模式无 Tauri invoke，工厂注入生效即不该出现 AI_TRANSPORT_UNAVAILABLE
  await expect(page.getByTestId('ai-msg-error')).toHaveCount(0)
  // 回合结束：回到发送态（停止钮消失）
  await expect(page.getByTestId('ai-send')).toBeVisible({ timeout: 15_000 })
})

// 输入区交互（2026-09 长内容输入批）：快捷键（Enter 发送/Shift+Enter 换行 + 常显提示）
// 与拖高手柄（上缘拖拽扩高，消息区 flex 让位）。fake transport 同 beforeEach：首轮
// tool_calls 真实落画布，第二轮纯文本收尾——本用例只关心回合走完回到发送态。
test('AI 输入：Enter 发送 / Shift+Enter 换行 / 拖高手柄', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/?e2e=1')

  await page.getByTestId('btn-settings').click()
  await page.getByTestId('set-ai-baseurl').fill('https://fake.local/v1')
  await page.getByTestId('set-ai-key').fill('sk-e2e')
  await page.getByTestId('set-ai-model').fill('fake-model')
  await page.getByTestId('set-ai-save').click()
  await page.keyboard.press('Escape')

  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('AI 输入测试')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('AI 输入测试').first()).toBeVisible()

  await page.getByTestId('ai-toggle').click()
  await expect(page.getByTestId('ai-panel')).toBeVisible()
  // 快捷键提示常显（输入区底部）
  await expect(page.getByTestId('ai-input-hint')).toHaveText(/Enter 发送/)

  // lute 预热（同上用例：消除 vditor addScript 双 script 竞态噪音）
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
      s.onerror = () => resolve()
      document.head.append(s)
    })
  })

  const input = page.getByTestId('ai-input')
  // Shift+Enter 换行：值含换行、不触发发送
  await input.click()
  await page.keyboard.type('第一行')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('第二行')
  await expect(input).toHaveValue('第一行\n第二行')
  await expect(page.getByTestId('ai-msg-user')).toHaveCount(0)

  // Enter 发送：用户消息入流（原文含换行），回合走完回到发送态
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('ai-msg-user')).toHaveText('第一行\n第二行')
  await expect(page.getByTestId('ai-send')).toBeVisible({ timeout: 15_000 })

  // 拖高手柄：上缘向上拖 120px，输入框实际增高（消息区 flex-1 自动让位）
  const before = await input.evaluate((el) => el.offsetHeight)
  const box = await page.getByTestId('ai-input-resizer').boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width / 2, box!.y - 120, { steps: 5 })
  await page.mouse.up()
  const after = await input.evaluate((el) => el.offsetHeight)
  expect(after - before).toBeGreaterThanOrEqual(100)
})
