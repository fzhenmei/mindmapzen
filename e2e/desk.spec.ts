import { expect, test } from '@playwright/test'

// 案头用例走 ?desk=1 预置（见 e2eHarness）：/ws/项目/项目图.md + /ws/根图.md，
// 工作区已设为 /ws。2026-09 画布三态 M2：主区恒欢迎页（单态），树文件行单击 → 右区
// 右上悬浮预览浮窗（file-preview-popover，FileDetail 详情态退役）；双击照旧进纸面。
// 文件浏览与导航全在左树（目录下直列文件行），文件操作收敛树右键（ctx-* 菜单）
test('案头：目录选中主区欢迎页、树文件行开悬浮预览与移动', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')

  // 左树出现预置目录「项目」与直列文件行；初始欢迎页（未选任何）
  await expect(page.getByTestId('dir-node-项目')).toBeVisible()
  await expect(page.getByTestId('file-node-根图')).toBeVisible()
  await expect(page.getByTestId('file-node-项目图')).toBeVisible()
  await expect(page.getByTestId('desk-idle')).toBeVisible()

  // 选中目录「项目」：主区仍是欢迎页，不开浮窗（目录态无预览）
  await page.getByTestId('dir-node-项目').click()
  await expect(page.getByTestId('desk-idle')).toBeVisible()
  await expect(page.getByTestId('file-preview-popover')).toHaveCount(0)

  // 树文件行单击 = 右区右上悬浮预览浮窗（md 预览在浮窗体内）
  await page.getByTestId('file-node-根图').click()
  const popover = page.getByTestId('file-preview-popover')
  await expect(popover).toBeVisible()
  // md 预览走 vditor(lute) 异步渲染，元素先挂载内容后到；全量并发下脚本加载变慢，
  // 默认 5s 偶发不够（ai.spec 收尾文本 / mermaid.spec 好图断言同款 15s 口径）
  await expect(popover.getByTestId('md-preview')).toHaveText(/根图/, { timeout: 15_000 })

  // 移动流：树右键 ctx-btn-move → move-dialog → 选目录 → 确认。
  // 对话框树复用 dir-node-<name> testid（与左树同名），严格模式下必须以 move-dialog 圈定
  // （右键同文件行会 toggle 关浮窗——移动管线取文件自身，与选中无关）
  await page.getByTestId('file-node-根图').click({ button: 'right' })
  await page.getByTestId('ctx-btn-move').click()
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

// 容器合并「窄窗详情动作收纳」用例随 DetailActions 退役删除（M2）：@container 分流与
// more-* 浮层不复存在，浮窗关闭钮 btn-preview-close 单路恒显（无视口分支），由下例覆盖

// 2026-09 交互语义（M2 悬浮预览）：树文件行单击=右区右上悬浮预览浮窗，双击=进纸面
test('案头：树文件行单击出悬浮预览、双击进纸面', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')

  // 单击根图文件行：右区右上浮窗（头部文件名 + markdown 预览）；主区仍是欢迎页
  await page.getByTestId('file-node-根图').click()
  const popover = page.getByTestId('file-preview-popover')
  await expect(popover).toBeVisible()
  // lute 异步渲染慢启动同上（默认 5s 全量并发下偶发不够）
  await expect(popover.getByTestId('md-preview')).toHaveText(/根图/, { timeout: 15_000 })
  // 仍是案头，未进纸面（命令栏不可见）
  await expect(page.getByTestId('zen-bar')).toHaveCount(0)
  await expect(page.getByTestId('desk-idle')).toBeVisible()

  // 浮窗头部关闭钮关窗；再单击同文件行重开（toggle 的开路，主区欢迎页全程不动）
  await page.getByTestId('btn-preview-close').click()
  await expect(popover).toHaveCount(0)
  await expect(page.getByTestId('desk-idle')).toBeVisible()
  await page.getByTestId('file-node-根图').click()
  await expect(popover).toBeVisible()

  // 双击文件行照旧开纸面（详情「打开」钮退役，双击是唯一开图手势）
  await page.getByTestId('file-node-根图').dblclick()
  await expect(page.getByText('根图').first()).toBeVisible()
})

// spec §4.1 关窗契约回归钉（真实鼠标链路，2026-09 评审修复）：文件行真实点击 =
// mousedown（浮窗外点，豁免左树文件行 data-tree-file-row）→ click（selectFile toggle）。
// 无豁免时外点先清选中、click 的 toggle 落在 null 上必重开——真机「再点同一文件关窗」
// 失效。Playwright click 即完整真实事件序（mousedown/up/click），此处钉终态=关
test('案头：再点同一文件行关悬浮预览（真实事件序 mousedown+click）', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')

  await page.getByTestId('file-node-根图').click()
  const popover = page.getByTestId('file-preview-popover')
  await expect(popover).toBeVisible()
  // 再单击同一文件行：mousedown 豁免不误关，click toggle 关——浮窗消失回欢迎页
  await page.getByTestId('file-node-根图').click()
  await expect(popover).toHaveCount(0)
  await expect(page.getByTestId('desk-idle')).toBeVisible()
})

// 2026-09 发布复制：树右键 ctx-btn-copy-wechat 走真渲染全链（离屏 vditor → 内联样式 →
// mermaid 成图），出 section 根 HTML 写富文本剪贴板端口（E2E web 模式记录到
// __zenE2e.lastCopiedHtml）；真实粘贴进公众号编辑器的往返验证归 docs/manual-checklist.md 真机项
test('案头：树右键「复制为公众号格式」出内联样式 HTML（mermaid 转 PNG 图）', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')
  // harness 异步装配(main.tsx 顶层 await)：poll 守卫 __zenE2e 就绪后再覆写预置文件加
  // mermaid 块（icons.spec:184 同款守卫；同文件名覆写，左树无需刷新）。用正文块（引用块）
  // 形态的围栏——mermaid 实际多居于此,带 > 前缀的围栏改标是本链路的关键路径
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as { __zenE2e?: object }).__zenE2e)))
    .toBe(true)
  await page.evaluate(() =>
    (window as unknown as { __zenE2e: { writeFile(p: string, t: string): Promise<void> } }).__zenE2e.writeFile(
      '/ws/根图.md',
      '# 根图\n\n> ```mermaid\n> graph TD\n>   A-->B\n> ```\n\n> ```ts\n> const hi = "泽"\n> ```\n',
    ),
  )
  await page.getByTestId('file-node-根图').click()
  await expect(page.getByTestId('file-preview-popover')).toBeVisible()
  // 悬浮预览自身应有语法高亮(lute 挂的 hljs 类曾毒化 vditor 语言识别致全部 plaintext,已修)
  await expect
    .poll(() => page.locator('.md-preview pre code span[class]').count(), { timeout: 10_000 })
    .toBeGreaterThan(0)
  // 复制入口在树右键菜单（右键同文件行会 toggle 关浮窗——复制管线取文件自身，与选中无关）
  await page.getByTestId('file-node-根图').click({ button: 'right' })
  await page.getByTestId('ctx-btn-copy-wechat').click()
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
  // 压两端对齐:微信粘贴继承 justify 会拉伸代码行内空格(真机实测),pre 显式左对齐
  expect(html).toContain('text-align: left')
  // 微信形态（doocs/md 实战公式）：code 内无 \n 文本（全转 br）、有单一 display:block 包裹
  const codeShape = await page.evaluate((h: string) => {
    const doc = new DOMParser().parseFromString(h, 'text/html')
    const codes = [...doc.querySelectorAll('pre > code')]
    return {
      withNewline: codes.filter((c) => c.textContent?.includes('\n')).length,
      wrapped: codes.filter((c) => {
        const kids = [...c.children]
        return kids.length === 1 && kids[0]!.tagName === 'SPAN' && (kids[0] as HTMLElement).getAttribute('style')?.includes('display: block')
      }).length,
      total: codes.length,
    }
  }, html)
  expect(codeShape.withNewline).toBe(0)
  expect(codeShape.wrapped).toBe(codeShape.total)
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

// 2026-09 树右键菜单：文件行 = 打开/收藏/移动/重命名/删除/复制路径/公众号复制（右键即
// 选中开预览，VSCode 惯例）；目录行 = 在此新建导图/新建子目录。此处覆盖重命名与目录内
// 新建（vitest 已覆盖删除/移动/树根）
test('案头：树右键菜单——文件行重命名、目录行在此新建导图', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')

  // 右键根图文件行：即选中开悬浮预览 + 弹出菜单，重命名走对话框流
  await page.getByTestId('file-node-根图').click({ button: 'right' })
  await expect(page.getByTestId('file-preview-popover')).toBeVisible()
  await page.getByTestId('ctx-btn-rename').click()
  await page.getByTestId('input-name').fill('改名图')
  await page.getByTestId('btn-confirm').click()
  // 树行换名；浮窗随 mdPath 失联清理（选中失效不回浮窗）
  await expect(page.getByTestId('file-node-改名图')).toBeVisible()
  await expect(page.getByTestId('file-preview-popover')).toHaveCount(0)

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

// 2026-09 分区拖拽（大纲）：详情态大纲随 FileDetail 退役（M2），大纲唯一宿主迁至画布
// Markdown 态（MarkdownView 沿用 previewOutline/outlineWidth 偏好与同款 SplitResizer）。
// 左缘手柄向左拖增宽，双击恢复默认
test('案头：大纲面板拖拽调宽与双击恢复（画布 Markdown 态）', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&desk=1')

  // 双击根图进纸面 → Ctrl+2 切 Markdown 态（只读文档视图 + 大纲面板）
  await page.getByTestId('file-node-根图').dblclick()
  await expect(page.getByText('根图').first()).toBeVisible()
  await page.keyboard.press('Control+2')
  await expect(page.getByTestId('markdown-view')).toBeVisible()
  // 默认视口 1280 ≥ 900：auto 大纲显示（宽默认 224）
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
