import { expect, test } from '@playwright/test'

// 一条关联线 = 容器直挂 2 个 path（可见线 + 透明点击线；箭头 marker 内 path 非直挂子元素不计）
const LINE_PATHS = '.smm-associative-line-container > path'

/** 读取内存 FS 中的 md（harness __zenE2e.readFile） */
const readMd = (page: import('@playwright/test').Page, path: string): Promise<string> =>
  page.evaluate(
    (p) =>
      (window as unknown as { __zenE2e: { readFile(q: string): Promise<string> } }).__zenE2e.readFile(p),
    path,
  )

test('节点连线：[[名称]] 建线、保存重开复现', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  // pickDirectory 在 e2e 模式下无 Tauri 对话框：harness 已将 workspaceDir 预设为 /ws
  // （M5d 适配：btn-workspace 已随工具栏重构移除，选择工作区入口收敛到开屏页）
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('连线测试')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('根主题').first()).toBeVisible()

  // 建子节点 A（文本含 [[B]]）与 B：引擎「插入→渲染→弹编辑框」异步链路，先等框弹出再输入
  await page.getByText('根主题').first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('A [[B]]')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()

  await page.getByText('根主题').first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('B')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()

  // 保存后按 md 双链重建：A→B 一条关联线出现（保存链 onSaved 触发 rebuildLinks）
  await page.keyboard.press('Control+s')
  await expect(page.locator(LINE_PATHS)).toHaveCount(2)

  // md 只含纯文本标记，不含引擎连线数据（连线不落盘，重开时按文本重建）
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/连线测试.md',
    ),
  )
  expect(md).toBe('# 根主题\n\n## A [[B]]\n\n## B\n')

  // 返回案头重开：onReady 净化（建注册表 + 显示剥离）后按注册表重建，连线复现
  await page.getByTestId('btn-back').click()
  // M15：案头初始 idle 空态，先点树根进根目录资源管理器态
  await page.getByTestId('dir-node-all').click()
  await expect(page.getByTestId('map-item')).toBeVisible()
  await page.getByTestId('map-item').dblclick() // M5d 交互变更：单击=选中预览，双击=打开
  // 画布文本无 [[ ]] 标记（M5d Task 2 显示层剥离），连线照常复现
  await expect(page.getByText('A', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('A [[B]]')).toHaveCount(0)
  await expect(page.locator(LINE_PATHS)).toHaveCount(2)
})

// 验收轮：选中节点浮动操作条——免记快捷键点按钮加备注、点按钮拖出连线（连线经 linkBridge 落 [[..]] 文本）
test('节点操作条：连线按钮建 [[..]] 双链、备注按钮开备注框', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  // M5d 适配：btn-workspace 已随工具栏重构移除（harness 已预设 workspaceDir=/ws）
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('操作条测试')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('根主题').first()).toBeVisible()

  // 建叶节点 A 与 B：引擎「插入→渲染→弹编辑框」异步链路，先等框弹出再输入
  for (const label of ['A', 'B']) {
    await page.getByText('根主题').first().click()
    await page.keyboard.press('Tab')
    await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
    await page.keyboard.type(label)
    await page.getByRole('application').click({ position: { x: 15, y: 15 } })
    await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()
  }

  // 选中 A：浮动操作条出现（node-actions 锚定选中节点右下角）；
  // 叶节点激活同时出现引擎原生快捷建子 "+"（isShowCreateChildBtnIcon，MindMapNode.js:516）
  await page.getByText('A', { exact: true }).first().click()
  await expect(page.getByTestId('node-actions')).toBeVisible()
  await expect(page.locator('.smm-quick-create-child-btn').first()).toBeVisible()

  // 备注按钮：打开备注对话框（与砚栏 btn-note 同流），取消关闭
  await page.getByTestId('node-action-note').click()
  await expect(page.getByTestId('note-dialog')).toBeVisible()
  await page.getByTestId('note-cancel').click()
  await expect(page.getByTestId('note-dialog')).toBeHidden()

  // 连线按钮 → 引擎建线态 → 点目标 B：桥接只动注册表，A 显示文本保持纯净（净化断言，M5d §4）
  await page.getByText('A', { exact: true }).first().click()
  await page.getByTestId('node-action-link').click()
  await page.getByText('B', { exact: true }).first().click()
  await expect(page.locator(LINE_PATHS)).toHaveCount(2)
  await expect(page.getByText('A [[B]]')).toHaveCount(0)

  // 保存落盘：md 含 [[B]] 文本标记（连线是文本派生数据，不落引擎层）
  await page.keyboard.press('Control+s')
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/操作条测试.md',
    ),
  )
  expect(md).toBe('# 根主题\n\n## A [[B]]\n\n## B\n')
})

// v0.7.0 验收修复（删线复活回归）：引擎 Del（removeLine 修剪 targets → data_change 置脏）→
// 自动保存按引擎现态**替换**重建注册表 → md 标记随线消亡 → 重开不复活。线激活与 Del 经
// evaluate 同步派发（headless 下点击线几何命中不稳 + 引擎节流时序竞态，见下方注释）。
test('节点连线：删除后不复活（自动保存移除 md 标记，重开无线）', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('删线测试')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('根主题').first()).toBeVisible()

  // 建叶节点 A 与 B：引擎「插入→渲染→弹编辑框」异步链路，先等框弹出再输入
  for (const label of ['A', 'B']) {
    await page.getByText('根主题').first().click()
    await page.keyboard.press('Tab')
    await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
    await page.keyboard.type(label)
    await page.getByRole('application').click({ position: { x: 15, y: 15 } })
    await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()
  }

  // 桥接建线（净化语义：显示文本无 [[..]]，连线数据只在注册表与引擎 targets）
  await page.getByText('A', { exact: true }).first().click()
  await page.getByTestId('node-action-link').click()
  await page.getByText('B', { exact: true }).first().click()
  await expect(page.locator(LINE_PATHS)).toHaveCount(2)

  // 显式保存：md 落 [[B]] 标记（先在，才能证明删后不再回来——复活 bug 的完整链路）
  await page.keyboard.press('Control+s')
  await expect
    .poll(() => readMd(page, '/ws/删线测试.md'), { timeout: 10_000 })
    .toBe('# 根主题\n\n## A [[B]]\n\n## B\n')

  // 激活连线并删除：同一次 evaluate 内同步完成，规避引擎节流时序竞态——
  // ① headless 下 bbox 中心未必落在贝塞尔曲线上，真实坐标点击命中不稳：对透明点击线
  //    （容器第 2 个 path，引擎 clickPath.click 句柄所在）直接派发 click，与真实点击同一处理器；
  // ② 引擎节点激活/去激活走 SET_NODE_DATA → 节流 ~100ms data_change → renderAllLines 会清掉
  //    activeLine（引擎固有交互时序）——激活与 Del 同步连发，不给该节流窗口留时间；
  // ③ 合成 KeyboardEvent 的 keyCode 只读，defineProperty 补 46（引擎 KeyCommand 按 keyCode
  //    匹配 'Del'），派发在 body 上（defaultEnableCheck 只放行 body/编辑类焦点）。
  // 删除后的引擎修剪（removeLine 五键 SET_NODE_DATA）→ data_change → 置脏 → 自动保存 →
  // 注册表按引擎现态替换重建，链路全真，由下方断言观测。
  const deleted = await page.evaluate(() => {
    const paths = document.querySelectorAll('.smm-associative-line-container > path')
    const clickPath = paths[1] // [可见线, 点击线]：drawLine 先 path 后 clickPath
    if (!(clickPath instanceof SVGElement)) return 'no-click-path'
    clickPath.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const stroke = clickPath.getAttribute('stroke') || clickPath.style.stroke
    if (stroke === '' || stroke === 'transparent') return 'not-activated'
    const del = new KeyboardEvent('keydown', { key: 'Delete', code: 'Delete', bubbles: true })
    Object.defineProperty(del, 'keyCode', { get: () => 46 })
    document.body.dispatchEvent(del)
    return 'ok'
  })
  expect(deleted).toBe('ok')
  await expect(page.locator(LINE_PATHS)).toHaveCount(0) // 引擎 data_change（节流 ~100ms）重绘：线消失

  // 自动保存（5s 防抖）后 md 标记移除（注册表按引擎现态替换重建，不残留陈旧条目）
  await expect
    .poll(() => readMd(page, '/ws/删线测试.md'), { timeout: 15_000 })
    .toBe('# 根主题\n\n## A\n\n## B\n')

  // 重开不复活：md 是唯一事实源，无标记即无线
  await page.getByTestId('btn-back').click()
  // M15：案头初始 idle 空态，先点树根进根目录资源管理器态
  await page.getByTestId('dir-node-all').click()
  await expect(page.getByTestId('map-item')).toBeVisible()
  await page.getByTestId('map-item').dblclick()
  await expect(page.getByText('A', { exact: true }).first()).toBeVisible()
  await expect(page.locator(LINE_PATHS)).toHaveCount(0)
})
