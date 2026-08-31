import { expect, test } from '@playwright/test'

// 快速切换（v2.5 编辑器内切换导图）：Ctrl+P 浮层按名切换 / Ctrl+Tab ping-pong /
// 砚栏切换钮。建两张图（createAndOpen 即入最近打开）→ 编辑乙时浮层切甲 → ping-pong 往返。
test('快速切换：Ctrl+P 浮层切换、Ctrl+Tab ping-pong、砚栏钮呼出', async ({ page }) => {
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

  // Ctrl+Tab ping-pong：切回上一张乙，再按回到甲（往返核对 MRU 语义）
  await page.keyboard.press('Control+Tab')
  await expect(page.getByText('切换乙').first()).toBeVisible()
  await page.keyboard.press('Control+Tab')
  await expect(page.getByText('切换甲').first()).toBeVisible()

  // 砚栏切换钮呼出浮层（鼠标路径）+ Esc 关闭
  await page.getByTestId('btn-switch').click()
  await expect(page.getByTestId('switch-input')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('switch-input')).toBeHidden()
  await expect(page.getByText('切换甲').first()).toBeVisible() // 关浮层不动画布
})
