import { expect, test } from '@playwright/test'

// 开屏流程（M5d spec §2；2026-09 UI 评审 P2-1 单入口）：?nows=1 跳过 harness 预设工作区 →
// 无工作区首启态 → 开屏页主按钮「选择工作区文件夹」→ pickDirectory 桩返回 /ws →
// 真实 setWorkspace 链路 → 案头出现
test('开屏：无工作区首启 → 选择工作区文件夹 → 进入案头', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1&nows=1')

  // 开屏态：welcome-screen 居中呈现，工具栏隐藏（无工作区不显示案头页首）
  await expect(page.getByTestId('welcome-screen')).toBeVisible()
  await expect(page.getByText('Mind Map Zen').first()).toBeVisible()
  await expect(page.getByText('想法落成 .md')).toBeVisible()
  await expect(page.getByTestId('btn-new')).toHaveCount(0)

  // 主按钮「选择工作区文件夹」= pickDirectory 流（harness 桩固定返回 /ws）→ 案头出现（空态引导）
  await page.getByTestId('btn-welcome-create').click()
  await expect(page.getByTestId('library-empty')).toBeVisible()
  await expect(page.getByTestId('btn-new')).toBeVisible()
})
