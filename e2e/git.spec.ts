import { expect, test } from '@playwright/test'

// M20 版本管理（想法8 免命令）：设置页启用 → 自动备份链（init 按需/status/add/commit）
// 与远程推送（zen-origin 指向 + push）。命令经 harness 桩记录（__zenE2e.gitCalls），
// 真实 git 行为由 gitBackup 单测锁（记录型桩同构）。

test('版本管理：启用即自动备份；配远程后提交并推送；立即备份幂等', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await expect(page.getByTestId('btn-new')).toBeVisible()

  // 打开设置 → 启用（启用即触发一次 backupNow：rev-parse 探测 + status 检查）
  await page.getByTestId('btn-settings').click()
  await expect(page.getByTestId('settings-dialog')).toBeVisible()
  await page.getByTestId('git-enabled-toggle').check()

  // 回放：仓库已存在（rev-parse ok）+ 有一个变更 → 应走 add/commit
  await page.evaluate(() => {
    const z = (window as unknown as {
      __zenE2e: { gitAnswers: Array<{ match: string; ok: boolean; out?: string; err?: string }> }
    }).__zenE2e
    z.gitAnswers.length = 0
    z.gitAnswers.push(
      { match: 'rev-parse', ok: true },
      { match: 'status --porcelain', ok: true, out: 'M a.md\n' },
      { match: 'log -1', ok: true, out: '2026-08-30 18:00:00 +0800 自动备份 · 1 文件变更\n' },
      { match: 'status -sb', ok: true, out: '## master\n' },
    )
  })
  await page.getByTestId('git-backup-now').click()
  // 状态行出现最近提交（备份链走完）
  await expect(page.getByTestId('git-status')).toContainText('自动备份 · 1 文件变更', { timeout: 10_000 })

  const calls1 = await page.evaluate(() => (window as unknown as { __zenE2e: { gitCalls: string[] } }).__zenE2e.gitCalls.join('\n'))
  expect(calls1).toContain('add -A')
  expect(calls1).toContain('commit -m')

  // 配远程 → 立即备份应确保 zen-origin 并 push
  await page.getByTestId('git-remote-input').fill('https://github.com/u/zen-ws.git')
  await page.getByTestId('git-remote-input').blur()
  await page.evaluate(() => {
    const z = (window as unknown as {
      __zenE2e: { gitCalls: string[]; gitAnswers: Array<{ match: string; ok: boolean; out?: string }> }
    }).__zenE2e
    z.gitCalls.length = 0
    z.gitAnswers.length = 0
    z.gitAnswers.push(
      { match: 'rev-parse', ok: true },
      { match: 'status --porcelain', ok: true, out: 'M b.md\n' },
      { match: 'remote get-url', ok: false }, // 尚未配置 → remote add
      { match: 'push', ok: true },
      { match: 'log -1', ok: true, out: 'commit-x\n' },
    )
  })
  await page.getByTestId('git-backup-now').click()
  await expect(page.getByTestId('git-status')).toContainText('已提交并推送', { timeout: 10_000 })
  const calls2 = await page.evaluate(() => (window as unknown as { __zenE2e: { gitCalls: string[] } }).__zenE2e.gitCalls.join('\n'))
  expect(calls2).toContain('remote add zen-origin https://github.com/u/zen-ws.git')
  expect(calls2).toContain('push -u zen-origin HEAD')

  // 关闭重开设置：配置持久化在内存（cfg.json 经 harness fs）
  await page.getByTestId('settings-close').click()
  await page.getByTestId('btn-settings').click()
  await expect(page.getByTestId('git-enabled-toggle')).toBeChecked()
})
