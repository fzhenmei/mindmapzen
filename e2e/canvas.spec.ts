import { expect, test } from '@playwright/test'

// 验收实案：引擎无容器尺寸自动监听，窗口最大化/还原后画布保持挂载时尺寸。
// 宿主在 window resize 时调用 mm.resize()（MindMapCanvas），本用例在真实浏览器验证该链路。
test('窗口尺寸变化画布跟随重算', async ({ page }) => {
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('自适应')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('自适应').first()).toBeVisible()

  const svg = page.locator('.canvas-host svg').first()
  const widthBefore = parseInt((await svg.getAttribute('width')) ?? '0', 10)

  await page.setViewportSize({ width: 1500, height: 950 })
  await expect
    .poll(async () => parseInt((await svg.getAttribute('width')) ?? '0', 10))
    .toBeGreaterThan(widthBefore)

  // 视图工具组：缩放/根居中/适配存在可点不报错（视觉效果属人工清单）
  for (const id of ['btn-zoom-out', 'btn-zoom-in', 'btn-center-root', 'btn-fit']) {
    await expect(page.getByTestId(id)).toBeEnabled()
    await page.getByTestId(id).click()
  }
})

// 2026-09 最小化恢复错乱修复的回归：WebView2 在睡眠唤醒/显示器拓扑/DPI 切换等系统事件下，可能在
// 窗口不可见期间投递视口 0×0 的 resize——引擎 getElRectInfo（index.js:316-321）会先把 0 写入
// width/height 再抛错，污染固化后任何渲染都把根节点定位到 ≈(0,0)、全树平移出视口（用户报「导图
// 错乱/节点重复/无法拖动，重开文档恢复」的根因；实测复现：污染态 root transform 从 (半宽,半高)
// 跳到 ≈(0,0)，拖拽起点落到视口外）。修复=MindMapCanvas 0×0 门禁 + focus 自愈；本用例走真实
// 事件路径验证：0×0 的 resize 不得污染引擎，此后（模拟系统恢复只发 focus）渲染仍以容器真实尺寸
// 布局。断言锚点=根节点 transform（nodeDraw 首个 .smm-node，root.render 最先创建）。
test('容器瞬时 0×0 的 resize 不污染引擎，恢复 focus 后渲染布局正确', async ({ page }) => {
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('零尺寸防御')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('零尺寸防御').first()).toBeVisible()

  // 根节点 transform 的平移分量（matrix 第 5/6 位），正常应≈容器半宽/半高
  const rootXY = () =>
    page.evaluate(() => {
      const g = document.querySelector('.smm-node')
      const m = (g?.getAttribute('transform') ?? '').match(/matrix\(([^)]+)\)/)
      if (!m) return null
      const parts = m[1].split(',').map(Number)
      return [parts[4] ?? NaN, parts[5] ?? NaN]
    })

  const before = await rootXY()
  expect(before).not.toBeNull()
  expect(before![0]).toBeGreaterThan(100) // 半宽级别,污染态会跌到 ≈0

  // ① 系统事件模拟：容器瞬时 0×0 + resize（真实污染路径;门禁应拦下,不调引擎 resize）。
  // overflow:hidden 必需:容器内 svg 为流内元素,没有它会撑起高度,rect 读不到 0(WebView2 视口
  // 缩为 0 时布局视口本身为 0,语义等价于 overflow 裁切)
  await page.evaluate(() => {
    const el = document.querySelector('.smm-mind-map-container') as HTMLElement | null
    if (!el) throw new Error('engine container not found')
    el.style.width = '0'
    el.style.height = '0'
    el.style.overflow = 'hidden'
    window.dispatchEvent(new Event('resize'))
  })
  // ② 系统恢复模拟：容器回尺寸,只派发 focus（实测 WebView2 恢复只发 blur/focus,不发 resize）
  await page.evaluate(() => {
    const el = document.querySelector('.smm-mind-map-container') as HTMLElement | null
    if (!el) throw new Error('engine container not found')
    el.style.width = ''
    el.style.height = ''
    el.style.overflow = ''
    window.dispatchEvent(new Event('focus'))
  })

  // ③ 触发一次"必然刷新 root 位置"的渲染:编辑根节点文本（双击→输入→点空白提交,录入链路与
  // collapse.spec 同款）。文本变化 → 节点数据对比命中 → needLayout → root transform 按布局值刷新;
  // 若引擎已被 0 污染,布局值 root.left/top≈(0,0),transform 随之跌出画布（未修复版必现）。
  // (Tab 插节点不适用:root 复用路径 needLayout 不置位,transform 不刷新,污染不显形)
  await page.getByText('零尺寸防御').first().dblclick()
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('!')
  // 点中右空白提交(左上角有节点操作浮层、右下角有主题 fab,污染态下全树还会平移到左上角——
  // 中右空白在污染/正常两态下都不落元素)
  const host = page.getByRole('application')
  const box = await host.boundingBox()
  await host.click({ position: { x: (box?.width ?? 800) * 0.7, y: (box?.height ?? 600) * 0.5 } })
  await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()
  await expect(page.getByText('零尺寸防御!').first()).toBeVisible()
  await expect
    .poll(rootXY, { message: '编辑后根节点应保持居中（未被 0×0 污染）' })
    .toEqual([expect.closeTo(before![0], 1), expect.closeTo(before![1], 1)])
})
