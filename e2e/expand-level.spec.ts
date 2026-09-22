import { expect, test } from '@playwright/test'

// 一键收起到 N 级（2026-09）：砚栏缩放段层级下拉（btn-expand-level）——引擎原生
// UNEXPAND_TO_LEVEL / EXPAND_ALL 命令的 UI 入口。覆盖三条主链：
// ① 收起到 1 级 = 只显示根（分支从画布消失）；② 受控选中态跟随（1 级项点亮）；
// ③ 全部展开恢复 + 命令通道置脏落 sidecar（collapsed 路径收集与手动折叠同源）。
test('一键收起到 N 级：收起/选中态/全部展开 + 持久化', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('层级图')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('层级图').first()).toBeVisible()

  // 三层图：根主题 > 分支甲 > 叶一（Tab 录入链路同 collapse.spec）
  await page.getByText('层级图').first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('分支甲')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.getByText('分支甲').first()).toBeVisible()

  await page.getByText('分支甲').first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('叶一')
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()
  await expect(page.getByText('叶一').first()).toBeVisible()

  // 收起到 1 级：引擎 expand 控制的是子树——一级分支仍可见（收起态），叶一（子树）消失
  await page.getByTestId('btn-expand-level').click()
  await page.getByTestId('expand-level-1').click()
  await expect(page.getByText('叶一')).toHaveCount(0)
  await expect(page.getByText('分支甲').first()).toBeVisible()
  // 命令通道置脏（脏印同时是引擎重排落定的稳定栅栏——紧后的菜单重开不被吞）
  await expect(page.getByTestId('dirty-badge')).toBeVisible()

  // 受控选中态：初始全展开无高亮 → 收起 1 级后 1 级项点亮。
  // 重开前先点画布空白复位焦点态：点选即关菜单后紧接（<300ms）重开，trigger 的
  // pointerdown 会被 Radix 关闭清理层吞掉（aria-expanded 恒 false，调试探针实锤；
  // 真实用户手速不可达，非功能缺陷——e2e 序列快才踩得到）
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await page.getByTestId('btn-expand-level').click()
  await expect(page.getByTestId('expand-level-1')).toHaveAttribute('data-state', 'checked')
  await page.keyboard.press('Escape')

  // 持久化：Ctrl+S 后 sidecar collapsed 收集收起路径（与手动折叠同源）
  await page.keyboard.press('Control+s')
  await expect(page.getByTestId('save-stamp')).toBeVisible()
  const collapsed = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/层级图.zen.json',
    ),
  )
  expect(JSON.parse(collapsed) as { collapsed: string[] }).toMatchObject({ collapsed: ['/层级图/分支甲'] })

  // 全部展开：分支甲回到画布（Escape 关菜单后 trigger 持焦会吞重开 pointerdown——
  // 同上以画布点击复位，也是真实用户流：回画布看效果再回菜单）
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await page.getByTestId('btn-expand-level').click()
  await page.getByTestId('expand-level-all').click()
  await expect(page.getByText('分支甲').first()).toBeVisible()
})
