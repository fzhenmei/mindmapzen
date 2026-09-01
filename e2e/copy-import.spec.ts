import { expect, test } from '@playwright/test'

test('复制 md：整图与选中子树', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('复制测试')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('复制测试').first()).toBeVisible()
  await page.getByText('复制测试').first().click()
  await page.keyboard.press('Tab')
  // 适配（同冒烟用例）：引擎「插入子节点 → 渲染 → 打开编辑框」异步链路，先等编辑框弹出再输入
  await expect(page.locator('div.smm-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('分支甲')
  // 点画布空白提交（引擎核心 TextEdit 不注册 Escape 提交，与真实用户点空白收尾一致）
  await page.getByRole('application').click({ position: { x: 15, y: 15 } })
  await expect(page.locator('div.smm-node-edit-wrap')).toBeHidden()
  // 适配：引擎 node_active 事件经 setTimeout(0) 异步发出（Render.js emitNodeActiveEvent），
  // 按键若先于其到达会以旧激活态复制。以复制按钮 data-scope 为激活态可观测信号做同步
  // （M4 迁移：脱离 title 文案依赖，data-scope 随选中态在 full/branch 间切换）
  await expect(page.getByTestId('btn-copy')).toHaveAttribute('data-scope', 'full')
  // 无选中（点空白已清除激活）→ Ctrl+C 复制整图（与引擎 Control+c 节点复制对调后的新键位）。
  // 整图用精确断言（较简报加强）：同时钉死「单次 Tab 只插一个子节点」——
  // 画布键盘监听曾与引擎原生 KeyCommand 双份执行 Tab 导致双插入，此处防回归
  await page.keyboard.press('Control+c')
  // 印记反馈：右上角墨青印闪现（1.2s），区分复制路径文案
  await expect(page.getByTestId('save-stamp')).toHaveText('已复制为 Markdown')
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __zenE2e: { lastCopied: string | null } }).__zenE2e.lastCopied,
      ),
    )
    .toBe('# 复制测试\n\n## 分支甲\n')
  // 选中「分支甲」后复制 → 子树从 H1 重计（data-scope='branch' 确认选中态已同步）
  await page.getByText('分支甲').first().click()
  await expect(page.getByTestId('btn-copy')).toHaveAttribute('data-scope', 'branch')
  await page.keyboard.press('Control+c')
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __zenE2e: { lastCopied: string | null } }).__zenE2e.lastCopied,
      ),
    )
    .toBe('# 分支甲\n')
})

test('导入 .md：预置源文件经复制入库可打开', async ({ page }) => {
  // 经 harness 预置工作区外的源文件不可行（内存 FS 无外部路径概念）——改为经 import 桩：
  // harness 追加 pickMdFile 固定返回内置样例（含 1 个忽略块），App E2E 装配读取该桩
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-import').click()
  await expect(page.getByTestId('import-preview')).toBeVisible()
  await page.getByTestId('import-confirm').click()
  await expect(page.getByText('外部图').first()).toBeVisible()
})
