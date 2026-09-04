import { expect, test } from '@playwright/test'

// M19 节点插图：行尾 ![alt](src)（md 原生语法零发明；src 相对工作区，AI 可读写）。
// 管理链路（选图→复制 assets/→落盘标记→重开预览）与手写/AI 链路（直接改 md）。
// 粘贴截图：Ctrl+V（paste 事件）与「粘贴」按钮（harness 桩）双路径 + 空剪贴板提示。

test('插图：选图流——复制入 assets/、落盘行尾标记、画布渲染、重开预览', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('插图图')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('插图图').first()).toBeVisible()

  // 选中根 → 浮动条「插图」钮 → 对话框（未设置占位）
  await page.getByText('插图图').first().click()
  await page.getByTestId('node-action-image').click()
  await expect(page.getByTestId('image-dialog')).toBeVisible()
  await expect(page.getByTestId('image-preview')).toContainText('未设置插图')

  // 选图（harness 桩 1×1 PNG）→ 预览 img 出现（复制入 assets/ + imgMap 注入 + SET_NODE_IMAGE）
  await page.getByTestId('image-pick').click()
  await expect(page.getByTestId('image-preview').locator('img')).toBeVisible()

  // 画布即时渲染：引擎图片元素 href 必须 dataURL（M19 验收实案：SET_NODE_IMAGE 命令
  // 期望 {url,title,width,height,custom} 形态，传错形态时 image 元素缺位/空源——锁死）
  const canvasImg = page.locator('.canvas-host image').first()
  await expect(canvasImg).toBeVisible()
  await expect(canvasImg).toHaveAttribute('href', /^data:image\/png;base64,/)

  // 先关对话框（模态遮罩挡画布 hover），再验证悬停大图浮层（像 Note 一样悬停查看）
  await page.getByTestId('image-dialog').getByRole('button', { name: '关闭' }).click()
  await expect(page.getByTestId('image-dialog')).toBeHidden()
  await canvasImg.hover()
  await expect(page.getByTestId('zen-img-tip')).toBeVisible()
  await page.getByTestId('btn-save').hover()
  await expect(page.getByTestId('zen-img-tip')).toBeHidden()

  // 返回（显式保存）→ md 行尾标记落盘；assets/ 字节在盘
  await page.getByTestId('btn-back').click()
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/插图图.md',
    ),
  )
  expect(md).toContain('# 插图图 ![选图](assets/选图.png)')

  // 重开：预览（imgMap 构建自磁盘字节）+ 对话框现状
  await page.getByTestId('file-node-插图图').dblclick()
  await expect(page.getByText('插图图').first()).toBeVisible()
  await expect(page.locator('.canvas-host image').first()).toBeVisible()
})

test('插图：手写/AI 改 md 标记 → 打开即渲染；文件缺失宽容占位', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await expect(page.getByTestId('btn-new')).toBeVisible()
  // 手写 md + 存一份真实 PNG 字节；另一节点引用缺失文件（均走 harness 通道，防裸 import 双实例）
  await page.evaluate(async () => {
    const z = (window as unknown as {
      __zenE2e: { writeFile(p: string, t: string): Promise<void>; writeBytes(p: string, b64: string): Promise<void> }
    }).__zenE2e
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    await z.writeBytes('/ws/assets/hand.png', pngBase64)
    await z.writeFile('/ws/手写插图.md', '# 手写插图 ![配图](assets/hand.png)\n\n## 缺失 ![丢图](assets/gone.png)\n')
  })
  await page.getByTestId('file-node-手写插图').dblclick()
  await expect(page.getByText('手写插图').first()).toBeVisible()
  // 存在的图渲染（引擎 image 元素 ≥1）；缺失的宽容跳过（不渲、不崩）
  await expect(page.locator('.canvas-host image').first()).toBeVisible()

  // 保存重开：标记原样保持（md 唯一事实源）
  await page.getByTestId('btn-back').click()
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/手写插图.md',
    ),
  )
  expect(md).toContain('# 手写插图 ![配图](assets/hand.png)')
  expect(md).toContain('## 缺失 ![丢图](assets/gone.png)')
})

test('插图：粘贴按钮路径——读剪贴板桩、复制入 assets/、落盘 paste- 时间戳标记', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('粘贴图')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('粘贴图').first()).toBeVisible()

  // 选中根 → 插图对话框 → 点「粘贴」（harness 桩 readClipboardImage 默认 1×1 PNG）
  await page.getByText('粘贴图').first().click()
  await page.getByTestId('node-action-image').click()
  await expect(page.getByTestId('image-dialog')).toBeVisible()
  await page.getByTestId('image-paste').click()

  // 预览 img 出现 + 画布即时渲染 dataURL（与选图链路同款形态断言）
  await expect(page.getByTestId('image-preview').locator('img')).toBeVisible()
  const canvasImg = page.locator('.canvas-host image').first()
  await expect(canvasImg).toHaveAttribute('href', /^data:image\/png;base64,/)

  // 落盘：行尾标记 alt/src 均为 paste- 时间戳名
  await page.getByTestId('image-dialog').getByRole('button', { name: '关闭' }).click()
  await page.getByTestId('btn-back').click()
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/粘贴图.md',
    ),
  )
  expect(md).toMatch(/# 粘贴图 !\[paste-\d{8}-\d{6}\]\(assets\/paste-\d{8}-\d{6}\.png\)/)
})

test('插图：Ctrl+V 路径——paste 事件同步读图并应用', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('快贴图')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('快贴图').first()).toBeVisible()
  await page.getByText('快贴图').first().click()
  await page.getByTestId('node-action-image').click()
  await expect(page.getByTestId('image-dialog')).toBeVisible()

  // 合成 paste 事件（真实微信/QQ 场景由 WebView2 把剪贴板位图合成 image/png 条目，
  // 此处同构：DataTransfer + File(image/png) + ClipboardEvent dispatch 到对话框）
  await page.evaluate(() => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
      0x42, 0x60, 0x82,
    ])
    const dt = new DataTransfer()
    dt.items.add(new File([png], 'shot.png', { type: 'image/png' }))
    const dialog = document.querySelector('[data-testid="image-dialog"]')
    dialog?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })

  // 预览 img 出现（paste 事件路径经 bytesFromPasteEvent → pasteAndApply → imgMap 注入）
  await expect(page.getByTestId('image-preview').locator('img')).toBeVisible()
  await page.getByTestId('image-dialog').getByRole('button', { name: '关闭' }).click()
  await page.getByTestId('btn-back').click()
  const md = await page.evaluate(() =>
    (window as unknown as { __zenE2e: { readFile(p: string): Promise<string> } }).__zenE2e.readFile(
      '/ws/快贴图.md',
    ),
  )
  expect(md).toMatch(/# 快贴图 !\[paste-\d{8}-\d{6}\]\(assets\/paste-\d{8}-\d{6}\.png\)/)
})

test('插图：剪贴板无图——按钮与 Ctrl+V 均提示「剪贴板中没有图片」，插图不被改动', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('空板图')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('空板图').first()).toBeVisible()
  await page.getByText('空板图').first().click()
  await page.getByTestId('node-action-image').click()
  await expect(page.getByTestId('image-dialog')).toBeVisible()

  // 按钮路径：覆写桩返回 null（剪贴板无图）
  await page.evaluate(() => {
    ;(window as unknown as { __zenE2e: { readClipboardImage: () => Promise<null> } }).__zenE2e.readClipboardImage =
      async () => null
  })
  await page.getByTestId('image-paste').click()
  await expect(page.getByTestId('paste-error')).toHaveText('剪贴板中没有图片')
  // 仍是无图占位，未产生画布图片
  await expect(page.getByTestId('image-preview')).toContainText('未设置插图')
  await expect(page.locator('.canvas-host image')).toHaveCount(0)

  // Ctrl+V 路径：只有文本的剪贴板 → 同款提示
  await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.items.add(new File(['字'], 't.txt', { type: 'text/plain' }))
    const dialog = document.querySelector('[data-testid="image-dialog"]')
    dialog?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await expect(page.getByTestId('paste-error')).toHaveText('剪贴板中没有图片')
})

// M19 验收补：详情态 markdown 预览渲染图片（相对路径经 imgMap 解析为 dataURL）
test('插图：详情态预览显示图片（imgMap dataURL 解析）', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await expect(page.getByTestId('btn-new')).toBeVisible()
  await page.evaluate(async () => {
    const z = (window as unknown as {
      __zenE2e: { writeFile(p: string, t: string): Promise<void>; writeBytes(p: string, b64: string): Promise<void> }
    }).__zenE2e
    await z.writeBytes(
      '/ws/assets/prev.png',
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    )
    await z.writeFile('/ws/预览图.md', '# 预览图 ![配图](assets/prev.png)\n')
  })
  await page.getByTestId('file-node-预览图').click()
  await expect(page.getByTestId('file-detail')).toBeVisible()
  // 预览 img 渲染且 src 已解析为 dataURL（未解析会是 404 的相对路径）
  const img = page.getByTestId('md-preview').locator('img')
  await expect(img).toBeVisible()
  await expect(img).toHaveAttribute('src', /^data:image\/png;base64,/)
})
