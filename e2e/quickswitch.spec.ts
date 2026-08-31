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

// Ctrl+Tab 按住轮换：呼出轮换列表（无输入框，列表 = 含当前图的会话 MRU 全序）→ 连按 Tab
// 高亮循环下移（可轮回当前图）→ 松 Ctrl 落定；落在当前图 = 真 no-op（不切换、画布零重载）；
// Esc 取消不切；一按即松 = ping-pong。分步 down/press/up 真实还原按键序列。
test('Ctrl+Tab 轮换：连按循环下移、轮回当前松手不切、Esc 取消', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')

  // 三张图：甲 → 乙 → 丙（当前丙；会话 MRU = 丙乙甲，列表含当前共 3 项）
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
  // 画布容器打标记：重挂载（切换重载）会让标记消失——no-op 断言的锚点
  await page.evaluate(() => {
    ;(document.querySelector('.canvas-host') as HTMLElement).dataset.reproTag = 'alive'
  })

  // 按住 Ctrl 按 Tab：轮换浮层呼出（无输入框），高亮跳过当前到乙
  await page.keyboard.down('Control')
  await page.keyboard.press('Tab')
  await expect(page.getByTestId('switch-list')).toBeVisible()
  await expect(page.getByTestId('switch-input')).toBeHidden() // 轮换态无输入框
  const activeItem = page.locator('[data-testid="switch-item"][aria-selected="true"]')
  await expect(activeItem).toContainText('轮换乙')

  // 连按 Tab：高亮 甲 → 丙（循环回当前图），松 Ctrl 落在当前 = 真 no-op
  await page.keyboard.press('Tab')
  await expect(activeItem).toContainText('轮换甲')
  await page.keyboard.press('Tab')
  await expect(activeItem).toContainText('轮换丙')
  await page.keyboard.up('Control')
  await expect(page.getByTestId('switch-list')).toBeHidden()
  await expect(page.getByText('轮换丙').first()).toBeVisible() // 仍是当前图
  expect(await page.evaluate(() => document.querySelector('[data-repro-tag]') !== null)).toBe(true) // 画布未重挂载

  // Esc 取消：高亮停在别图上退出，不切
  await page.keyboard.down('Control')
  await page.keyboard.press('Tab')
  await expect(activeItem).toContainText('轮换乙')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('switch-list')).toBeHidden()
  await page.keyboard.up('Control')
  await expect(page.getByText('轮换丙').first()).toBeVisible()

  // 一按即松：切到上一张（ping-pong 手感）
  await page.keyboard.down('Control')
  await page.keyboard.press('Tab')
  await page.keyboard.up('Control')
  await expect(page.getByText('轮换乙').first()).toBeVisible()
})

// 会话只开过一张：Ctrl+Tab 照常呼浮层（列表仅当前一项——让用户看见状态而非以为快捷键失灵），
// 松 Ctrl 落在当前图 = 真 no-op（不切换、不保存、画布零重载）。
test('Ctrl+Tab 单图会话：呼浮层显示唯一项，松 Ctrl 不切换画布零重载', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')

  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('单图')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('单图').first()).toBeVisible()
  await page.evaluate(() => {
    ;(document.querySelector('.canvas-host') as HTMLElement).dataset.reproTag = 'alive'
  })

  await page.keyboard.down('Control')
  await page.keyboard.press('Tab')
  await expect(page.getByTestId('switch-list')).toBeVisible()
  await expect(page.getByTestId('switch-item')).toHaveCount(1) // 唯一项 = 当前图
  await expect(page.locator('[data-testid="switch-item"][aria-selected="true"]')).toContainText('单图')
  await page.keyboard.up('Control')
  await expect(page.getByTestId('switch-list')).toBeHidden()
  await expect(page.getByText('单图').first()).toBeVisible()
  expect(await page.evaluate(() => document.querySelector('[data-repro-tag]') !== null)).toBe(true) // 画布未重挂载
})
