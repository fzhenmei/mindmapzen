import { expect, test } from '@playwright/test'

// 视觉冒烟（M12a Task 4 建，M12b Task 6 全面更新）：比截图稳的 getComputedStyle 令牌断言——
// 不比像素，比「@theme 令牌 → :root 变量 → data-theme 覆盖 → 工具类消费」整条链路的计算值，
// 外加案头/纸面关键元素的可见性与停泊栏布局值（spec §2/§3 验收线）。
// 每用例独立 context：内存配置全新 → themePref=auto；emulateMedia 钉住亮色系统偏好，
// auto 解析为 light，起点确定（e2eHarness 每次加载重建内存 fs 与 /cfg.json）。
// 主题循环注意：nextVisibleTheme 跳过与当前解析结果相同的档位（theme.ts），系统亮色时
// auto 一击直达 dark（auto→dark），非 auto→light→dark 逐档。

test('视觉冒烟 1：晨松亮主题——令牌就位且案头三区元素可见', async ({ page }) => {
  test.setTimeout(30_000)
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/?e2e=1')
  await expect(page.getByTestId('btn-new')).toBeVisible()

  // auto + 亮色系统偏好 → 解析为 light
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  // @theme static：令牌不依赖工具类消费即入产物（theme.css 注释所载验收线）；
  // 色值 spec §2 表逐字（背景/面板/青松主色/边线）
  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    return {
      background: cs.getPropertyValue('--color-background').trim(),
      surface: cs.getPropertyValue('--color-surface').trim(),
      primary: cs.getPropertyValue('--color-primary').trim(),
      border: cs.getPropertyValue('--color-border').trim(),
    }
  })
  expect(tokens).toEqual({
    background: '#F7F8F7',
    surface: '#FFFFFF',
    primary: '#1D7A6B',
    border: '#E4E7E6',
  })

  // 案头三区元素可见（M12b Task 3 重构后）：命令栏（btn-new 所在 header）/ 左目录树面板 /
  // 空工作区空态（e2e=1 无 desk 预置 → maps 为空）；工具类皮肤链路由冒烟 3 的探针覆盖
  await expect(page.getByTestId('dir-panel')).toBeVisible()
  await expect(page.getByTestId('library-empty')).toBeVisible()
})

test('视觉冒烟 2：夜航暗主题——令牌翻转与纸面停泊栏（spec §3 布局值）', async ({ page }) => {
  test.setTimeout(30_000)
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/?e2e=1')
  await page.getByTestId('btn-new').click()
  await page.getByTestId('input-name').fill('夜航图')
  await page.getByTestId('btn-confirm').click()
  await expect(page.getByText('根主题').first()).toBeVisible()

  // 纸面一次点击切换（auto 亮解析 → 跳过 light 直达 dark）
  await page.getByTestId('btn-theme').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  // 暗列令牌经 :root[data-theme='dark'] 同键覆盖生效（unlayered 恒胜 @theme 默认值）
  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    return {
      background: cs.getPropertyValue('--color-background').trim(),
      surface: cs.getPropertyValue('--color-surface').trim(),
      primary: cs.getPropertyValue('--color-primary').trim(),
    }
  })
  expect(tokens).toEqual({ background: '#14181A', surface: '#1B2022', primary: '#4CBFA8' })

  // 纸面元素可见（M12b Task 4）：停泊命令栏 + 左下题签 + 右下主题钮
  await expect(page.getByTestId('zen-bar')).toBeVisible()
  await expect(page.locator('.editor-caption')).toBeVisible()
  await expect(page.getByTestId('btn-theme')).toBeVisible()

  // 停泊栏布局值（spec §2/§3）：底部 12px 停泊、高 40px、全不透明
  // （旧「静置 35% 淡化」opacity 游戏退役的反证——无悬停即不透明；top 为 auto 时
  // getComputedStyle 返回解析后的用值（视口高 − 12 − 40），故不进断言）
  const bar = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.zen-bar')!)
    return { bottom: cs.bottom, height: cs.height, opacity: cs.opacity }
  })
  expect(bar).toEqual({ bottom: '12px', height: '40px', opacity: '1' })

  // 题签等宽文件声道（spec §2 字体双声道）：导图名走 Cascadia Code 等宽栈
  const captionFont = await page.evaluate(
    () => getComputedStyle(document.querySelector('.caption-name')!).fontFamily,
  )
  expect(captionFont).toContain('Cascadia Code')
})

test('视觉冒烟 3：Tailwind 工具类运行时生效——令牌链双主题驱动', async ({ page }) => {
  test.setTimeout(30_000)
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/?e2e=1')
  await expect(page.getByTestId('btn-new')).toBeVisible()

  // 运行时注入探针 div：bg-background 经 theme.css @source inline safelist 入产物
  // （工具类按需生成，无源码消费点的类不会产出）；text-foreground/rounded-card 由
  // ui 组件消费自然存在。探针挂 body，读完即移除
  const read = () =>
    page.evaluate(() => {
      let el = document.getElementById('zen-tw-probe')
      if (!el) {
        el = document.createElement('div')
        el.id = 'zen-tw-probe'
        el.className = 'bg-background text-foreground rounded-card'
        document.body.appendChild(el)
      }
      const cs = getComputedStyle(el)
      return { bg: cs.backgroundColor, fg: cs.color, radius: cs.borderRadius }
    })

  // 晨松：bg-background=#F7F8F7、text-foreground=#1F2328、rounded-card=8px（spec §2 表逐字）
  expect(await read()).toEqual({
    bg: 'rgb(247, 248, 247)',
    fg: 'rgb(31, 35, 40)',
    radius: '8px',
  })

  // 切夜航后同一探针复读：CSS 变量覆盖驱动工具类整体翻转（运行时链路证明）
  await page.getByTestId('btn-theme').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await read()).toEqual({
    bg: 'rgb(20, 24, 26)',
    fg: 'rgb(214, 219, 218)',
    radius: '8px',
  })

  await page.evaluate(() => document.getElementById('zen-tw-probe')?.remove())
})
