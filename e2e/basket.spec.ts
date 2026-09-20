import { expect, test, type Page } from '@playwright/test'

// 点子篮子 M1 全链路 e2e（2026-09，spec §9）：?basket=1 预置见 src/test/e2eHarness.ts——
// /ws/点子篮子.md（根 + 点子甲/点子乙）、/ws/项目/项目图.md（含可挂点「待办」「归档」两候选，
// 供判别式断言排除「挂载无视选定节点」的假通过）、/ws/普通图.md，
// 并按 cfg.basketPath 锚定篮子身份（isBasket 判定 / 徽章 / 整理入口共用该锚）。
// 磁盘断言一律走 __zenE2e.readFile（内存 FS）。两条捕获路径分开钉：
//   ① 当前图**非**篮子 → 捕获落文件层（写盘先于 toast，读完即定论）；
//   ② 当前图即篮子 → 捕获走引擎端口（spec §4.2 就近引擎：只动内存态 + 撤销栈，
//      落盘须保存链冲刷——故断言前显式 Ctrl+S / 等 leaveTo 的返回保存）

/** 内存 FS 读盘（文件不存在即抛异常，与真实 FS 同义） */
async function readFile(page: Page, path: string): Promise<string> {
  return page.evaluate(
    (p) => (window as unknown as { __zenE2e: { readFile(path: string): Promise<string> } }).__zenE2e.readFile(p),
    path,
  )
}

/** AI fake transport 记录的两阶段 prompt（fake 在 window.__aiCalls 逐次追加，AI 场景专用） */
async function aiCalls(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __aiCalls?: string[] }).__aiCalls ?? [])
}

/** md 去空行行数组：serialize 逐节点一行、块间空行——[0] = 根标题，[1] = 根的第一子节点 */
function mdLines(md: string): string[] {
  return md
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
}

/** 等捕获浮层**完全退场**（Radix 退场动画 ~200ms 内浮层仍在 DOM：焦点滞留输入框、
 *  遮罩仍拦指针——此时按 Undo 会被输入域守卫吞掉、点浮层下的按钮会被拦）。
 *  与「提交已完成」无关：那是 toast 可见的语义 */
function waitCaptureClosed(page: Page) {
  return expect(page.getByTestId('capture-input')).toHaveCount(0)
}

test('篮子全链路：快捷键捕获入篮（文件层）→ 整理挂载 → 目标图/篮子断言 → 撤销', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/?e2e=1&basket=1')

  // 案头预置齐备：篮子文件行带徽章（Task 10：徽章贴名称末尾）、普通图文件行
  await expect(page.getByTestId('file-node-点子篮子')).toBeVisible()
  await expect(page.getByTestId('file-node-普通图')).toBeVisible()
  await expect(page.getByTestId('file-node-点子篮子').getByTestId('basket-badge')).toBeVisible()

  // 打开普通图（非篮子图）：砚栏在场，整理入口不出现（篮子语义不外溢到普通导图）
  await page.getByTestId('file-node-普通图').dblclick()
  await expect(page.getByTestId('zen-bar')).toBeVisible()
  await expect(page.getByTestId('btn-sort-basket')).toHaveCount(0)

  // 应用内 Ctrl+Alt+I 捕获：当前图非篮子 → 文件层写入（captureIdea 落盘先于 toast，读完即断言）
  await page.keyboard.press('Control+Alt+i')
  await expect(page.getByTestId('capture-input')).toBeVisible()
  await page.getByTestId('capture-input').fill('e2e 新点子')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('toast')).toBeVisible()

  const afterCapture = await readFile(page, '/ws/点子篮子.md')
  expect(afterCapture).toContain('e2e 新点子')
  expect(mdLines(afterCapture)[1]).toContain('e2e 新点子') // 根的第一子节点（提首位语义）

  // 回案头 → 打开篮子图：整理入口出现；胶囊条在列、篮子徽章贴篮子胶囊（Task 10）
  await waitCaptureClosed(page)
  await page.getByTestId('btn-back').click()
  await expect(page.getByTestId('file-node-点子篮子')).toBeVisible()
  await page.getByTestId('file-node-点子篮子').dblclick()
  await expect(page.getByTestId('btn-sort-basket')).toBeVisible()
  const tabs = page.getByTestId('map-tabs')
  await expect(tabs.getByTestId('map-tab').filter({ hasText: '点子篮子' }).getByTestId('basket-badge')).toBeVisible()

  // 整理浮层：清单 = 篮子当前内容（引擎根子节点），捕获的新点子在首位
  await page.getByTestId('btn-sort-basket').click()
  await expect(page.getByTestId('basket-sort')).toBeVisible()
  await expect(page.getByTestId('sort-row')).toHaveCount(3)
  await expect(page.getByTestId('sort-row').first()).toContainText('e2e 新点子')

  // 给「点子甲」选目标：项目图 › 待办（sort-pick 按行取，首行不是它）
  await page.getByTestId('sort-row').filter({ hasText: '点子甲' }).getByTestId('sort-pick').click()
  await expect(page.getByTestId('basket-picker')).toBeVisible()
  await page.getByTestId('picker-map-项目图').click()
  await expect(page.getByTestId('picker-node-待办')).toBeVisible()
  await page.getByTestId('picker-node-待办').click()
  await expect(page.getByTestId('sort-row').filter({ hasText: '点子甲' })).toContainText('待办') // 选毕回显目标

  // 批量挂载 → 结果面板（挂载先写目标图，写毕才开面板）
  await page.getByTestId('sort-mount-selected').click()
  await expect(page.getByTestId('sort-result')).toBeVisible()
  // 判别式断言：钉的是「挂到**选定节点**」语义，而非「目标图里出现过该条」——预置两个候选点
  // （待办 / 归档），故须「落在待办下」且「归档下为空」两条合起来才排除假通过：
  // 挂载无视选定节点退化到根 → 点子甲升为深度 2 顶掉某行；退化到首个节点在此例同待办（等价），
  // 但落到归档一律换位。`sort-row` 回显只证 UI 选择态，不证管线采纳
  const targetMd = await readFile(page, '/ws/项目/项目图.md')
  const targetLines = mdLines(targetMd)
  expect(targetLines[0]).toContain('项目图') // 首行 = 根
  expect(targetLines[1]).toContain('待办')
  expect(targetLines[2]).toContain('点子甲') // 选定节点「待办」的子节点位（深度 3）
  expect(targetLines[3]).toContain('归档')
  expect(targetLines).toHaveLength(4) // 归档下为空（挂错节点即换位/多行）
  expect(targetMd).not.toContain('点子乙') // 未选行不动

  // 摘除篮子条目走「就近引擎」（当前图 = 篮子图）：内存态已摘、文件要等保存链冲刷。
  // 前提：编辑器 Ctrl+S **不经** anyDialog 互斥（useEditorHotkeys 的互斥只包切换族/正文面板/
  // Alt+←；Ctrl+C 与三态直达刻意不进）——故结果浮层开着也能冲刷；将来若给 Ctrl+S 加对话框
  // 互斥，本行不再由这次显式保存兑现（AUTOSAVE_MS=5s 的自动保存可能在 poll 窗内兜住）
  expect(await readFile(page, '/ws/点子篮子.md')).toContain('点子甲')
  await page.keyboard.press('Control+s') // 显式保存冲刷（自动保存另有 5s 防抖）
  await expect
    .poll(async () => readFile(page, '/ws/点子篮子.md'), { timeout: 10_000 })
    .not.toContain('点子甲')

  // 撤销本次挂载：目标图摘除 + 篮子恢复（恢复同走引擎，再冲刷一次）
  await page.getByTestId('sort-undo').click()
  await expect
    .poll(async () => readFile(page, '/ws/项目/项目图.md'), { timeout: 10_000 })
    .not.toContain('点子甲')
  await page.keyboard.press('Control+s')
  await expect
    .poll(async () => readFile(page, '/ws/点子篮子.md'), { timeout: 10_000 })
    .toContain('点子甲')
  // 撤销后清单按引擎现态重扫：点子甲回到首位，三条俱在
  await expect(page.getByTestId('sort-row')).toHaveCount(3)
  await expect(page.getByTestId('sort-row').first()).toContainText('点子甲')
})

test('篮子引擎路径：篮子图内捕获走引擎（不即时落盘）→ 返回保存后新点子在根的第一子节点位', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.goto('/?e2e=1&basket=1')

  // 打开篮子图：本图即篮子 → 整理入口出现（isBasket 判定）
  await page.getByTestId('file-node-点子篮子').dblclick()
  await expect(page.getByTestId('btn-sort-basket')).toBeVisible()

  // 快捷键捕获：当前图 = 篮子图 → 走引擎端口（spec §4.2），只动内存态不写盘
  await page.keyboard.press('Control+Alt+i')
  await expect(page.getByTestId('capture-input')).toBeVisible()
  await page.getByTestId('capture-input').fill('e2e 引擎点子')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('toast')).toBeVisible()
  // 引擎路径的证据：此刻文件里没有该条（文件层路径的写盘先于 toast；自动保存 5s 防抖尚未到点）
  expect(await readFile(page, '/ws/点子篮子.md')).not.toContain('e2e 引擎点子')

  // 画布出现新节点（引擎内存态已改）
  await expect(page.getByText('e2e 引擎点子').first()).toBeVisible()

  // 撤销栈可用（Task 9 机制收口）：捕获入史后 btn-undo 转可用 → Ctrl+Z 撤销该条 → 画布消失。
  // 须等浮层退场（见 waitCaptureClosed）：退场窗口内焦点在输入框，Ctrl+Z 被输入域守卫吞掉
  await waitCaptureClosed(page)
  await expect(page.getByTestId('btn-undo')).toBeEnabled()
  await page.keyboard.press('Control+z')
  await expect(page.getByText('e2e 引擎点子').first()).toBeHidden()

  // 撤销后重来一次（同一条目再捕获），后续断言以这一次为准
  await page.keyboard.press('Control+Alt+i')
  await expect(page.getByTestId('capture-input')).toBeVisible()
  await page.getByTestId('capture-input').fill('e2e 引擎点子')
  await page.keyboard.press('Enter')
  await expect(page.getByText('e2e 引擎点子').first()).toBeVisible()
  await waitCaptureClosed(page)

  // 返回案头（leaveTo 安全链：显式保存成功才导航）→ 引擎内存态随保存落盘
  await page.getByTestId('btn-back').click()
  await expect(page.getByTestId('file-node-点子篮子')).toBeVisible()
  await expect
    .poll(async () => readFile(page, '/ws/点子篮子.md'), { timeout: 10_000 })
    .toContain('e2e 引擎点子')

  // 位置收口（Task 9「数据层 splice 提首位」）：新点子在根的第一个子节点位，既有条目不乱序
  const md = await readFile(page, '/ws/点子篮子.md')
  expect(mdLines(md)[0]).toContain('点子篮子') // 首行 = 根
  expect(mdLines(md)[1]).toContain('e2e 引擎点子') // 次行 = 根的第一个子节点
  expect(mdLines(md)[2]).toContain('点子甲')
  expect(mdLines(md)[3]).toContain('点子乙')
})

// AI 推荐全链路（M3，spec §6）：fake transport 双阶段回放（phase1 选图 → phase2 定位，
// askPlacement 每阶段恰一次 transport.start，以调用序区分）→ 预填 → 白名单拒绝判别 →
// 挂载落盘。?ai=1 仅点亮 AI 按钮（BYOK 预置见 e2eHarness），真实网络由本 fake 接管
test('AI 推荐：两阶段 fake → 预填正确目标 → 白名单拒绝 → 挂载落盘', async ({ page }) => {
  test.setTimeout(60_000)
  // addInitScript 注入浏览器原样执行：保持纯 JS（类型标注不进序列化产物，按最保守口径书写）
  await page.addInitScript(() => {
    let i = 0
    const w = window
    w.__AI_TRANSPORT_FACTORY__ = () => ({
      start(payload, onDelta) {
        i++
        // 记录两阶段 prompt 供白名单断言（phase1=选图清单、phase2=候选细大纲）
        if (!Array.isArray(w.__aiCalls)) w.__aiCalls = []
        w.__aiCalls.push(payload.body.messages[0].content)
        const phase1 = JSON.stringify({
          placements: [
            // 双候选（项目图/普通图都在白名单）：供落盘判别排除「退化到首个候选」假通过
            { idea: '点子甲', candidates: [{ mapPath: '/ws/项目/项目图.md' }, { mapPath: '/ws/普通图.md' }] },
            // 清单外路径 → 白名单拒绝，该行必须保持未选（手选兜底口径）
            { idea: '点子乙', candidates: [{ mapPath: '/etc/evil.md' }] },
          ],
        })
        const phase2 = JSON.stringify({
          placements: [
            { idea: '点子甲', mapPath: '/ws/项目/项目图.md', path: ['项目图', '待办'] },
            // 即便模型对被拒点子也硬回了定位，白名单+路径精确校验仍必须拒之门外
            { idea: '点子乙', mapPath: '/etc/evil.md', path: ['x', 'y'] },
          ],
        })
        // 回放必须包成 OpenAI chunk JSON：parseDeltaChunk 只认 choices[0].delta.content，
        // 裸 JSON 串被静默丢弃 → 收成空文本 → parseFailed
        onDelta(JSON.stringify({ choices: [{ delta: { content: i === 1 ? phase1 : phase2 } }] }))
        return Promise.resolve({ endedWith: 'done' })
      },
      abort() {},
    })
  })
  await page.goto('/?e2e=1&basket=1&ai=1')

  // 打开篮子图 → 整理浮层（导航同场景一）
  await page.getByTestId('file-node-点子篮子').dblclick()
  await expect(page.getByTestId('btn-sort-basket')).toBeVisible()
  await page.getByTestId('btn-sort-basket').click()
  await expect(page.getByTestId('basket-sort')).toBeVisible()
  await expect(page.getByTestId('sort-row')).toHaveCount(2)

  // AI 一键整理（无目标行 = 全部两行）
  await page.getByTestId('sort-ai-all').click()

  // 判别式一（预填正确目标）：甲预填到「项目图›待办」——规范 MountTarget 显示口径
  // （AI 链 ['项目图','待办'] → path 去根、显示拼节点自身 = 《项目图》› 待办）
  await expect(page.getByText(/《项目图》› 待办/)).toBeVisible()
  // 甲已有目标 → 行内 pick 钮消失（换为点目标列）
  await expect(page.getByTestId('sort-row').filter({ hasText: '点子甲' }).getByTestId('sort-pick')).toHaveCount(0)
  // 判别式二（白名单拒绝）：乙的候选 /etc/evil.md 不在喂给 AI 的图清单内 → 预填阶段被剔、
  // phase2 硬回的定位也被 toMountTarget 拒 → 行保持未选（pick 在、无《evil》回显）
  await expect(page.getByTestId('sort-row').filter({ hasText: '点子乙' }).getByTestId('sort-pick')).toBeVisible()
  await expect(page.getByText(/《evil》/)).toHaveCount(0)

  // 白名单旁证（spec §6.3 硬约束的喂入面）：两阶段 prompt 只含白名单图，篮子自身不入清单
  const calls = await aiCalls(page)
  expect(calls).toHaveLength(2)
  expect(calls[0]).toContain('/ws/项目/项目图.md')
  expect(calls[0]).toContain('/ws/普通图.md')
  expect(calls[0]).not.toContain('点子篮子.md')
  expect(calls[1]).toContain('/ws/项目/项目图.md')
  expect(calls[1]).not.toContain('点子篮子.md')

  // 挂载已选（仅甲）→ 落盘判别（同场景一口径：预置双候选点「待办/归档」钉「挂到选定节点」，
  // 挂载无视选定节点退化到首个节点/根时必然换位或多行）
  await page.getByTestId('sort-mount-selected').click()
  await expect(page.getByTestId('sort-result')).toBeVisible()
  const targetMd = await readFile(page, '/ws/项目/项目图.md')
  const targetLines = mdLines(targetMd)
  expect(targetLines[0]).toContain('项目图') // 首行 = 根
  expect(targetLines[1]).toContain('待办')
  expect(targetLines[2]).toContain('点子甲') // 选定节点「待办」的子节点位
  expect(targetLines[3]).toContain('归档')
  expect(targetLines).toHaveLength(4) // 归档下为空
  expect(targetMd).not.toContain('点子乙') // 被拒行不落盘

  // 篮子摘除走就近引擎（当前图 = 篮子图）：显式 Ctrl+S 冲刷（同场景一；结果浮层开着也能冲刷）
  await page.keyboard.press('Control+s')
  await expect
    .poll(async () => readFile(page, '/ws/点子篮子.md'), { timeout: 10_000 })
    .not.toContain('点子甲')
  expect(await readFile(page, '/ws/点子篮子.md')).toContain('点子乙') // 未挂条目留篮
})
