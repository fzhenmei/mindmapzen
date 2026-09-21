import { expect, test } from '@playwright/test'

// e2e/ai-full-editing.spec.ts —— AI 全面修改导图（spec §4）：fake transport 多工具回合
// （标签→正文→连线→布局）落真引擎；布局回合切 ZenBar 激活态。uid 从 system prompt 树行动态提取。
// 回合拓扑：首轮用户消息的 agent 循环连跑四轮工具轮（fake 按 __aiRound 计数一轮派一工具，
// 工具结果回灌后 transport 再起——四张卡片全挂首轮 assistant），第五轮起收尾文本「完成」；
// 后续三条消息各得一条收尾文本（覆盖多轮对话历史回传链路）。

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __AI_TRANSPORT_FACTORY__: unknown; __aiRound?: number }
    w.__AI_TRANSPORT_FACTORY__ = () => ({
      start(payload: { body: { messages: Array<{ role: string; content: string }> } }, onDelta: (d: string) => void) {
        const sys = payload.body.messages.find((m) => m.role === 'system')?.content ?? ''
        // 根 uid 锚定行首（ai.spec.ts 同款）：system prompt 的说明行含字面 "- [uid] 文本"，
        // 非锚定正则首个命中是它；树根行无缩进、子节点行有缩进，行首锚定唯一命中根
        const rootUid = (sys.match(/^- \[([^\]]+)\]/m) ?? [])[1] ?? 'root'
        // 树行提第一个子节点 uid（缩进 2 空格行；空白新图仅根节点，用例已先 UI 建好一个子节点）
        const childUid = (sys.match(/^ {2}- \[([^\]]+)\]/m) ?? [])[1] ?? rootUid
        // 分片内容嵌入 chunk JSON 前必须转义（裸模板拼接引号不闭合 → 非法 JSON，
        // parseDeltaChunk 静默丢弃、流式 tool_calls 全丢——ai.spec.ts 同款教训）
        const esc = (s: string): string => JSON.stringify(s).slice(1, -1)
        const tool = (id: string, name: string, args: string): string =>
          `{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"${id}","function":{"name":"${name}","arguments":"${esc(args)}"}}]}}]}`
        if (!w.__aiRound) {
          w.__aiRound = 1
          onDelta(tool('c1', 'set_node_tags', JSON.stringify({ uid: childUid, tags: ['要点'] })))
          onDelta('{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}')
          return Promise.resolve({ endedWith: 'done' as const })
        }
        if (w.__aiRound === 1) {
          w.__aiRound = 2
          onDelta(tool('c2', 'set_node_body', JSON.stringify({ uid: childUid, text: '正文内容' })))
          onDelta('{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}')
          return Promise.resolve({ endedWith: 'done' as const })
        }
        if (w.__aiRound === 2) {
          w.__aiRound = 3
          onDelta(tool('c3', 'add_link', JSON.stringify({ fromUid: rootUid, toUid: childUid })))
          onDelta('{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}')
          return Promise.resolve({ endedWith: 'done' as const })
        }
        if (w.__aiRound === 3) {
          w.__aiRound = 4
          onDelta(tool('c4', 'set_layout', JSON.stringify({ kind: 'timeline' })))
          onDelta('{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}')
          return Promise.resolve({ endedWith: 'done' as const })
        }
        onDelta('{"choices":[{"delta":{"content":"完成"}}]}')
        onDelta('{"choices":[{"delta":{},"finish_reason":"stop"}]}')
        return Promise.resolve({ endedWith: 'done' as const })
      },
      abort() {},
    })
  })
})

test('AI 多工具回合：标签/正文/连线/布局全部落地', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/?e2e=1')

  // 案头配置 BYOK（设置对话框是库视图入口，先进设置；同 ai.spec.ts）
  await page.getByTestId('btn-settings').click()
  await page.getByTestId('set-ai-baseurl').fill('https://fake.local/v1')
  await page.getByTestId('set-ai-key').fill('sk-e2e')
  await page.getByTestId('set-ai-model').fill('fake-model')
  await page.getByTestId('set-ai-save').click()
  await page.keyboard.press('Escape')

  // 新建导图：createMap 缺省 = 空白图仅根节点（根文本即文件名），set_node_tags 需要子
  // uid——先 UI 建一个子节点再开 AI 面板（点根 → Tab → 等编辑框 → 输入 → 点空白提交）
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('AI 全面修改测试')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('AI 全面修改测试').first()).toBeVisible()
  await page.getByText('AI 全面修改测试').first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('分支一')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()

  // 开面板
  await page.getByTestId('ai-toggle').click()
  await expect(page.getByTestId('ai-panel')).toBeVisible()

  // lute 预热（ai.spec.ts 同款）：多工具回合里每轮工具后的空文本 finalize 都会挂/卸
  // MarkdownPreview，vditor addScript 双 script 竞态会把最终「完成」文本清成空白——
  // 预先装好 lute 消除该上游竞态噪音
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

  // 连发四条消息。回合完成信号：用户消息计数到位（pushUser 与 setPhase('streaming') 在
  // 同一同步段提交、同一 React 批次生效，计数可见即回合确已开跑）→ ai-send 重现（回合
  // finally 置 idle 回发送态）。不能用「完成」文本当信号：首轮后旧文本常驻，后续回合
  // 瞬间误过，而 Enter 在非 idle 被 handleSend 静默拦截、消息丢失只能等超时
  const send = async (n: number, text: string): Promise<void> => {
    await page.getByTestId('ai-input').fill(text)
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('ai-msg-user')).toHaveCount(n)
    await expect(page.getByTestId('ai-send')).toBeVisible({ timeout: 30_000 })
  }
  await send(1, '给子节点加标签')
  await send(2, '写正文')
  await send(3, '连一条线')
  await send(4, '切时间轴布局')

  // 四卡片全成功：卡片全挂首轮 assistant（notice 安全网卡前插后 messages=[notice,user,
  // assistant]，实际 testid 为 ai-card-2-0..3）——按 ai.spec.ts 先例不钉消息下标（notice
  // 插入曾使下标漂移），testid 前缀 + 词典文案过滤；✓ 是成功卡专属图标（失败卡为 ✕ +
  // 「（失败）」后缀），共 4 张 = 无失败卡、无多余工具轮
  await expect(page.getByTestId(/^ai-card-/)).toHaveCount(4)
  for (const label of ['设置标签', '改写正文', '添加连线', '切换布局']) {
    await expect(page.getByTestId(/^ai-card-/).filter({ hasText: label })).toContainText('✓')
  }
  // 收尾文本经 MarkdownPreview 渲染（lute 预热后可判）；全程无错误消息（web 模式工厂
  // 注入生效即不该出现 AI_TRANSPORT_UNAVAILABLE）
  await expect(page.getByText('完成').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('ai-msg-error')).toHaveCount(0)

  // 连线落画布：一条关联线 = 容器直挂 2 个 path（可见线 + 透明点击线，links.spec 同口径；
  // 箭头 marker 内 path 非直挂子元素不计）
  await expect(page.locator('.smm-associative-line-container > path')).toHaveCount(2, { timeout: 10_000 })

  // 布局激活态切到 timeline：timeline 是「更多布局」下拉收起项（常驻钮只有 mindmap/
  // logic/org，不在常驻 DOM）；激活走 btn-layout-more 的 data-active 通道（DropdownMenuTrigger
  // 遮蔽 data-state，ZenBar 官方规避）。先关 AI 面板——面板 z-20 浮层盖住顶栏右段，
  // 不关则布局钮被面板 form 区拦截点不到
  await page.getByTestId('ai-close').click()
  await expect(page.getByTestId('ai-panel')).toHaveCount(0)
  await expect(page.getByTestId('btn-layout-more')).toHaveAttribute('data-active', '')
  await page.getByTestId('btn-layout-more').click()
  const tl = page.getByTestId('layout-timeline')
  await expect(tl).toBeVisible()
  await expect(tl).toHaveAttribute('aria-checked', 'true')
})
