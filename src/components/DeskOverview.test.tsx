// src/components/DeskOverview.test.tsx —— 案头总览区（2026-09 画布三态 M3）：自
// WorkbenchView.test.tsx 迁移改写（13 例 → 15 例：去案头钮/最近 chip/设置齿轮三例随
// 页面头部与 MRU 退役；新增纵向行退场/空任务退场/重扫失败清旧态三例）。挂载模式
// 对齐源文件：真实 zustand store setState 预置 + MemoryFsAdapter。
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'
import { useAppStore } from '../store/appStore'
import { changeUiLanguage } from '../i18n'
import DeskOverview from './DeskOverview'

let fs: MemoryFsAdapter
beforeEach(() => {
  fs = new MemoryFsAdapter()
  // aiAdvice 必须逐用例重置：测试夹具任务集相同 → 指纹相同，前用例存档会让
  // 后续用例的「问问 AI」缓存命中跳过请求（2026-09-14 缓存引入的跨用例泄漏）
  useAppStore.setState({ adapter: fs, workspaceDir: '/ws', currentMdPath: null, route: 'library', error: null, aiAdvice: null })
})

describe('DeskOverview 总览区（原工作台 spec §4/§6/§8 迁移 + M3 纵向形态）', () => {
  test('工作目录不存在：轻引导 + 一键创建后整段退场（目录在但无任务）', async () => {
    render(<DeskOverview />)
    expect(await screen.findByTestId('desk-overview-create')).toBeInTheDocument()
    expect(screen.getByText(/建一个「工作」目录/)).toBeInTheDocument() // 轻引导只有 body 文案（非大卡片带标题）
    expect(screen.queryByTestId('desk-overview-error')).toBeNull() // 轻引导=「未建目录」态，非 IO 故障占位（二者互斥）
    await screen.getByTestId('desk-overview-create').click()
    // 一键创建（ensureDir）+ 重扫：目录已存在但无任务 → M3 空态分层裁定——内容整段退场
    await waitFor(() => expect(screen.queryByTestId('desk-overview-create')).toBeNull())
    expect(screen.queryByTestId('workbench-suggestion')).toBeNull()
  })

  test('扫描期间行内 loading 占位（首帧即现，不闪空）', async () => {
    await fs.writeTextFileAtomic('/ws/工作/图A.md', '# 图A\n\n## 任务一 @todo\n')
    render(<DeskOverview />)
    expect(screen.getByTestId('desk-overview-loading')).toBeInTheDocument()
    expect(await screen.findByText('任务一')).toBeInTheDocument()
  })

  test('纵向状态行分组与跨图跳转：openMap + pendingLocate 置位（spec §5）', async () => {
    await fs.writeTextFileAtomic('/ws/工作/图A.md', '# 图A\n\n## 任务甲 @todo\n\n## 任务乙 @doing\n')
    await fs.writeTextFileAtomic('/ws/工作/图B.md', '# 图B\n\n## 任务丙 @blocked\n')
    const openMap = vi.fn()
    useAppStore.setState({ openMap: openMap as never, pendingLocate: null })
    render(<DeskOverview />)
    await screen.findByText('任务甲')
    // 纵向形态：每状态一行（行头「状态名 · 计数」+ 行内卡片横向带），行头与卡片同父行容器
    const rowTodo = screen.getByTestId('workbench-row-todo')
    const rowDoing = screen.getByTestId('workbench-row-doing')
    expect(rowTodo.parentElement!.textContent).toContain('任务甲')
    expect(rowTodo.parentElement!.textContent).not.toContain('任务乙')
    expect(rowDoing.parentElement!.textContent).toContain('任务乙')
    expect(screen.getByTestId('workbench-row-blocked').parentElement!.textContent).toContain('任务丙')
    // 点击任务丙卡片（跨图）：openMap 收到图B路径 + pendingLocate 已置文本寻址器——
    // mapPath 绑定目标图（终审 Important-1：错图消费防线的数据源），path+text 寻址
    const card = screen.getAllByTestId('workbench-card').find((el) => el.textContent?.includes('任务丙'))!
    await card.click()
    expect(openMap).toHaveBeenCalledWith('/ws/工作/图B.md')
    expect(useAppStore.getState().pendingLocate).toMatchObject({ mapPath: '/ws/工作/图B.md', text: '任务丙' })
  })

  test('failed-bar 标点随语言：词条含冒号，en 侧不渗全角正字法', async () => {
    // 无根标题 → parse ok:false 进 failed（services/workbench 单文件失败口径）
    await fs.writeTextFileAtomic('/ws/工作/坏图.md', '没有根标题的段落\n')
    await fs.writeTextFileAtomic('/ws/工作/另坏图.md', '也没有根标题\n')
    render(<DeskOverview />)
    expect(await screen.findByTestId('workbench-failed-bar')).toHaveTextContent('2 张图读取失败：坏图、另坏图')
    try {
      await changeUiLanguage('en')
      expect(screen.getByTestId('workbench-failed-bar')).toHaveTextContent('2 map(s) failed to load: 坏图, 另坏图')
    } finally {
      await changeUiLanguage('zh-CN') // 恢复本文件其余用例的 zh 预热
    }
  })

  test('创建工作目录失败：setError 落 store（横幅渲染归案头，不吞异常红线）', async () => {
    render(<DeskOverview />)
    expect(await screen.findByTestId('desk-overview-create')).toBeInTheDocument()
    vi.spyOn(fs, 'ensureDir').mockRejectedValue(new Error('disk full'))
    await screen.getByTestId('desk-overview-create').click()
    // 总览挂案头（LibraryView 已有 error 横幅出口）——本组件只落 store，横幅由案头渲染
    await waitFor(() => expect(useAppStore.getState().error).toBe('创建工作目录失败'))
  })

  test('建议区：规则建议渲染 + task 级点击跳转（spec §6）', async () => {
    await fs.writeTextFileAtomic('/ws/工作/图A.md', '# 图A\n\n## 进行中事 @doing\n')
    const openMap = vi.fn()
    useAppStore.setState({ openMap: openMap as never, pendingLocate: null })
    render(<DeskOverview />)
    const sug = await screen.findAllByTestId('workbench-suggestion')
    expect(sug[0]!.textContent).toContain('进行中的事，先收尾')
    expect(sug[0]!.textContent).toContain('进行中事')
    await sug[0]!.click()
    expect(openMap).toHaveBeenCalledWith('/ws/工作/图A.md')
    expect(useAppStore.getState().pendingLocate).not.toBeNull()
  })

  test('纵向聚合：每状态一行（无卡状态不渲染行），行内卡片横向带', async () => {
    await fs.writeTextFileAtomic('/ws/工作/a.md', '# a\n\n## 甲 @todo\n\n## 乙 @doing\n')
    render(<DeskOverview />)
    await waitFor(() => expect(screen.getByTestId('workbench-row-todo')).toBeInTheDocument())
    expect(screen.getByTestId('workbench-row-doing')).toBeInTheDocument()
    // BOARD_STATUSES 中无任务的状态（如 blocked）不渲染行
    expect(screen.queryByTestId('workbench-row-blocked')).toBeNull()
  })

  test('空任务退场：目录存在但无可见任务时整段不渲染内容（仅根容器在）', async () => {
    await fs.writeTextFileAtomic('/ws/工作/空.md', '# 空\n\n## 普通节点\n') // 无 status 标记
    render(<DeskOverview />)
    // 先等扫描落定（loading 退场）再断言退场——扫描未完时查 null 恒真假绿
    await waitFor(() => expect(screen.queryByTestId('desk-overview-loading')).not.toBeInTheDocument())
    expect(screen.getByTestId('desk-overview')).toBeInTheDocument()
    expect(screen.queryByTestId('workbench-suggestion')).toBeNull()
    expect(screen.queryByTestId('workbench-row-todo')).toBeNull()
  })

  test('先成功后失败序列：重扫抛错时旧 scan 清空，错误占位替代旧内容（不并存不误导）', async () => {
    await fs.writeTextFileAtomic('/ws/工作/图A.md', '# 图A\n\n## 任务 @todo\n')
    await fs.mkdir('/ws2/工作')
    await fs.writeTextFileAtomic('/ws2/工作/图B.md', '# 图B\n\n## 事项 @doing\n')
    render(<DeskOverview />)
    await screen.findByTestId('workbench-row-todo') // 首扫成功：旧内容已入 DOM
    // 临时故障：readDirEntries 仅对 /ws2/工作 拒绝；切工作区令 rescan 依赖变化 →
    // 同实例重扫，复现「先成功后失败」序列
    const orig = fs.readDirEntries.bind(fs)
    vi.spyOn(fs, 'readDirEntries').mockImplementation((dir: string) =>
      dir === '/ws2/工作' ? Promise.reject(new Error('io boom')) : orig(dir),
    )
    useAppStore.setState({ workspaceDir: '/ws2' })
    // 错误占位可见，且旧内容（任务行/建议/创建引导）全部消失——若不 setScan(null)，
    // 旧任务行会与错误占位并存（残留即 bug，本用例为其回归守卫）
    expect(await screen.findByTestId('desk-overview-error')).toBeInTheDocument()
    expect(screen.queryByTestId('workbench-row-todo')).toBeNull()
    expect(screen.queryByTestId('workbench-suggestion')).toBeNull()
    expect(screen.queryByTestId('desk-overview-create')).toBeNull()
  })
})

// fake transport 注入走 window.__AI_TRANSPORT_FACTORY__（ChatPanel.test.tsx 既有口径，
// getTransport 工厂消费点）——不走 vi.mock，无提升互覆盖问题，两用例同文件各设各的工厂；
// delta 按真实契约发原始 OpenAI chunk JSON 串（client.ts：onDelta 收到每条原始 chunk JSON）
function installAiFactory(start: (onDelta: (d: string) => void) => Promise<{ endedWith: 'done' | 'error' }>): void {
  ;(window as never as { __AI_TRANSPORT_FACTORY__: unknown }).__AI_TRANSPORT_FACTORY__ = () => ({
    start: (_p: unknown, onDelta: (d: string) => void) => start(onDelta),
    abort: vi.fn(),
  })
}

describe('问问 AI（spec §7：无工具纯咨询浮层，自工作台原样迁移）', () => {
  test('问问 AI：未配置时禁用 + title 提示；配置后点击发起流式并累积渲染', async () => {
    installAiFactory(async (onDelta) => {
      onDelta('{"choices":[{"delta":{"content":"建议一"}}]}')
      onDelta('{"choices":[{"delta":{"content":"：先收尾"}}]}')
      return { endedWith: 'done' }
    })
    await fs.writeTextFileAtomic('/ws/工作/图A.md', '# 图A\n\n## 任务 @todo\n')
    useAppStore.setState({ aiConfig: { baseUrl: '', apiKey: '', model: '' }, pendingLocate: null })
    render(<DeskOverview />)
    await screen.findByText('任务')
    const btn = screen.getByTestId('btn-workbench-ask-ai')
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', '先在设置中配置 AI（服务地址 / API Key / 模型名）')
    useAppStore.setState({ aiConfig: { baseUrl: 'http://x', apiKey: 'k', model: 'm' } })
    // setState 后重渲染落定再点（disabled button 不派发 click，直接点会假阴性）
    await waitFor(() => expect(btn).toBeEnabled())
    await btn.click()
    expect(await screen.findByTestId('workbench-ai-dialog')).toBeInTheDocument()
    expect(await screen.findByTestId('workbench-ai-text')).toHaveTextContent('建议一：先收尾')
  })

  test('问问 AI：stream error 显式报错文案，半截文本保留（不吞异常，spec §7/§8）', async () => {
    installAiFactory(async (onDelta) => {
      onDelta('{"choices":[{"delta":{"content":"半截"}}]}')
      return { endedWith: 'error' }
    })
    await fs.writeTextFileAtomic('/ws/工作/图A.md', '# 图A\n\n## 任务 @todo\n')
    useAppStore.setState({ aiConfig: { baseUrl: 'http://x', apiKey: 'k', model: 'm' }, pendingLocate: null })
    render(<DeskOverview />)
    await screen.findByText('任务')
    await screen.getByTestId('btn-workbench-ask-ai').click()
    expect(await screen.findByTestId('workbench-ai-error')).toHaveTextContent('AI 请求失败')
    expect(screen.getByTestId('workbench-ai-text')).toHaveTextContent('半截')
  })

  test('问问 AI：首 token 前工作中占位 + 费用提示；停止钮掐流保留半截文本（2026-09-14 试用反馈）', async () => {
    // start 挂起可 abort，模拟首 token 延迟（推理模型可达十几秒）——原实现浮层纯空白无反馈。
    // emit 经闭包函数转发：闭包内赋值的变量在测试主体直接调用会被 TS 窄化为 never（TS2349）
    let emit: ((d: string) => void) | null = null
    let aborts = 0
    let resolveStart: ((o: { endedWith: 'done' | 'aborted' }) => void) | null = null
    const pushDelta = (s: string): void => {
      emit?.(s)
    }
    ;(window as never as { __AI_TRANSPORT_FACTORY__: unknown }).__AI_TRANSPORT_FACTORY__ = () => ({
      start: (_p: unknown, onDelta: (d: string) => void) => {
        emit = onDelta
        return new Promise<{ endedWith: 'done' | 'aborted' }>((resolve) => {
          resolveStart = resolve
        })
      },
      abort: () => {
        aborts++
        resolveStart?.({ endedWith: 'aborted' })
      },
    })
    await fs.writeTextFileAtomic('/ws/工作/图A.md', '# 图A\n\n## 任务 @todo\n')
    useAppStore.setState({ aiConfig: { baseUrl: 'http://x', apiKey: 'k', model: 'm' }, pendingLocate: null })
    render(<DeskOverview />)
    await screen.findByText('任务')
    await screen.getByTestId('btn-workbench-ask-ai').click()
    // 首 token 前占位（animate-pulse 呼吸态）+ 费用提示行恒可见 + 停止钮（streaming 态）
    expect(await screen.findByTestId('workbench-ai-thinking')).toHaveTextContent('AI 正在分析你的任务清单')
    expect(screen.getByTestId('workbench-ai-fee-note')).toHaveTextContent('消耗 Token')
    expect(screen.getByTestId('workbench-ai-stop')).toBeInTheDocument()
    // 首 delta 到达：占位让位真实文本
    pushDelta('{"choices":[{"delta":{"content":"建议一"}}]}')
    await waitFor(() => expect(screen.getByTestId('workbench-ai-text')).toHaveTextContent('建议一'))
    expect(screen.queryByTestId('workbench-ai-thinking')).not.toBeInTheDocument()
    // 停止钮掐流：abort 一次、按钮随 streaming 结束退场、半截文本保留、不误报错误
    await screen.getByTestId('workbench-ai-stop').click()
    expect(aborts).toBe(1)
    await waitFor(() => expect(screen.queryByTestId('workbench-ai-stop')).not.toBeInTheDocument())
    expect(screen.getByTestId('workbench-ai-text')).toHaveTextContent('建议一')
    expect(screen.queryByTestId('workbench-ai-error')).not.toBeInTheDocument()
  })

  test('问问 AI 缓存（2026-09-14）：完成存档；再开零请求直读；再问一次重新请求覆盖', async () => {
    let starts = 0
    installAiFactory(async (onDelta) => {
      starts++
      onDelta(`{"choices":[{"delta":{"content":"第${starts}次建议"}}]}`)
      return { endedWith: 'done' }
    })
    await fs.writeTextFileAtomic('/ws/工作/图A.md', '# 图A\n\n## 任务 @todo\n')
    useAppStore.setState({ aiConfig: { baseUrl: 'http://x', apiKey: 'k', model: 'm' }, aiAdvice: null, pendingLocate: null })
    render(<DeskOverview />)
    await screen.findByText('任务')
    // 第一次：请求并完成 → 存档（文本 + 指纹）
    await screen.getByTestId('btn-workbench-ask-ai').click()
    expect(await screen.findByTestId('workbench-ai-text')).toHaveTextContent('第1次建议')
    await waitFor(() => expect(useAppStore.getState().aiAdvice).toMatchObject({ text: '第1次建议' }))
    const fp = useAppStore.getState().aiAdvice?.fingerprint
    expect(fp).toBeTruthy()
    await screen.getByRole('button', { name: 'Close' }).click()
    await waitFor(() => expect(screen.queryByTestId('workbench-ai-dialog')).not.toBeInTheDocument())
    // 第二次：缓存命中直接展示——零请求、无占位、有再问一次钮
    await screen.getByTestId('btn-workbench-ask-ai').click()
    expect(await screen.findByTestId('workbench-ai-text')).toHaveTextContent('第1次建议')
    expect(screen.queryByTestId('workbench-ai-thinking')).not.toBeInTheDocument()
    expect(starts).toBe(1)
    expect(screen.getByTestId('workbench-ai-ask-again')).toBeInTheDocument()
    // 再问一次：强制重新请求并覆盖缓存
    await screen.getByTestId('workbench-ai-ask-again').click()
    expect(await screen.findByTestId('workbench-ai-text')).toHaveTextContent('第2次建议')
    expect(starts).toBe(2)
    expect(useAppStore.getState().aiAdvice).toMatchObject({ text: '第2次建议', fingerprint: fp })
  })

  test('问问 AI 缓存失效（双条件）：指纹不符或超 24h 均自动重新请求', async () => {
    let starts = 0
    installAiFactory(async (onDelta) => {
      starts++
      onDelta('{"choices":[{"delta":{"content":"新建议"}}]}')
      return { endedWith: 'done' }
    })
    await fs.writeTextFileAtomic('/ws/工作/图A.md', '# 图A\n\n## 任务 @todo\n')
    // 指纹不符（模拟任务清单已变）：点开自动重问——断言走请求（starts 计数 + 新文本）；
    // 不抓瞬态占位（同步完成 transport 的占位一闪即逝，占位语义由专门用例把守）
    useAppStore.setState({ aiConfig: { baseUrl: 'http://x', apiKey: 'k', model: 'm' }, aiAdvice: { text: '旧建议', at: Date.now(), fingerprint: 'stale-fp' }, pendingLocate: null })
    render(<DeskOverview />)
    await screen.findByText('任务')
    await screen.getByTestId('btn-workbench-ask-ai').click()
    expect(await screen.findByTestId('workbench-ai-text')).toHaveTextContent('新建议')
    expect(starts).toBe(1)
    // 指纹相符但超 24h：同样自动重问
    const goodFp = useAppStore.getState().aiAdvice?.fingerprint
    await screen.getByRole('button', { name: 'Close' }).click()
    await waitFor(() => expect(screen.queryByTestId('workbench-ai-dialog')).not.toBeInTheDocument())
    useAppStore.setState({ aiAdvice: { text: '过期建议', at: Date.now() - 25 * 3600 * 1000, fingerprint: goodFp ?? 'x' } })
    await screen.getByTestId('btn-workbench-ask-ai').click()
    expect(await screen.findByTestId('workbench-ai-text')).toHaveTextContent('新建议')
    expect(starts).toBe(2)
  })

  test('问问 AI：流式中关浮层——主动掐流且不误报错误（abort ≠ error，Task 9 摘除句柄回归）', async () => {
    // stallTransport 同款（ChatPanel.test.tsx 终审 I2）：start 挂起模拟模型停摆，
    // abort() 令其以 'aborted' 主动收尾（不等 Rust 空闲超时 120s）
    let aborts = 0
    let resolveStart: ((o: { endedWith: 'done' | 'error' | 'aborted' }) => void) | null = null
    ;(window as never as { __AI_TRANSPORT_FACTORY__: unknown }).__AI_TRANSPORT_FACTORY__ = () => ({
      start: () =>
        new Promise<{ endedWith: 'done' | 'error' | 'aborted' }>((resolve) => {
          resolveStart = resolve
        }),
      abort: () => {
        aborts++
        resolveStart?.({ endedWith: 'aborted' })
      },
    })
    await fs.writeTextFileAtomic('/ws/工作/图A.md', '# 图A\n\n## 任务 @todo\n')
    useAppStore.setState({ aiConfig: { baseUrl: 'http://x', apiKey: 'k', model: 'm' }, pendingLocate: null })
    render(<DeskOverview />)
    await screen.findByText('任务')
    await screen.getByTestId('btn-workbench-ask-ai').click()
    expect(await screen.findByTestId('workbench-ai-dialog')).toBeInTheDocument()
    // 关浮层（onOpenChange(false) → closeAi 掐流）：transport.abort 主动收尾在途流
    await screen.getByRole('button', { name: 'Close' }).click()
    expect(aborts).toBe(1)
    await waitFor(() => expect(screen.queryByTestId('workbench-ai-dialog')).not.toBeInTheDocument())
    // 本地掐流不是故障：不落错误文案（aborted ≠ error）
    expect(screen.queryByTestId('workbench-ai-error')).not.toBeInTheDocument()
  })
})
