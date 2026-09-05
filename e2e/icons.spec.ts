import { expect, test } from '@playwright/test'

// M18 节点图标（方案 A：句尾 ::name 标记，与连线 [[..]] 同构）：
// 管理器全流（设图标→落盘→重开持久）与手写/AI 链路（md 直接改标记）。
// md 是唯一事实源：显示层剥离、序列化句尾注入（roundtrip 由单测/属性测试锁定）。

test('图标：管理器设图标 → 落盘 ::flag → 重开持久（管理器高亮现状）', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('图标图')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('图标图').first()).toBeVisible()

  // 选中根节点 → 浮动条「图标」钮 → 管理器
  await page.getByText('图标图').first().click()
  await page.getByTestId('node-action-icon').click()
  await expect(page.getByTestId('icon-dialog')).toBeVisible()

  // 精选网格点选 flag/star（选中高亮）→ 保存
  await page.getByTestId('icon-item-flag').click()
  await page.getByTestId('icon-item-star').click()
  await expect(page.getByTestId('icon-item-flag')).toHaveClass(/ring/)
  await page.getByTestId('icon-save').click()
  await expect(page.getByTestId('icon-dialog')).toBeHidden()

  // 渲染断言（M18 验收实案）：lucide svg 文件带许可注释头，引擎按 /^<svg/ 前缀分流
  // SVG/图片渲染——未剥注释时被当图片 URL 加载显示碎图（image 元素）。碎图回归锁
  // 的本质是 image 产物为零 + lucide svg 在场（引擎重渲可能令 svg 多份，属合法现象）
  await expect(page.locator('.canvas-host svg.lucide').first()).toBeVisible()
  await expect(page.locator('.canvas-host svg.lucide.lucide-flag').first()).toBeVisible()
  await expect(page.locator('.canvas-host image')).toHaveCount(0)

  // 返回案头（显式保存链）→ md 句尾落标记
  await page.getByTestId('btn-back').click()
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/图标图.md',
    ),
  )
  expect(md).toContain('# 图标图 ::flag ::star')

  // 重开：管理器现状高亮（parse 提取回 icons）
  await page.getByTestId('file-node-图标图').dblclick()
  await expect(page.getByText('图标图').first()).toBeVisible()
  await page.getByText('图标图').first().click()
  await page.getByTestId('node-action-icon').click()
  await expect(page.getByTestId('icon-item-flag')).toHaveClass(/ring/)
  await expect(page.getByTestId('icon-item-star')).toHaveClass(/ring/)

  // 移除一个：取消 star → 落盘只剩 flag
  await page.getByTestId('icon-item-star').click()
  await page.getByTestId('icon-save').click()
  await page.getByTestId('btn-back').click()
  const md2 = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/图标图.md',
    ),
  )
  expect(md2).toContain('# 图标图 ::flag')
  expect(md2).not.toContain('::star')
})

test('图标：非精选图标（全集搜索、跨搜索词多选）→ 当场与重开后画布均显示（2026-09 修复）', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('非精选图')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('非精选图').first()).toBeVisible()

  await page.getByText('非精选图').first().click()
  await page.getByTestId('node-action-icon').click()
  await expect(page.getByTestId('icon-dialog')).toBeVisible()

  // 跨搜索词各选一个非精选图标（换词后网格重置，此前选中须仍能注册渲染）
  await page.getByTestId('icon-search').fill('alert')
  await page.getByTestId('icon-item-shield-alert').click()
  await expect(page.getByTestId('icon-item-shield-alert')).toHaveClass(/ring/)
  await page.getByTestId('icon-search').fill('book')
  await page.getByTestId('icon-item-book-search').click()
  await expect(page.getByTestId('icon-item-book-search')).toHaveClass(/ring/)
  await page.getByTestId('icon-save').click()
  await expect(page.getByTestId('icon-dialog')).toBeHidden()

  // 当场渲染断言：跨搜索选取的两个非精选 svg 都在画布上（extras 累积缓存修复）
  await expect(page.locator('.canvas-host svg.lucide-shield-alert').first()).toBeVisible()
  await expect(page.locator('.canvas-host svg.lucide-book-search').first()).toBeVisible()

  // 落盘 → 重开 → 打开期补注册 + 重渲染，两图标仍可见（此前：iconList 只剩精选 64，渲染空占位）
  await page.getByTestId('btn-back').click()
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/非精选图.md',
    ),
  )
  expect(md).toContain('# 非精选图 ::shield-alert ::book-search')
  await page.getByTestId('file-node-非精选图').dblclick()
  await expect(page.getByText('非精选图').first()).toBeVisible()
  await expect(page.locator('.canvas-host svg.lucide-shield-alert').first()).toBeVisible()
  await expect(page.locator('.canvas-host svg.lucide-book-search').first()).toBeVisible()
})

test('图标：已选行移除非精选——重开后不搜索，点已选 chip 即删（2026-09 用户反馈）', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('删图标图')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('删图标图').first()).toBeVisible()

  // 设一个非精选图标 → 落盘
  await page.getByText('删图标图').first().click()
  await page.getByTestId('node-action-icon').click()
  await page.getByTestId('icon-search').fill('alert')
  await page.getByTestId('icon-item-shield-alert').click()
  await page.getByTestId('icon-save').click()
  await page.getByTestId('btn-back').click()

  // 重开 → 打开管理器：不搜索，已选行 chip 直接在场，点击移除 → 保存
  await page.getByTestId('file-node-删图标图').dblclick()
  await expect(page.getByText('删图标图').first()).toBeVisible()
  await page.getByText('删图标图').first().click()
  await page.getByTestId('node-action-icon').click()
  const chip = page.getByTestId('icon-chip-shield-alert')
  await expect(chip).toBeVisible()
  await expect(chip).toHaveAttribute('title', '移除 shield-alert')
  await chip.click()
  await page.getByTestId('icon-save').click()

  // 落盘标记清空；画布图标消失
  await page.getByTestId('btn-back').click()
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/删图标图.md',
    ),
  )
  expect(md).toContain('# 删图标图')
  expect(md).not.toContain('::shield-alert')
})

test('图标：手写/AI 直接改 md 标记 → 打开即生效（画布净化 + 保存保持）', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await expect(page.getByTestId('btn-new')).toBeVisible() // 等应用就绪（harness init 完成 adapter 注入）
  // 预置走 __zenE2e.writeFile（harness 通道；裸动态 import store 在 HMR 失效后会拿到
  // 另一模块实例，见 e2eHarness.writeFile 注释）
  await page.evaluate(async () => {
    const z = (window as unknown as { __zenE2e: { writeFile(p: string, t: string): Promise<void> } }).__zenE2e
    await z.writeFile(
      '/ws/手写图标.md',
      ['# 手写图标 ::star', '', '## 子节点', '', '## 普通 ::bug', ''].join('\n'),
    )
  })
  await page.getByTestId('file-node-手写图标').dblclick()
  await expect(page.getByText('手写图标').first()).toBeVisible()

  // 手写标记 parse 提取：管理器现状显示 star
  await page.getByText('手写图标').first().click()
  await page.getByTestId('node-action-icon').click()
  await expect(page.getByTestId('icon-item-star')).toHaveClass(/ring/)
  await page.getByTestId('icon-cancel').click()

  // 保存重开：标记保持（显示文本净化下 md 仍是唯一事实源）
  await page.getByTestId('btn-back').click()
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/手写图标.md',
    ),
  )
  expect(md).toContain('# 手写图标 ::star')
  expect(md).toContain('## 普通 ::bug')
})

// 2026-09 双树错乱修复的回归：打开带非精选图标的图时，registerIconsInto 异步 resolve 会触发
// 整树 reRender（打开期图标恢复）；若 resolve 恰逢引擎渲染进行中（大图 doLayout 经 asyncRun 跨
// 多个宏任务，窗口可达数百毫秒），裸 reRender 的 clearCache 会清掉进行中渲染的销毁名单、clearDraw
// 后节点又被渲染回调 add 回来——旧树实例无人销毁，画布出现新旧两份完整树（实验复现：53 节点图
// 冷加载 ×8/8 全翻倍至 106；用户实案 47×2=94，随后窗口最大化把新树按新尺寸重排、旧树停留旧布局，
// 两树错位重叠即「导图错乱/节点重复/无法拖动」，重开文档才恢复）。修复=safeReRender（渲染中挂
// node_tree_render_end 延后调用，见 src/editor/zenIcons.ts）。本用例走宿主真实链路：非精选图打开
// 与窗口尺寸变化并发（打开后立即改视口=用户「打开后马上最大化」），断言画布不出现双树。
test('图标：非精选图标打开期与窗口尺寸变化并发——不产生双树（2026-09 双树错乱修复）', async ({ page }) => {
  await page.goto('/?e2e=1')
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as { __zenE2e?: object }).__zenE2e)))
    .toBe(true) // harness 异步装配(main.tsx 顶层 await),早于其就绪的 evaluate 拿不到 __zenE2e
  await page.evaluate(() => {
    const z = (window as unknown as { __zenE2e: { writeFile(p: string, t: string): Promise<void> } }).__zenE2e
    const lines = ['# 双树回归图 ::arrow-big-down-dash']
    for (let b = 1; b <= 4; b++) {
      lines.push(`\n## B${b}`)
      for (let l = 1; l <= 12; l++) lines.push(`\n### L${b}-${l}`)
    }
    return z.writeFile('/ws/双树回归图.md', lines.join('\n') + '\n')
  })
  // 打开后立即改视口(打开链异步进行中,贴近用户「打开后马上最大化」的并发时序)
  await page.getByTestId('file-node-双树回归图').dblclick()
  await page.setViewportSize({ width: 1500, height: 950 })
  await expect(page.getByText('双树回归图').first()).toBeVisible()
  // 非精选图标已注册渲染(链路完整走完)
  await expect(page.locator('.canvas-host svg.lucide-arrow-big-down-dash').first()).toBeVisible()
  // 树 53 节点;双树错乱时翻倍至 106(CI/本地时序未必命中竞态,本断言至少锁宿主链路无回归;
  // 竞态守卫行为由 zenIcons.test 的 safeReRender 用例锁定)
  await expect
    .poll(() => page.locator('.smm-node').count(), { message: '画布节点数应等于树节点数(53),不出现双树' })
    .toBe(53)
})
