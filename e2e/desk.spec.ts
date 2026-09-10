import { expect, test } from '@playwright/test'

// 案头用例走 ?desk=1 预置（见 e2eHarness）：/ws/项目/项目图.md + /ws/根图.md，
// 工作区已设为 /ws。2026-09 主区纯预览化两态：未选文件（idle/选中目录）→ 欢迎页；
// 树文件行单击 → 详情态（md 预览）。文件浏览与导航全在左树（目录下直列文件行）
test('案头：目录选中主区欢迎页、树文件行进详情与移动', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')

  // 左树出现预置目录「项目」与直列文件行；初始欢迎页（未选任何）
  await expect(page.getByTestId('dir-node-项目')).toBeVisible()
  await expect(page.getByTestId('file-node-根图')).toBeVisible()
  await expect(page.getByTestId('file-node-项目图')).toBeVisible()
  await expect(page.getByTestId('desk-idle')).toBeVisible()

  // 选中目录「项目」：主区仍是欢迎页（纯预览化：目录态不换主区内容）
  await page.getByTestId('dir-node-项目').click()
  await expect(page.getByTestId('desk-idle')).toBeVisible()
  await expect(page.getByTestId('file-detail')).toHaveCount(0)

  // 树文件行单击 = 选中进详情态（md 预览铺满主区）
  await page.getByTestId('file-node-根图').click()
  await expect(page.getByTestId('file-detail')).toBeVisible()
  await expect(page.getByTestId('md-preview')).toHaveText(/根图/)

  // 移动流：详情页首 btn-move → move-dialog → 选目录 → 确认。
  // 对话框树复用 dir-node-<name> testid（与左树同名），严格模式下必须以 move-dialog 圈定
  await page.getByTestId('btn-move').click()
  const dialog = page.getByTestId('move-dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByTestId('dir-node-项目').click()
  await dialog.getByTestId('move-confirm').click()

  // 移动后左树重读：根图文件行消失于根层，「项目」下两行俱在（树按目录归位）
  await expect(page.getByTestId('file-node-项目图')).toBeVisible()
  await expect(page.getByTestId('file-node-根图')).toBeVisible()

  // 磁盘断言（内存 fs）：根图内容移入项目层、根位文件消失
  const moved = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/项目/根图.md',
    ),
  )
  expect(moved).toBe('# 根图\n')
  const rootGone = await page.evaluate(async () => {
    try {
      await (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
        '/ws/根图.md',
      )
      return false
    } catch {
      return true
    }
  })
  expect(rootGone).toBe(true)
})

// 容器合并改版：窗体缩窄（header 容器 < 680px），详情动作组整组收进「更多」浮层
// （容器查询 @container 纯 CSS 分流，零 JS 测量；常驻 4 钮不受影响）
test('案头：窄窗详情动作收纳进「更多」浮层', async ({ page }) => {
  test.setTimeout(30_000)
  // 900px 视口：侧栏 256px + inset 边距后 header ≈ 628px < 680px 阈值
  await page.setViewportSize({ width: 900, height: 720 })
  await page.goto('/?e2e=1&desk=1')

  // 进详情态：宽组整组收起（btn-move 隐藏），「更多」钮出现
  await page.getByTestId('file-node-根图').click()
  await expect(page.getByTestId('file-detail')).toBeVisible()
  await expect(page.getByTestId('btn-move')).toBeHidden()
  await expect(page.getByTestId('btn-detail-more')).toBeVisible()

  // 浮层平铺全部详情动作；菜单「关闭预览」回欢迎页
  await page.getByTestId('btn-detail-more').click()
  await expect(page.getByTestId('more-btn-detail-back')).toBeVisible()
  await page.getByTestId('more-btn-detail-back').click()
  await expect(page.getByTestId('desk-idle')).toBeVisible()
})

// 2026-09 交互语义：树文件行单击=选中进详情态（md 预览），双击或详情「打开」=进纸面
test('案头：树文件行单击出详情、详情打开进纸面', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')

  // 单击根图文件行：主区切文件详情态（页首即卡头 + markdown 预览）
  await page.getByTestId('file-node-根图').click()
  await expect(page.getByTestId('file-detail')).toBeVisible()
  await expect(page.getByTestId('md-preview')).toHaveText(/根图/)
  // 仍是案头，未进纸面（命令栏不可见）
  await expect(page.getByTestId('zen-bar')).toHaveCount(0)

  // 详情态「关闭预览」回欢迎页；再进详情走「打开」按钮（双击手势的兜底入口）
  await page.getByTestId('btn-detail-back').click()
  await expect(page.getByTestId('desk-idle')).toBeVisible()
  await page.getByTestId('file-node-根图').click()
  await expect(page.getByTestId('file-detail')).toBeVisible()
  await page.getByTestId('btn-detail-open').click()
  await expect(page.getByText('根图').first()).toBeVisible()
})

// 2026-09 发布复制：详情态 btn-copy-wechat 走真渲染全链（离屏 vditor → 内联样式 →
// mermaid 成图），出 section 根 HTML 写富文本剪贴板端口（E2E web 模式记录到
// __zenE2e.lastCopiedHtml）；真实粘贴进公众号编辑器的往返验证归 docs/manual-checklist.md 真机项
test('案头：详情态「复制为公众号格式」出内联样式 HTML（mermaid 转 PNG 图）', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')
  // harness 异步装配:先等左树出现(装配完成门)再覆写预置文件加 mermaid 块(同文件名,左树无需刷新)。
  // 用正文块(引用块)形态的围栏——mermaid 实际多居于此,带 > 前缀的围栏改标是本链路的关键路径
  await expect(page.getByTestId('file-node-根图')).toBeVisible()
  await page.evaluate(() =>
    (window as unknown as { __zenE2e: { writeFile(p: string, t: string): Promise<void> } }).__zenE2e.writeFile(
      '/ws/根图.md',
      '# 根图\n\n> ```mermaid\n> graph TD\n>   A-->B\n> ```\n\n> ```ts\n> const hi = "泽"\n> ```\n',
    ),
  )
  await page.getByTestId('file-node-根图').click()
  await expect(page.getByTestId('file-detail')).toBeVisible()
  await page.getByTestId('btn-copy-wechat').click()
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __zenE2e: { lastCopiedHtml: string | null } }).__zenE2e.lastCopiedHtml,
      ),
    )
    .toContain('<section')
  const html = await page.evaluate(
    () => (window as unknown as { __zenE2e: { lastCopiedHtml: string | null } }).__zenE2e.lastCopiedHtml,
  )
  // section 根承担正文排版，标题/段落在真渲染产物上获得内联样式
  expect(html).toContain('font-size: 15px')
  expect(html).toContain('font-size: 20px')
  // mermaid 块经自有管线成图（真 mermaid.min.js + canvas 光栅化），pre 换 PNG dataURL img
  expect(html).toContain('<img')
  expect(html).toContain('data:image/png')
  expect(html).not.toContain('zen-mermaid')
  // 代码块：vditor 复制按钮壳/零宽 span 剥净（公众号侧大空白元凶），hljs token 内联色
  // （浏览器序列化把 hex 规范化为 rgb，断言按 rgb 形态）
  expect(html).not.toContain('vditor-copy')
  expect(html).not.toContain('max-height')
  expect(html).toContain('hljs-keyword')
  expect(html).toContain('color: rgb(207, 34, 46)')
})

test('案头：目录树含文件行，双击文件行打开进纸面', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')

  // 树成为完整文件视图（collapsible 文件树默认全展开）：根下与子目录下的 .md 均有文件行
  await expect(page.getByTestId('file-node-根图')).toBeVisible()
  await expect(page.getByTestId('file-node-项目图')).toBeVisible()

  // 双击根图文件行 → 打开进纸面
  await page.getByTestId('file-node-根图').dblclick()
  await expect(page.getByText('根图').first()).toBeVisible()
})

// 2026-09 树右键菜单：文件行 = 打开/移动/重命名/删除（右键即选中切预览，VSCode 惯例）；
// 目录行 = 在此新建导图/新建子目录。此处覆盖重命名与目录内新建（vitest 已覆盖删除/移动/树根）
test('案头：树右键菜单——文件行重命名、目录行在此新建导图', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')

  // 右键根图文件行：即选中进详情态 + 弹出菜单，重命名走对话框流
  await page.getByTestId('file-node-根图').click({ button: 'right' })
  await expect(page.getByTestId('file-detail')).toBeVisible()
  await page.getByTestId('ctx-btn-rename').click()
  await page.getByTestId('input-name').fill('改名图')
  await page.getByTestId('btn-confirm').click()
  // 树行换名；详情态随 mdPath 失联清理回欢迎页
  await expect(page.getByTestId('file-node-改名图')).toBeVisible()
  await expect(page.getByTestId('file-detail')).toHaveCount(0)

  // 右键「项目」目录行：在此新建导图（标题示目录、落盘建在彼处）
  await page.getByTestId('dir-node-项目').click({ button: 'right' })
  await page.getByTestId('ctx-btn-new-map').click()
  await expect(page.getByText('在「项目」新建导图')).toBeVisible()
  await page.getByTestId('input-name').fill('项目新图')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('项目新图').first()).toBeVisible() // 创建即打开进编辑器
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/项目/项目新图.md',
    ),
  )
  expect(md).toBe('# 项目新图\n')
})

test('案头：文件树折叠扳机收起子树、行面选中不折叠', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')

  // 点「项目」行面：选中目录，子树保持展开（file-node-项目图 仍可见）；主区欢迎页
  await page.getByTestId('dir-node-项目').click()
  await expect(page.getByTestId('file-node-项目图')).toBeVisible()
  await expect(page.getByTestId('desk-idle')).toBeVisible()

  // 点「项目」行尾折叠扳机（aria-label）：子树收起（文件行不可见），主区不受影响
  await page.getByRole('button', { name: '折叠「项目」' }).click()
  await expect(page.getByTestId('file-node-项目图')).toBeHidden()
  await expect(page.getByTestId('desk-idle')).toBeVisible()

  // 再点扳机展开恢复
  await page.getByRole('button', { name: '折叠「项目」' }).click()
  await expect(page.getByTestId('file-node-项目图')).toBeVisible()
})

// 2026-09 目录右键删除：整目录（含子目录与导图）进回收站；树根菜单不提供删除（工作区本体不删）
test('案头：右键目录删除——子树整删、树根菜单无删除项', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')

  // 「项目」内预置 1 张导图（项目图）：确认框报数后确认
  await page.getByTestId('dir-node-项目').click({ button: 'right' })
  await page.getByTestId('ctx-btn-delete-dir').click()
  await expect(page.getByText('该目录下 1 张导图将随目录一并移入回收站。')).toBeVisible()
  await page.getByTestId('btn-delete-confirm').click()

  // 目录行与其中文件行俱失；根层导图不受影响
  await expect(page.getByTestId('dir-node-项目')).toHaveCount(0)
  await expect(page.getByTestId('file-node-项目图')).toHaveCount(0)
  await expect(page.getByTestId('file-node-根图')).toBeVisible()

  // 磁盘断言（内存 fs）：目录内导图已不可读
  const gone = await page.evaluate(async () => {
    try {
      await (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
        '/ws/项目/项目图.md',
      )
      return false
    } catch {
      return true
    }
  })
  expect(gone).toBe(true)

  // 树根右键：有新建项但无删除项
  await page.getByTestId('dir-node-all').click({ button: 'right' })
  await expect(page.getByTestId('ctx-btn-new-dir')).toBeVisible()
  await expect(page.getByTestId('ctx-btn-delete-dir')).toHaveCount(0)
  await page.keyboard.press('Escape')
})

// 2026-09 树拖拽移动（HTML5 DnD，载荷走组件 ref——Playwright 原生 dragTo 即可驱动）：
// 文件行拖入目录（moveMap 语义）+ 目录行拖到树根（moveDir 整子树上提）
test('案头：树拖拽移动——文件拖入目录、目录整子树拖回树根', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')

  // 备料：右键「项目」新建子目录「归档」（/ws/项目/归档）
  await page.getByTestId('dir-node-项目').click({ button: 'right' })
  await page.getByTestId('ctx-btn-new-dir').click()
  await page.getByTestId('input-name').fill('归档')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByTestId('dir-node-归档')).toBeVisible()

  // 文件拖入目录：根图 → 归档（深层目录落点）
  await page.getByTestId('file-node-根图').dragTo(page.getByTestId('dir-node-归档'))
  // 磁盘断言：文件已落 /ws/项目/归档/根图.md
  const moved = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/项目/归档/根图.md',
    ),
  )
  expect(moved).toBe('# 根图\n')

  // 目录拖到树根：归档（含根图）整子树上提回 /ws/归档
  await page.getByTestId('dir-node-归档').dragTo(page.getByTestId('dir-node-all'))
  const lifted = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/归档/根图.md',
    ),
  )
  expect(lifted).toBe('# 根图\n')
  // 原位已空：旧路径不可读
  const oldGone = await page.evaluate(async () => {
    try {
      await (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
        '/ws/项目/归档/根图.md',
      )
      return false
    } catch {
      return true
    }
  })
  expect(oldGone).toBe(true)
  // 树重读后归档行仍在（现挂根层，与项目平级），项目也未被波及
  await expect(page.getByTestId('dir-node-归档')).toBeVisible()
  await expect(page.getByTestId('dir-node-项目')).toBeVisible()
})

// v2.4 欢迎页：最近打开列表（VSCode Welcome 布局）——打开过的导图出现在右列，点击直达
test('欢迎页：最近打开列表展示与直达', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')

  // 打开根图（树文件行双击）→ 返回案头（落欢迎页）
  await page.getByTestId('file-node-根图').dblclick()
  await expect(page.getByText('根图').first()).toBeVisible()
  await page.getByTestId('btn-back').click()

  // 欢迎页右列出现该图；点击直达编辑器
  const recent = page.getByTestId('recent-item-根图')
  await expect(recent).toBeVisible()
  await recent.click()
  await expect(page.getByText('根图').first()).toBeVisible()
})

// 2026-09 分区拖拽（左栏）：右缘手柄拖拽实时改宽（gap 随 --sidebar-width 联动），
// 松手提交 store 并持久化到 /cfg.json（内存 fs 经 __zenE2e.readFile 断言；
// 「重启保持」由 LibraryView.test init 载入用例覆盖）
test('案头：左栏拖拽调宽并持久化', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')

  const gap = page.locator('[data-slot="sidebar-gap"]')
  const handle = page.getByRole('separator', { name: '调整侧栏宽度' })
  await expect(handle).toBeVisible()
  const before = (await gap.boundingBox())!.width

  const hb = (await handle.boundingBox())!
  const y = hb.y + 60
  await page.mouse.move(hb.x + hb.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(hb.x + hb.width / 2 + 100, y, { steps: 5 })
  await page.mouse.up()

  // 拖 100px：gap 256 → 356（浮动断言容差留给 inset 边距舍入）
  const after = (await gap.boundingBox())!.width
  expect(after).toBeGreaterThan(before + 90)
  const cfg = JSON.parse(
    await page.evaluate(() =>
      (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile('/cfg.json'),
    ),
  )
  expect(cfg.sidebarWidth).toBeGreaterThan(300)
})

// 2026-09 分区拖拽（大纲）：详情态大纲面板左缘手柄向左拖增宽，双击恢复默认
test('案头：大纲面板拖拽调宽与双击恢复', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')

  await page.getByTestId('file-node-根图').click()
  await expect(page.getByTestId('file-detail')).toBeVisible()
  // 默认视口 1280：详情区 ≈1016px ≥ 900，auto 大纲显示
  const panel = page.getByTestId('outline-panel')
  await expect(panel).toBeVisible()
  const before = (await panel.boundingBox())!.width
  expect(before).toBeGreaterThan(200) // 默认 224

  const hb = (await page.getByRole('separator', { name: '调整大纲宽度' }).boundingBox())!
  const y = hb.y + 60
  await page.mouse.move(hb.x + hb.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(hb.x + hb.width / 2 - 80, y, { steps: 4 })
  await page.mouse.up()
  const dragged = (await panel.boundingBox())!.width
  expect(dragged).toBeGreaterThan(before + 70)

  // 双击恢复默认（224）
  await page.getByRole('separator', { name: '调整大纲宽度' }).dblclick()
  await expect
    .poll(async () => (await panel.boundingBox())!.width, { timeout: 5000 })
    .toBeLessThan(before + 10)
})
