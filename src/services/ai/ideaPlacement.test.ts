// ideaPlacement 摘要层（spec §6.2/§6.4）：粗摘要=图名+根+一层子节点；细摘要=缩进大纲带节点上限；
// 两阶段编排（Task 3）：askPlacement 选图→定位（fake transport 注入）
import { test, expect } from 'vitest'
import {
  buildCoarseSummary,
  buildFineSummary,
  COARSE_CHAR_CAP,
  MAX_MAPS_FOR_AI,
  MAX_NODES_PER_MAP,
  extractJsonObject,
  parsePhase1,
  parsePhase2,
  collectPaths,
  toMountTarget,
  askPlacement,
} from './ideaPlacement'
import type { AiTransport, ChatRequestPayload } from './client'
import type { FsAdapter } from '../../types/files'
import type { ZenNode } from '../../types/tree'

const n = (text: string, children: ZenNode[] = []): ZenNode => ({ text, children })

test('常量取 spec §6.4 初始建议值', () => {
  expect(MAX_MAPS_FOR_AI).toBe(50)
  expect(MAX_NODES_PER_MAP).toBe(200)
  expect(COARSE_CHAR_CAP).toBe(240)
})

test('粗摘要：图名（去 .md）+ 根文本 + 一层子节点文本', () => {
  const tree = n('根主题', [n('子A'), n('子B', [n('孙')])])
  const s = buildCoarseSummary('/ws/项目/项目图.md', tree)
  expect(s.mapPath).toBe('/ws/项目/项目图.md')
  expect(s.name).toBe('项目图')
  expect(s.summary).toBe('根主题：子A、子B')
  expect(s.truncated).toBe(false)
})

test('粗摘要超长截断并标注', () => {
  const tree = n('根'.repeat(300), [n('子')])
  const s = buildCoarseSummary('/ws/a.md', tree)
  expect(s.truncated).toBe(true)
  expect(s.summary.length).toBeLessThanOrEqual(COARSE_CHAR_CAP)
  expect(s.summary.endsWith('…（截断）')).toBe(true)
})

test('细摘要：缩进大纲（- 与层级空格）+ 节点计数', () => {
  const tree = n('根', [n('A', [n('A1'), n('A2')]), n('B')])
  const s = buildFineSummary('/ws/a.md', tree)
  expect(s.nodeCount).toBe(5) // 根 + 4 个后代（nodeCount 计全部节点，与下方 201 用例同口径）
  expect(s.outline).toContain('- 根')
  expect(s.outline).toContain('  - A')
  expect(s.outline).toContain('    - A1')
  expect(s.truncated).toBe(false)
})

test('细摘要节点数超上限：截断到 cap 并标注 truncated', () => {
  const children = Array.from({ length: 250 }, (_, i) => n(`节点${i}`))
  const tree = n('根', children)
  const s = buildFineSummary('/ws/a.md', tree)
  expect(s.truncated).toBe(true)
  expect(s.nodeCount).toBe(201) // 根 + 200 个子（cap 计全部节点）
})

// 解析容错（spec §6.3）：```json 块 / 裸 JSON / 前后噪声都取得到；形状不对返回 null
test('extractJsonObject：代码块包裹 / 前置噪声 / 非法输入', () => {
  expect(extractJsonObject('前置说明\n```json\n{"a":1}\n```\n结尾')).toEqual({ a: 1 })
  expect(extractJsonObject('好的，这是结果：{"a":{"b":2}}')).toEqual({ a: { b: 2 } })
  expect(extractJsonObject('完全不是 JSON')).toBeNull()
  expect(extractJsonObject('嵌套括号 { 不闭合')).toBeNull()
})

test('parsePhase1：合法形状透传；字段失型返回 null', () => {
  const raw = JSON.stringify({ placements: [{ idea: '点子A', candidates: [{ mapPath: '/ws/a.md', reason: 'r' }] }] })
  const rows = parsePhase1(raw)
  expect(rows).toEqual([{ idea: '点子A', candidates: [{ mapPath: '/ws/a.md', reason: 'r' }] }])
  expect(parsePhase1('{"placements": "x"}')).toBeNull()
  expect(parsePhase1('{"placements": [{"idea": 1}]}')).toBeNull()
})

test('parsePhase2：合法形状透传；缺 path / path 非字符串数组返回 null', () => {
  const raw = JSON.stringify({ placements: [{ idea: '点子A', mapPath: '/ws/a.md', path: ['根', '待办'], reason: 'r' }] })
  expect(parsePhase2(raw)).toEqual([{ idea: '点子A', mapPath: '/ws/a.md', path: ['根', '待办'], reason: 'r' }])
  expect(parsePhase2(JSON.stringify({ placements: [{ idea: 'a', mapPath: '/ws/a.md', path: '根' }] }))).toBeNull()
})

// 白名单与路径精确匹配（spec §6.3 硬约束）
test('toMountTarget：白名单外的 mapPath 一律拒绝（返回 null）', () => {
  const trees = new Map([['/ws/a.md', n('根', [n('待办')])]])
  const p = { idea: 'x', mapPath: '/etc/passwd', path: ['根', '待办'] }
  expect(toMountTarget(p, trees)).toBeNull()
})

test('toMountTarget：路径不精确匹配（trim 后）拒绝；匹配成功产出规范 MountTarget', () => {
  const trees = new Map([['/ws/a.md', n('根', [n('待办', [n('子项')])])]])
  expect(toMountTarget({ idea: 'x', mapPath: '/ws/a.md', path: ['根', '不存在'] }, trees)).toBeNull()
  // trim 容差：AI 输出带空白仍可命中（spec：trim 后精确匹配）。
  // MountTarget 规范形态（basketMount.ts:9-12）：path = 根→父的链、text = 目标节点自身——
  // AI 的链含所选节点末项，转换时去末项；链长 1（挂到根）保留 [根]（寻址要求非空链首=根）
  const t = toMountTarget({ idea: 'x', mapPath: '/ws/a.md', path: [' 根 ', ' 待办'] }, trees)
  expect(t).toEqual({ mapPath: '/ws/a.md', path: ['根'], text: '待办' })
  // 挂到根：链仅 [根]，text=根（findZenNodeByPathText 的冗余形态兜底命中链尾自身）
  expect(toMountTarget({ idea: 'x', mapPath: '/ws/a.md', path: ['根'] }, trees)).toEqual({ mapPath: '/ws/a.md', path: ['根'], text: '根' })
})

test('collectPaths：全部节点链（含根链与深层链）', () => {
  const set = collectPaths(n('根', [n('A', [n('A1')])]))
  expect(set.has('根')).toBe(true)
  expect(set.has('根›A')).toBe(true)
  expect(set.has('根›A›A1')).toBe(true)
  expect(set.size).toBe(3)
})

// 编排（spec §6.1/§6.2）：两阶段单次调用各一；护栏/解析失败/请求失败/中止的整批口径

/** fake transport：按调用次序回放预置回复；记录收到的 prompt 供断言。
 *  delta 须包成 OpenAI chunk 信封（与真实契约一致——askOnce 用 parseDeltaChunk 解包） */
function fakeTransport(replies: Array<{ text: string; ended?: 'done' | 'error' | 'aborted' }>): AiTransport & { calls: string[] } {
  const calls: string[] = []
  let i = 0
  return {
    calls,
    async start(payload: ChatRequestPayload, onDelta: (d: string) => void) {
      calls.push((payload.body.messages as Array<{ content: string }>)[0].content)
      const r = replies[Math.min(i, replies.length - 1)]
      i++
      if (r.ended === 'aborted') return { endedWith: 'aborted' }
      if (r.ended === 'error') return { endedWith: 'error', errorMessage: 'HTTP 500' }
      onDelta(JSON.stringify({ choices: [{ delta: { content: r.text } }] }))
      return { endedWith: 'done' }
    },
    abort: () => {},
  }
}

// readTree 全注入时 fs 不被消费——空桩即可（实现若实际消费再换内存桩）
const noFs = {} as FsAdapter

test('成功链：phase1 选图 → phase2 定位 → 产出规范 MountTarget', async () => {
  const t = fakeTransport([
    { text: JSON.stringify({ placements: [{ idea: '点子A', candidates: [{ mapPath: '/ws/a.md' }] }] }) },
    { text: JSON.stringify({ placements: [{ idea: '点子A', mapPath: '/ws/a.md', path: ['根', '待办'] }] }) },
  ])
  const r = await askPlacement(
    { ideas: [{ text: '点子A' }], maps: ['/ws/a.md', '/ws/b.md'], ai: { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' }, workspaceDir: '/ws', fs: noFs },
    { transport: t, readTree: async (p) => (p === '/ws/a.md' ? n('根', [n('待办')]) : n('别图', [n('杂')])) },
  )
  expect(r).toEqual({
    ok: true,
    rows: [{ idea: { text: '点子A' }, target: { mapPath: '/ws/a.md', path: ['根'], text: '待办' }, reason: undefined }],
  })
  expect(t.calls).toHaveLength(2) // 两阶段各一次
  expect(t.calls[0]).toContain('/ws/a.md')
  expect(t.calls[1]).toContain('候选')
})

test('白名单拒绝（spec §6.3 必办）：phase2 输出清单外 mapPath → targetNotFound，不构造 MountTarget', async () => {
  const t = fakeTransport([
    { text: JSON.stringify({ placements: [{ idea: '点子A', candidates: [{ mapPath: '/ws/a.md' }] }] }) },
    { text: JSON.stringify({ placements: [{ idea: '点子A', mapPath: '/etc/evil.md', path: ['根', '待办'] }] }) },
  ])
  const r = await askPlacement(
    { ideas: [{ text: '点子A' }], maps: ['/ws/a.md'], ai: { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' }, workspaceDir: '/ws', fs: noFs },
    { transport: t, readTree: async () => n('根', [n('待办')]) },
  )
  expect(r).toEqual({ ok: true, rows: [{ idea: { text: '点子A' }, failed: 'targetNotFound' }] })
})

test('护栏：图数超 MAX_MAPS_FOR_AI → tooManyMaps，零网络调用', async () => {
  const t = fakeTransport([])
  const maps = Array.from({ length: 51 }, (_, i) => `/ws/m${i}.md`)
  const r = await askPlacement(
    { ideas: [{ text: 'x' }], maps, ai: { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' }, workspaceDir: '/ws', fs: noFs },
    { transport: t },
  )
  expect(r).toEqual({ ok: false, error: 'tooManyMaps' })
  expect(t.calls).toHaveLength(0)
})

test('解析失败 / 请求失败 / 中止：整批口径（可重试/非故障）', async () => {
  const base = { ideas: [{ text: 'x' }], maps: ['/ws/a.md'], ai: { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' }, workspaceDir: '/ws', fs: noFs }
  const p1 = { transport: fakeTransport([{ text: '不是 JSON' }]), readTree: async () => n('根', [n('待办')]) }
  expect(await askPlacement(base, p1)).toMatchObject({ ok: false, error: 'parseFailed' })
  const p2 = { transport: fakeTransport([{ text: 'x', ended: 'error' }]), readTree: async () => n('根', [n('待办')]) }
  expect(await askPlacement(base, p2)).toMatchObject({ ok: false, error: 'requestFailed' })
  const p3 = { transport: fakeTransport([{ text: 'x', ended: 'aborted' }]), readTree: async () => n('根', [n('待办')]) }
  expect(await askPlacement(base, p3)).toMatchObject({ ok: false, error: 'aborted' })
})

test('无候选：phase1 空候选 → noCandidate；idea 对位按 trim 文本；rows 顺序与输入一致', async () => {
  const t = fakeTransport([
    { text: JSON.stringify({ placements: [{ idea: '点子A', candidates: [] }, { idea: '点子B', candidates: [{ mapPath: '/ws/a.md' }] }] }) },
    { text: JSON.stringify({ placements: [{ idea: '点子B', mapPath: '/ws/a.md', path: ['根', '待办'] }] }) },
  ])
  const r = await askPlacement(
    { ideas: [{ text: ' 点子B ' }, { text: '点子A' }], maps: ['/ws/a.md'], ai: { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' }, workspaceDir: '/ws', fs: noFs },
    { transport: t, readTree: async () => n('根', [n('待办')]) },
  )
  expect(r).toEqual({
    ok: true,
    rows: [
      { idea: { text: ' 点子B ' }, target: { mapPath: '/ws/a.md', path: ['根'], text: '待办' }, reason: undefined },
      { idea: { text: '点子A' }, failed: 'noCandidate' },
    ],
  })
})
