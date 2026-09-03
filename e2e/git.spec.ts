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

// M22 版本历史/回滚：设置页 → 历史 → 列表 → 行内确认恢复（checkout+回滚提交命令序列）。
// 时序要点：启用触发的 backupNow 完成后再设答案、再开历史（打开即拉取）；全程无 reload
// ——reload 会重装 harness 丢 gitAnswers（全量并行下偶发挂的真因）
test('版本历史：列表渲染 + 确认恢复命令序列（checkout <hash> -- . + 回滚提交）', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?e2e=1')
  await expect(page.getByTestId('btn-new')).toBeVisible()

  // 启用版本管理（history 入口仅在启用后出现）
  await page.getByTestId('btn-settings').click()
  await expect(page.getByTestId('settings-dialog')).toBeVisible()
  await page.getByTestId('git-enabled-toggle').check()
  // 等启用触发的 backupNow 完成（状态行出现摘要）——后台命令不与后续断言竞速
  await expect(page.getByTestId('git-status')).toContainText(/已提交|无变更|备份失败|尚无提交/, {
    timeout: 10_000,
  })

  // 回放 log：两条提交（在打开历史框前就绪——打开即拉取）
  await page.evaluate(() => {
    const z = (window as unknown as {
      __zenE2e: { gitAnswers: Array<{ match: string; ok: boolean; out?: string; err?: string }> }
    }).__zenE2e
    z.gitAnswers.length = 0
    z.gitAnswers.push({
      match: 'log -50',
      ok: true,
      out: 'abc1234\t2026-08-31 10:00:00 +0800\t自动备份 · 3 文件变更,长消息用于验证列表不被 truncate 的 nowrap 固有宽度撑破对话框\ndef5678\t2026-08-31 09:00:00 +0800\t自动备份 · 1 文件变更\n',
    })
  })
  await page.getByTestId('git-history-open').click()
  await expect(page.getByTestId('history-dialog')).toBeVisible()
  await expect(page.getByTestId('history-item-abc1234')).toContainText('自动备份 · 3 文件变更', {
    timeout: 10_000,
  })
  await expect(page.getByTestId('history-item-def5678')).toBeVisible()

  // 布局回归：长消息（truncate 的 nowrap 使 min-content=全文一行宽）不得经 Radix
  // ScrollArea 的 table 容器把列表撑出对话框——列表右端按钮画出框外即此因（曾现缺陷）
  const dlgBox = await page.getByTestId('history-dialog').boundingBox()
  const listBox = await page.getByTestId('history-list').boundingBox()
  const btnBox = await page.getByTestId('history-preview-abc1234').boundingBox()
  expect(listBox.width).toBeLessThanOrEqual(dlgBox.width)
  expect(btnBox.x + btnBox.width).toBeLessThanOrEqual(dlgBox.x + dlgBox.width)

  // M23 恢复预览：点「预览」行内展开行级差异（unified=0 桩回放，红=消失/绿=回来），恢复不开盲盒
  await page.evaluate(() => {
    const z = (window as unknown as {
      __zenE2e: { gitAnswers: Array<{ match: string; ok: boolean; out?: string }> }
    }).__zenE2e
    z.gitAnswers.push({
      match: 'diff --unified=0',
      ok: true,
      out: 'diff --git a/doc/test.md b/doc/test.md\n--- a/doc/test.md\n+++ b/doc/test.md\n@@ -2 +2 @@\n-旧标题\n+新标题\n@@ -5,0 +6 @@\n+新增节点\n',
    })
  })
  await page.getByTestId('history-preview-def5678').click()
  const diff = page.getByTestId('history-diff-def5678')
  await expect(diff).toContainText('doc/test.md', { timeout: 10_000 })
  await expect(diff).toContainText('-旧标题')
  await expect(diff).toContainText('+新标题')
  await expect(diff).toContainText('+新增节点')

  // 行内确认恢复：先「恢复」展开确认，再「确认恢复」执行
  await page.getByTestId('history-restore-def5678').click()
  await expect(page.getByTestId('history-confirm-def5678')).toBeVisible()
  await page.evaluate(() => {
    const z = (window as unknown as {
      __zenE2e: { gitCalls: string[]; gitAnswers: Array<{ match: string; ok: boolean; out?: string }> }
    }).__zenE2e
    z.gitCalls.length = 0
    // 答案也须清空重建：桩按前缀取首条命中，旧 log 答案残留会让恢复后的列表不刷新
    z.gitAnswers.length = 0
    z.gitAnswers.push(
      { match: 'checkout def5678', ok: true },
      { match: 'add -A', ok: true },
      { match: 'commit', ok: true },
      { match: 'log -50', ok: true, out: 'fff0000\t2026-08-31 11:00:00 +0800\t回滚到 def5678\n' },
      { match: 'log -1', ok: true, out: 'fff0000 回滚\n' },
      { match: 'status -sb', ok: true, out: '## master\n' },
    )
  })
  await page.getByTestId('history-confirm-def5678').click()
  await expect(page.getByTestId('history-item-fff0000')).toContainText('回滚到 def5678', { timeout: 10_000 })
  const calls = await page.evaluate(() => (window as unknown as { __zenE2e: { gitCalls: string[] } }).__zenE2e.gitCalls.join('\n'))
  expect(calls).toContain('checkout def5678 -- .')
  expect(calls).toContain('回滚到 def5678')
})
