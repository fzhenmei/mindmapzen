import { test, expect } from '@playwright/test'

// 快速捕获 M2（spec §4.1/§5.1）：启用开关后应用内 Ctrl+Alt+I 让位给全局快捷键。
// web e2e 无 Tauri（全局注册为守卫 no-op），本测试钉的是「让位门控」——
// 开关 → 应用内监听挂/摘；全局链路的真机行为走 docs/notes/m2-manual-checklist.md
test('快速捕获开关：启用后应用内 Ctrl+Alt+I 让位，关闭后恢复', async ({ page }) => {
  await page.goto('/?e2e=1')
  // 等案头就绪：boot 屏期间 App 的 Ctrl+Alt+I 监听尚未挂，直接按键会丢
  await expect(page.getByTestId('btn-settings')).toBeVisible()

  // 基线（未启用）：应用内快捷键可用。先于设置对话框单独测 Esc 关闭——
  // settings 与 capture 两个 modal Dialog 叠加时 Radix 的 Esc 分发不可靠（关下层不关上层）
  await page.keyboard.press('Control+Alt+i')
  await expect(page.getByTestId('capture-input')).toBeVisible()
  await page.keyboard.press('Escape')
  // Radix Dialog 退场动画 ~200ms 内浮层仍在 DOM 且有 bounding box（not.toBeVisible 会假失败，
  // 同 basket.spec 的 waitCaptureClosed 先例）：等完全卸载
  await expect(page.getByTestId('capture-input')).toHaveCount(0)

  // 启用 → 让位（应用内监听摘除）：settings 开着按 Ctrl+Alt+I 浮层不出现
  await page.getByTestId('btn-settings').click()
  await expect(page.getByTestId('settings-dialog')).toBeVisible()
  await page.getByTestId('quickcapture-toggle').check()
  await page.keyboard.press('Control+Alt+i')
  await expect(page.getByTestId('capture-input')).not.toBeVisible()
  // 关 settings（此时唯一 Dialog，Esc 语义干净），为下一段清场
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('settings-dialog')).toHaveCount(0)

  // 关闭 → 恢复：再开 settings 摘掉开关，应用内快捷键回来
  await page.getByTestId('btn-settings').click()
  await expect(page.getByTestId('settings-dialog')).toBeVisible()
  await page.getByTestId('quickcapture-toggle').uncheck()
  await page.keyboard.press('Control+Alt+i')
  await expect(page.getByTestId('capture-input')).toBeVisible()
})
