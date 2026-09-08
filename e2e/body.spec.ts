import { expect, test } from '@playwright/test'

// 正文面板端到端（2026-09 写作；2026-09-06 备注合并纯文本化收口）：面板真实键入 →
// 关面板冲刷防抖 → 显式保存落盘 → 返回案头重开正文仍在。md 侧往返（正文块 ⇄ data.body）
// 已由 mdTree 单测钉死，此处覆盖面板接线（选中载入/防抖写回/flush）与落盘链路。
// 键入驱动走真实交互：body-editor 是原生 textarea（Tiptap 已卸载），直接 click 聚焦后
// keyboard.type——引擎 KeyCommand 的 defaultEnableCheck 只认 body 焦点（面板 textarea
// 不在其列，画布快捷键 Tab 插节点等不误触），宿主 window 监听仅截 Ctrl 命令族
// （Ctrl+S 保存照常、Ctrl+C 放行 textarea 原生复制），Enter 原生换行无任何拦截。
// 原 note.spec 全链路用例随备注对话框退役并入本文件（备注 = 正文，同一面板）。
test('正文：面板写入→保存→回案头重开正文仍在、md 含正文段', async ({ page }) => {
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

  // 选中「要点」→ 开面板 → 点击 textarea 聚焦 → 真实键入正文
  await page.getByText('要点').first().click()
  await page.getByTestId('btn-body').click()
  await expect(page.getByTestId('body-panel')).toBeVisible()
  const editor = page.getByTestId('body-editor')
  await editor.click()
  await page.keyboard.type('围绕要点的论述。')
  // 字数条即时随键入走（中文字数口径：去空白码点数，含句号共 8）
  await expect(page.getByTestId('body-wordcount')).toHaveText('8 字')

  // 关面板即冲刷防抖窗内草稿（SET_NODE_DATA 置脏）→ 显式保存 → 读盘精确断言
  await page.getByTestId('body-close').click()
  await expect(page.getByTestId('body-panel')).toHaveCount(0)
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

  // 返回案头 → 重开（面板已收起，「要点」文本唯一指画布节点）→ 正文随 data.body 载回
  await page.getByTestId('btn-back').click()
  await page.getByTestId('file-node-正文测试').dblclick()
  await expect(page.getByText('要点').first()).toBeVisible()
  await page.getByText('要点').first().click()
  await page.getByTestId('btn-body').click()
  await expect(page.getByTestId('body-panel')).toBeVisible()
  await expect(page.getByTestId('body-editor')).toHaveValue('围绕要点的论述。')
  await expect(page.getByTestId('body-wordcount')).toHaveText('8 字')
})

// 深层门禁（spec v1 深度限制）：根起连按 Tab×6 建到第 7 层（layerIndex=6，md 序列化
// ≥7 深进列表层），选中开面板——空态文案 + textarea 只读（readOnly 原生属性）不可键入。
// 视口加宽到 1920：引擎无自动平移，7 层单链的末层节点须在视口内可点（节点名单字压缩纵深）。
test('深层门禁：第 7 层节点开面板空态且不可编辑', async ({ page }) => {
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

  // 选中第 7 层「己」开面板：空态文案出现，textarea 只读，键入无效（value 恒空）
  await page.getByText('己').first().click()
  await page.getByTestId('btn-body').click()
  await expect(page.getByTestId('body-panel')).toBeVisible()
  await expect(page.getByTestId('body-empty')).toContainText('深层列表节点暂不支持正文')
  const editor = page.getByTestId('body-editor')
  await expect(editor).toBeEditable({ editable: false })
  await editor.click()
  await page.keyboard.type('不应写入')
  await expect(page.getByTestId('body-wordcount')).toHaveText('0 字')
  await expect(editor).toHaveValue('')
})

// 备注合并语义（2026-09-06：引用块归正文原样保留，Task 1 文法）：textarea 键入 > 行 →
// serialize 原样块紧跟节点行（前缀不剥不加）→ 重开 parse 回 body（段落与引用块是两个
// 顶层块，assignBody 以空行合并——mdTree 单测钉死，此处锁端到端面板 value 口径）。
test('正文含引用块：textarea 键入 > 行，落盘与重开原样保留（备注合并）', async ({ page }) => {
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

  // 开面板键入两行：第二行 > 开头（textarea 内换行用 Enter——原生换行，无快捷键拦截）
  await page.getByText('要点').first().click()
  await page.getByTestId('btn-body').click()
  await expect(page.getByTestId('body-panel')).toBeVisible()
  const editor = page.getByTestId('body-editor')
  await editor.click()
  await page.keyboard.type('论述。')
  await page.keyboard.press('Enter')
  await page.keyboard.type('> 引用行')
  // 字数口径含 > 符号（去空白码点：论述。＝3、>＝1、引用行＝3）
  await expect(page.getByTestId('body-wordcount')).toHaveText('7 字')

  // 关面板 flush → 显式保存 → md 精确断言：引用行紧跟论述行，前缀原样
  await page.getByTestId('body-close').click()
  await expect(page.getByTestId('dirty-badge')).toBeVisible()
  await page.keyboard.press('Control+s')
  await expect(page.getByTestId('save-stamp')).toBeVisible()
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/引用正文.md',
    ),
  )
  expect(md).toBe('# 引用正文\n\n## 要点\n论述。\n> 引用行\n')

  // 返回案头重开：两块以空行合并回 body，> 前缀原样在面板可见
  await page.getByTestId('btn-back').click()
  await page.getByTestId('file-node-引用正文').dblclick()
  await expect(page.getByText('要点').first()).toBeVisible()
  await page.getByText('要点').first().click()
  await page.getByTestId('btn-body').click()
  await expect(page.getByTestId('body-panel')).toBeVisible()
  await expect(page.getByTestId('body-editor')).toHaveValue('论述。\n\n> 引用行')
})

// 旧文件兼容（2026-09-06 备注合并）：合并前落盘的备注引用块（原 note 序列化产出：> 行
// 紧跟节点行）打开即正文——面板可见 > 前缀；打开不触发改写，编辑后再改回并保存，
// md 逐字还原（serialize 对旧格式幂等——干净态保存是 no-op 不落印，故以「改→存→回滚→存」
// 强制走两次真实落盘对照）。
test('旧文件备注打开即正文：引用块在面板可见，改回后 md 逐字还原', async ({ page }) => {
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

  // 选中「要点」开面板：引用块原样（含 > 前缀）即正文；打开本身不改写落盘文件
  await page.getByText('要点').first().click()
  await page.getByTestId('btn-body').click()
  await expect(page.getByTestId('body-panel')).toBeVisible()
  await expect(page.getByTestId('body-editor')).toHaveValue('> 旧备注内容')
  await expect(page.getByTestId('body-wordcount')).toHaveText('6 字')
  const before = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/旧备注.md',
    ),
  )
  expect(before).toBe('# 旧\n\n## 要点\n> 旧备注内容\n')

  // 面板补一字 → flush 保存：md 引用行随之延长（正文可编辑，非只读遗产）
  await page.getByTestId('body-editor').fill('> 旧备注内容补')
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
  await expect(page.getByTestId('body-panel')).toBeVisible()
  await page.getByTestId('body-editor').fill('> 旧备注内容')
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
// 入口改正文面板；mermaid 围栏即正文内容，镜像 note 驱动引擎「有 note→挂角标+悬停」
// 原生通道）：面板填图源 → 关面板 flush → 悬停角标出图 → 移出隐藏。
test('正文 mermaid：围栏正文悬停节点出图，移出隐藏', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('悬停图')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('悬停图').first()).toBeVisible()

  // 选中根 → 面板填入含 mermaid 围栏的正文（原生 textarea 可整体 fill）→ 关面板冲刷
  await page.getByText('悬停图').first().click()
  await page.getByTestId('btn-body').click()
  await expect(page.getByTestId('body-panel')).toBeVisible()
  await page.getByTestId('body-editor').fill('流程说明：\n```mermaid\ngraph LR\n  A --> B\n```')
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
