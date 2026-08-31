import { expect, test } from '@playwright/test'

// 快速切换（v2.5 编辑器内切换导图）：Ctrl+P 浮层按名切换 / Ctrl+Tab 按住轮换（VS Code 手法）/
// 砚栏切换钮。建图即入最近打开（createAndOpen 维护 recentOpened/sessionRecent）。
test('快速切换：Ctrl+P 浮层切换、砚栏钮呼出', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')

  // 建两张图：甲 → 返回案头 → 乙（当前编辑乙）
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('切换甲')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('切换甲').first()).toBeVisible()
  await page.getByTestId('btn-back').click() // 干净状态直接返回案头
  await expect(page.getByTestId('btn-new')).toBeVisible()
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('切换乙')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('切换乙').first()).toBeVisible()

  // Ctrl+P 呼浮层：过滤「甲」→ 回车切换（干净状态直接切，画布落到甲）
  await page.keyboard.press('Control+p')
  await expect(page.getByTestId('switch-input')).toBeVisible()
  await page.getByTestId('switch-input').fill('甲')
  await page.keyboard.press('Enter')
  await expect(page.getByText('切换甲').first()).toBeVisible()

  // 砚栏切换钮呼出浮层（鼠标路径）+ Esc 关闭
  await page.getByTestId('btn-switch').click()
  await expect(page.getByTestId('switch-input')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('switch-input')).toBeHidden()
  await expect(page.getByText('切换甲').first()).toBeVisible() // 关浮层不动画布
})

// Ctrl+Tab 按住轮换：呼出轮换列表（无输入框）→ 连按 Tab 高亮循环下移 → 松 Ctrl 落定切换；
// Esc 取消不切；一按即松 = ping-pong（行为超集）。分步 down/press/up 真实还原按键序列。
test('Ctrl+Tab 轮换：连按 Tab 高亮下移、松 Ctrl 落定、Esc 取消', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')

  // 三张图：甲 → 乙 → 丙（当前丙；会话 MRU = 丙乙甲）
  for (const name of ['轮换甲', '轮换乙', '轮换丙']) {
    await page.getByTestId('btn-new').click()
    await page.getByTestId('input-name').fill(name)
    await page.getByTestId('btn-confirm').click()
    await expect(page.getByText(name).first()).toBeVisible()
    if (name !== '轮换丙') {
      await page.getByTestId('btn-back').click()
      await expect(page.getByTestId('btn-new')).toBeVisible()
    }
  }

  // 按住 Ctrl 按 Tab：轮换浮层呼出（无输入框），高亮 = MRU 首个非当前（乙）
  await page.keyboard.down('Control')
  await page.keyboard.press('Tab')
  await expect(page.getByTestId('switch-list')).toBeVisible()
  await expect(page.getByTestId('switch-input')).toBeHidden() // 轮换态无输入框
  const activeItem = page.locator('[data-testid="switch-item"][aria-selected="true"]')
  await expect(activeItem).toContainText('轮换乙')

  // 再按 Tab：高亮下移到甲；Esc 取消不切（Ctrl 未松也不落定）
  await page.keyboard.press('Tab')
  await expect(activeItem).toContainText('轮换甲')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('switch-list')).toBeHidden()
  await page.keyboard.up('Control')
  await expect(page.getByText('轮换丙').first()).toBeVisible() // 仍是当前图

  // 一按即松：切到上一张（ping-pong 手感）
  await page.keyboard.down('Control')
  await page.keyboard.press('Tab')
  await page.keyboard.up('Control')
  await expect(page.getByText('轮换乙').first()).toBeVisible()
})
