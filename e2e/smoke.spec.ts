import { expect, test } from '@playwright/test'

test('冒烟 1：新建 → 编辑 → 保存 → 重开 → 内容一致', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  // pickDirectory 在 e2e 模式下无 Tauri 对话框：harness 已将 workspaceDir 预设为 /ws
  // （M5d 适配：btn-workspace 已随工具栏重构移除，选择工作区入口收敛到开屏页）
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('测试图')
  await page.getByTestId('btn-confirm').click()

  // 编辑器出现（真实引擎渲染根节点文本）
  await expect(page.getByText('根主题').first()).toBeVisible()
  // Tab 建子节点并录入中文：INSERT_CHILD_NODE 默认自动打开文本编辑框（inserting 行为），
  // 且编辑框内占位文本「二级节点」已被全选，keyboard.type 直接整体替换
  await page.getByText('根主题').first().click()
  await page.keyboard.press('Tab')
  // 适配说明：引擎「插入子节点 → 渲染 → 打开编辑框」是异步链路，直接续打字会丢前几个字符，
  // 先等编辑框弹出（此时占位文本「二级节点」已被全选）再输入
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('分支一')
  // 适配说明：引擎核心 TextEdit 只注册了 Enter/Tab 提交快捷键，未注册 Escape，
  // 按 Escape 不会提交文本（后续保存将丢失输入）。改为点击画布空白处，
  // 触发 svg_mousedown → hideEditTextBox 完成提交（与真实用户点空白收尾一致）
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  // 等编辑框收起（display:none）确认提交完成，再手动保存
  await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()
  await page.keyboard.press('Control+s')

  // 返回文件库并重新打开（M5d 交互变更：单击=选中预览，双击=打开）
  await page.getByTestId('btn-back').click()
  await expect(page.getByTestId('map-item')).toBeVisible()
  await page.getByTestId('map-item').dblclick()
  await expect(page.getByText('分支一').first()).toBeVisible()

  // 磁盘内容断言（内存 fs）
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/测试图.md',
    ),
  )
  // 精确断言（M4 强化）：钉死完整序列化形态，杜绝 toContain 兜底。
  // 实际值经 __zenE2e.readFile 运行校对后写死（与 copy-import 整图断言同构，子节点名不同）
  expect(md).toBe('# 根主题\n\n## 分支一\n')
})
