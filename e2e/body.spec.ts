import { expect, test } from '@playwright/test'

// 正文编辑弹窗端到端（2026-09 写作；2026-09-06 备注合并纯文本化收口；2026-09-08 弹窗化
// + VDitor 重写）：btn-body 开模态弹窗 → sv 编辑器真实键入 → 关弹窗冲刷防抖 → 显式保存
// 落盘 → 返回案头重开正文仍在。md 侧往返（正文块 ⇄ data.body）已由 mdTree 单测钉死，
// 此处覆盖弹窗接线（选中载入/防抖写回/flush/Esc 与 × 等价）与落盘链路。
//
// vditor 4.0.0 sv 编辑区实测 DOM：<textarea class="vditor-sv vditor-reset">（dist 源码
// sv/index.ts 即 createElement("textarea")；contenteditable 是 ir/wysiwyg 模式的 DOM，
// sv 不是）——编辑区定位用 [data-testid="body-editor"] textarea（弹窗内唯一 textarea），
// 取值断言 toHaveValue（原生 value 口径，逐字精确，强于子串包含）。键入走真实交互：
// click 聚焦后 keyboard.type；fill 原生整体替换。vditor 构造两段异步（i18n/lute 脚本
// 加载 → initUI 挂 DOM 并同步写初值），locator 的自动等待覆盖该窗口，textarea 可交互
// 时初值必已就位，无键入被初值覆盖的竞态。
test('正文：弹窗写入→Esc 关闭→保存→回案头重开正文仍在、md 含正文段', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('正文测试')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('正文测试').first()).toBeVisible()

  // 建子节点「要点」（点根 → Tab → 等编辑框 → 输入 → 点空白提交）
  await page.getByText('正文测试').first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('要点')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()

  // 选中「要点」→ 开弹窗 → 聚焦 sv 编辑区 → 真实键入正文
  await page.getByText('要点').first().click()
  await page.getByTestId('btn-body').click()
  await expect(page.getByTestId('body-dialog')).toBeVisible()
  const editor = page.getByTestId('body-editor').locator('textarea')
  await editor.click()
  await page.keyboard.type('围绕要点的论述。')
  // 字数条即时随键入走（中文字数口径：去空白码点数，含句号共 8）
  await expect(page.getByTestId('body-wordcount')).toHaveText('8 字')

  // Esc 关闭（与 × 等价；焦点在编辑区内——Radix 关闭层挂 document 捕获阶段，Esc 先于
  // vditor textarea 自身的 keydown 拦截到达，关闭即冲刷防抖草稿 SET_NODE_DATA 置脏）
  // → 显式保存 → 读盘精确断言
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('body-dialog')).toHaveCount(0)
  await expect(page.getByTestId('dirty-badge')).toBeVisible()
  await page.keyboard.press('Control+s')
  await expect(page.getByTestId('save-stamp')).toBeVisible()
  // serialize 顺序：节点行 → 正文（原样块）→ 子结构；镜像 note 不进 md
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/正文测试.md',
    ),
  )
  expect(md).toBe('# 正文测试\n\n## 要点\n围绕要点的论述。\n')

  // 返回案头 → 重开（弹窗已收起，「要点」文本唯一指画布节点）→ 正文随 data.body 载回
  await page.getByTestId('btn-back').click()
  await page.getByTestId('file-node-正文测试').dblclick()
  await expect(page.getByText('要点').first()).toBeVisible()
  await page.getByText('要点').first().click()
  await page.getByTestId('btn-body').click()
  await expect(page.getByTestId('body-dialog')).toBeVisible()
  await expect(page.getByTestId('body-editor').locator('textarea')).toHaveValue('围绕要点的论述。')
  await expect(page.getByTestId('body-wordcount')).toHaveText('8 字')
})

// Esc 等价性（2026-09-08 弹窗化新增）：主链路用例覆盖「编辑中 Esc → 冲刷 → 脏 → 落盘」，
// 此处锁另一半——未编辑直接 Esc：弹窗关闭且不置脏（无 pending 草稿，flushNow 无命令），
// 重开内容原样（构造初值 = data.body 逐字载入 sv 缓冲区）。注：vditor getMarkdown 对无
// 尾换行的键入值恒补单个 \n（value+"\n" 后归一双尾换行）——同会话重开的 value 逐字含
// 该尾换行，属编辑器缓冲区原文口径，非断言放水。
test('Esc 等价：未编辑关闭不置脏，重开内容原样', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('Esc等价')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('Esc等价').first()).toBeVisible()

  // 建子节点「要点」并写一段正文 → Esc 冲刷落盘 → 保存至干净态（脏印消失）
  await page.getByText('Esc等价').first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('要点')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()
  await page.getByText('要点').first().click()
  await page.getByTestId('btn-body').click()
  await expect(page.getByTestId('body-dialog')).toBeVisible()
  const editor = page.getByTestId('body-editor').locator('textarea')
  await editor.click()
  await page.keyboard.type('存稿论述。')
  await expect(page.getByTestId('body-wordcount')).toHaveText('5 字')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('body-dialog')).toHaveCount(0)
  await expect(page.getByTestId('dirty-badge')).toBeVisible()
  await page.keyboard.press('Control+s')
  await expect(page.getByTestId('save-stamp')).toBeVisible()
  await expect(page.getByTestId('dirty-badge')).toHaveCount(0)

  // 重开（选中仍在）：正文逐字回显（含 vditor 补的尾换行）→ 未编辑 Esc → 不再置脏
  await page.getByTestId('btn-body').click()
  await expect(page.getByTestId('body-dialog')).toBeVisible()
  await expect(editor).toHaveValue('存稿论述。\n')
  await expect(page.getByTestId('body-wordcount')).toHaveText('5 字')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('body-dialog')).toHaveCount(0)
  await expect(page.getByTestId('dirty-badge')).toHaveCount(0)
})

// 深层门禁（spec v1 深度限制）：根起连按 Tab×6 建到第 7 层（layerIndex=6，md 序列化
// ≥7 深进列表层），选中开弹窗——空态文案出现且不渲染编辑器（BodyDialog 出文案分支，
// 弹窗内无任何可键入元素——结构性门禁，取代旧 textarea readOnly 断言）。
// 视口加宽到 1920：引擎无自动平移，7 层单链的末层节点须在视口内可点（节点名单字压缩纵深）。
test('深层门禁：第 7 层节点开弹窗空态且不渲染编辑器', async ({ page }) => {
  test.setTimeout(30_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('深层门禁')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('深层门禁').first()).toBeVisible()

  // 逐层建链（每层：点父节点 → Tab → 等编辑框 → 输入 → 点空白提交）
  let parent = '深层门禁'
  for (const name of ['甲', '乙', '丙', '丁', '戊', '己']) {
    await page.getByText(parent).first().click()
    await page.keyboard.press('Tab')
    await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
    await page.keyboard.type(name)
    await page.getByRole('application').click({ position: { x: 15, y: 15 } })
    await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()
    parent = name
  }

  // 选中第 7 层「己」开弹窗：空态文案出现，编辑区不渲染，字数恒 0
  await page.getByText('己').first().click()
  await page.getByTestId('btn-body').click()
  await expect(page.getByTestId('body-dialog')).toBeVisible()
  await expect(page.getByTestId('body-empty')).toContainText('深层列表节点暂不支持正文')
  await expect(page.getByTestId('body-editor')).toHaveCount(0)
  await expect(page.getByTestId('body-wordcount')).toHaveText('0 字')
})

// 备注合并语义（2026-09-06：引用块归正文原样保留，Task 1 文法）：sv 编辑区键入 > 行 →
// serialize 原样块紧跟节点行（前缀不剥不加）→ 重开 parse 回 body（段落与引用块是两个
// 顶层块，assignBody 以空行合并——mdTree 单测钉死，此处锁端到端弹窗 value 口径）。
test('正文含引用块：sv 编辑区键入 > 行，落盘与重开原样保留（备注合并）', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('引用正文')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('引用正文').first()).toBeVisible()

  // 建子节点「要点」（点根 → Tab → 等编辑框 → 输入 → 点空白提交）
  await page.getByText('引用正文').first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('要点')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()

  // 开弹窗键入两行：第二行 > 开头（sv 编辑区内换行用 Enter——原生换行，无快捷键拦截）
  await page.getByText('要点').first().click()
  await page.getByTestId('btn-body').click()
  await expect(page.getByTestId('body-dialog')).toBeVisible()
  const editor = page.getByTestId('body-editor').locator('textarea')
  await editor.click()
  await page.keyboard.type('论述。')
  await page.keyboard.press('Enter')
  await page.keyboard.type('> 引用行')
  // 字数口径含 > 符号（去空白码点：论述。＝3、>＝1、引用行＝3）
  await expect(page.getByTestId('body-wordcount')).toHaveText('7 字')

  // × 关弹窗 flush → 显式保存 → md 精确断言：引用行紧跟论述行，前缀原样
  await page.getByTestId('body-close').click()
  await expect(page.getByTestId('body-dialog')).toHaveCount(0)
  await expect(page.getByTestId('dirty-badge')).toBeVisible()
  await page.keyboard.press('Control+s')
  await expect(page.getByTestId('save-stamp')).toBeVisible()
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/引用正文.md',
    ),
  )
  expect(md).toBe('# 引用正文\n\n## 要点\n论述。\n> 引用行\n')

  // 返回案头重开：两块以空行合并回 body，> 前缀原样在编辑区可见
  await page.getByTestId('btn-back').click()
  await page.getByTestId('file-node-引用正文').dblclick()
  await expect(page.getByText('要点').first()).toBeVisible()
  await page.getByText('要点').first().click()
  await page.getByTestId('btn-body').click()
  await expect(page.getByTestId('body-dialog')).toBeVisible()
  await expect(page.getByTestId('body-editor').locator('textarea')).toHaveValue('论述。\n\n> 引用行')
  await expect(page.getByTestId('body-wordcount')).toHaveText('7 字')
})

// 旧文件兼容（2026-09-06 备注合并）：合并前落盘的备注引用块（原 note 序列化产出：> 行
// 紧跟节点行）打开即正文——弹窗可见 > 前缀；打开不触发改写，编辑后再改回并保存，
// md 逐字还原（serialize 对旧格式幂等——干净态保存是 no-op 不落印，故以「改→存→回滚→存」
// 强制走两次真实落盘对照）。
test('旧文件备注打开即正文：引用块在弹窗可见，改回后 md 逐字还原', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await expect(page.getByTestId('btn-new')).toBeVisible() // 等 harness __zenE2e 挂载（mermaid.spec 模式）
  // 手写旧格式 md（标题间空行分隔、> 行紧跟节点行——原 note.spec 落盘断言同形）
  await page.evaluate(async () => {
    const z = (window as unknown as { __zenE2e: { writeFile(p: string, t: string): Promise<void> } }).__zenE2e
    await z.writeFile('/ws/旧备注.md', '# 旧\n\n## 要点\n> 旧备注内容\n')
  })
  await page.getByTestId('file-node-旧备注').dblclick()
  await expect(page.getByText('要点').first()).toBeVisible()

  // 选中「要点」开弹窗：引用块原样（含 > 前缀）即正文；打开本身不改写落盘文件
  await page.getByText('要点').first().click()
  await page.getByTestId('btn-body').click()
  await expect(page.getByTestId('body-dialog')).toBeVisible()
  await expect(page.getByTestId('body-editor').locator('textarea')).toHaveValue('> 旧备注内容')
  await expect(page.getByTestId('body-wordcount')).toHaveText('6 字')
  const before = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/旧备注.md',
    ),
  )
  expect(before).toBe('# 旧\n\n## 要点\n> 旧备注内容\n')

  // 弹窗补一字 → flush 保存：md 引用行随之延长（正文可编辑，非只读遗产）
  await page.getByTestId('body-editor').locator('textarea').fill('> 旧备注内容补')
  await page.getByTestId('body-close').click()
  await expect(page.getByTestId('dirty-badge')).toBeVisible()
  await page.keyboard.press('Control+s')
  await expect(page.getByTestId('save-stamp')).toBeVisible()
  const edited = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/旧备注.md',
    ),
  )
  expect(edited).toBe('# 旧\n\n## 要点\n> 旧备注内容补\n')

  // 改回原文 → 保存：md 与手写旧文件逐字一致（旧格式往返不漂移）
  await page.getByText('要点').first().click()
  await page.getByTestId('btn-body').click()
  await expect(page.getByTestId('body-dialog')).toBeVisible()
  await page.getByTestId('body-editor').locator('textarea').fill('> 旧备注内容')
  await page.getByTestId('body-close').click()
  await expect(page.getByTestId('dirty-badge')).toBeVisible()
  await page.keyboard.press('Control+s')
  await expect(page.getByTestId('save-stamp')).toBeVisible()
  const after = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/旧备注.md',
    ),
  )
  expect(after).toBe('# 旧\n\n## 要点\n> 旧备注内容\n')
})

// 正文 mermaid 画布成图（原 mermaid.spec「画布备注悬停窗」用例并入——备注对话框退役，
// 入口改正文弹窗；mermaid 围栏即正文内容，镜像 note 驱动引擎「有 note→挂角标+悬停」
// 原生通道）：弹窗填图源 → 关弹窗 flush → 悬停角标出图 → 移出隐藏。
test('正文 mermaid：围栏正文悬停节点出图，移出隐藏', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('悬停图')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('悬停图').first()).toBeVisible()

  // 选中根 → 弹窗填入含 mermaid 围栏的正文（sv 编辑区是 textarea 可整体 fill）→ 关弹窗冲刷
  await page.getByText('悬停图').first().click()
  await page.getByTestId('btn-body').click()
  await expect(page.getByTestId('body-dialog')).toBeVisible()
  await page.getByTestId('body-editor').locator('textarea').fill('流程说明：\n```mermaid\ngraph LR\n  A --> B\n```')
  await page.getByTestId('body-close').click()

  // 悬停正文角标（镜像 note → 引擎原生 .smm-node-note；直接 hover 文本元素在画布
  // transform 下坐标可能落偏，角标是更稳的命中目标）→ 悬停窗出现：vditor 预览 DOM
  // 内 mermaid 围栏自动成图（svg 直挂预览容器，无独立宿主 testid；首渲染留 15s）
  const noteIcon = page.locator('.smm-node-note').first()
  await expect(noteIcon).toBeVisible()
  await noteIcon.hover()
  const tip = page.getByTestId('zen-note-tip')
  await expect(tip).toBeVisible()
  await expect(tip).toContainText('流程说明：')
  await expect(tip.locator('svg')).toBeVisible({ timeout: 15_000 })

  // 移出节点 → 悬停窗隐藏
  await page.getByTestId('btn-save').hover()
  await expect(tip).toBeHidden()
})

// R1 往返无损（2026-09-08 spec 风险清单首项）：sv 编辑缓冲区即 <textarea>.value，
// getMarkdown 对其只做「补单尾换行 + 归一双尾换行」（无 lute 重排）——连续空行、行首
// 缩进、引用块前缀、表格逐字落盘；重开弹窗编辑区原样回显（= getValue 缓冲区原文）。
// 若本用例失败即 R1 成立，回 spec 讨论配置层修正，不得静默改断言。
test('R1 往返：连续空行/缩进/引用块/表格经 VDitor 编辑后逐字落盘', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('往返无损')
  await page.getByTestId('btn-confirm').click()
  await page.getByText('往返无损').first().click()
  await page.getByTestId('btn-body').click()
  await expect(page.getByTestId('body-dialog')).toBeVisible()
  const editor = page.getByTestId('body-editor').locator('textarea')
  await editor.fill('段一。\n\n\n缩进行:\n  嵌套列表项\n> 引用保持\n\n| a | b |\n|---|---|\n| 1 | 2 |\n')
  await page.getByTestId('body-close').click()
  await expect(page.getByTestId('dirty-badge')).toBeVisible()
  await page.keyboard.press('Control+s')
  await expect(page.getByTestId('save-stamp')).toBeVisible()
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/往返无损.md',
    ),
  )
  // 校准记录（2026-09-09 实跑定版）：根行与正文块之间无分隔空行、文件尾单个换行——
  // mdTree serialize 既有契约（emitBody 紧跟节点行 + 出口剥尾空行补单 \n，roundtrip
  // 单测同形）；brief 样例多出的两处空行据此校准，正文行逐字未动。
  expect(md).toBe('# 往返无损\n段一。\n\n\n缩进行:\n  嵌套列表项\n> 引用保持\n\n| a | b |\n|---|---|\n| 1 | 2 |\n')
  // 重开（同会话，选中仍在）：sv 缓冲区原文逐字回显——连续空行/缩进/> 前缀/表格分隔
  // 行全在（fill 原文以 \n 收尾，vditor 不再追加换行，缓冲区 = fill 原文）
  await page.getByTestId('btn-body').click()
  await expect(page.getByTestId('body-dialog')).toBeVisible()
  await expect(editor).toHaveValue('段一。\n\n\n缩进行:\n  嵌套列表项\n> 引用保持\n\n| a | b |\n|---|---|\n| 1 | 2 |\n')
})

// 工具栏 tooltip 左侧裁剪回归(2026-09-24):vditor 给 undo/redo 硬编码 tipPosition
// "nw"(tooltip 右缘锚按钮中线、向左展开),正文弹窗 DialogContent overflow-hidden 下
// 最左按钮向左展开必越弹窗左界被裁(e2e 实测 undo 越 59px 裁 64%,左侧文字不可见)。
// VditorEditor after 回调换 __ne(左缘锚中线-15px 向右展开,全程界内);mermaid 自定义
// 项缺省拼出 __undefined 无方向规则,配 n 居中。真实 vditor 渲染下锁方向类(单测 mock
// 模式锁逻辑,e2e 锁真实 DOM 产物,防 vditor 升级改内部行为)。
test('工具栏 tooltip 方向:undo/redo __ne 向右展开、mermaid __n 居中(弹窗左界不裁)', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('tooltip方向')
  await page.getByTestId('btn-confirm').click()
  await page.getByText('tooltip方向').first().click()
  await page.getByTestId('btn-body').click()
  await expect(page.getByTestId('body-dialog')).toBeVisible()
  // vditor 两段异步(脚本加载→initUI 挂 DOM):after 换类发生在 initUI 后,等按钮出现
  await page.waitForSelector('.vditor-toolbar .vditor-tooltipped', { timeout: 15_000 })
  const cls = await page.evaluate(() => {
    const q = (t: string): string =>
      document.querySelector(`.vditor-toolbar [data-type="${t}"]`)?.className ?? ''
    return { undo: q('undo'), redo: q('redo'), mermaid: q('mermaid') }
  })
  expect(cls.undo).toContain('vditor-tooltipped__ne')
  expect(cls.undo).not.toContain('__nw')
  expect(cls.redo).toContain('vditor-tooltipped__ne')
  // __n 是 __ne 的前缀,先排除 __ne 再锁 __ne 外的 __n 存在
  expect(cls.mermaid).not.toContain('vditor-tooltipped__ne')
  expect(cls.mermaid).toContain('vditor-tooltipped__n')
})
