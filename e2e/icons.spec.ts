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
  await expect(page.getByText('根主题').first()).toBeVisible()

  // 选中根节点 → 浮动条「图标」钮 → 管理器
  await page.getByText('根主题').first().click()
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
  expect(md).toContain('# 根主题 ::flag ::star')

  // 重开：管理器现状高亮（parse 提取回 icons）
  await page.getByTestId('dir-node-all').click()
  await page.getByTestId('map-item').filter({ hasText: '图标图' }).dblclick()
  await expect(page.getByText('根主题').first()).toBeVisible()
  await page.getByText('根主题').first().click()
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
  expect(md2).toContain('# 根主题 ::flag')
  expect(md2).not.toContain('::star')
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
  await page.getByTestId('dir-node-all').click()
  await page.getByTestId('map-item').filter({ hasText: '手写图标' }).dblclick()
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
