import { beforeEach, describe, expect, test } from 'vitest'
import { MemoryFsAdapter } from './fs/MemoryFsAdapter'
import { listTemplates, TEMPLATES_DIR } from './templates'
import { builtinTemplates } from '../templates/registry'

let fs: MemoryFsAdapter
beforeEach(() => {
  fs = new MemoryFsAdapter()
})

describe('listTemplates', () => {
  test('无工作区 → 仅内置清单', async () => {
    const list = await listTemplates(fs, null)
    expect(list.map((t) => t.key)).toEqual(builtinTemplates().map((t) => `builtin:${t.id}`))
    expect(list[0]?.name).toBe('空白导图')
  })

  test('templates/ 不存在 → 仅内置；存在则递归列出用户模板（排内置后按名称序）', async () => {
    expect((await listTemplates(fs, '/ws')).filter((t) => t.source === 'user')).toHaveLength(0)
    await fs.mkdir('/ws/templates')
    await fs.writeTextFileAtomic('/ws/templates/周会.md', '# 周会\n')
    await fs.mkdir('/ws/templates/子层')
    await fs.writeTextFileAtomic('/ws/templates/子层/复盘.md', '# 复盘\n')
    const list = await listTemplates(fs, '/ws')
    const user = list.filter((t) => t.source === 'user')
    // zh-Hans-CN 拼音序：复盘(fù) < 周会(zhōu)
    expect(user.map((t) => t.name)).toEqual(['复盘', '周会'])
    expect(user[0]?.desc).toContain('子层')
    // 内置在前
    expect(list[0]?.source).toBe('builtin')
  })

  test('单个用户模板读取失败被跳过（不阻断清单）', async () => {
    await fs.mkdir('/ws/templates')
    await fs.writeTextFileAtomic('/ws/templates/好模板.md', '# 好\n')
    const list = await listTemplates(fs, '/ws')
    expect(list.some((t) => t.name === '好模板')).toBe(true)
  })
})

describe('createMap 模板实例化（workspace 联测）', () => {
  test('传入模板：根名替换为用户输入，其余结构原样', async () => {
    const { createMap } = await import('./workspace')
    const tpl = '# 项目名\n\n## 目标\n\n### 一句话定位\n'
    const info = await createMap(fs, '/ws', 'mind-map-zen', 'mindmap', tpl)
    expect(info.name).toBe('mind-map-zen')
    const md = await fs.readTextFile('/ws/mind-map-zen.md')
    expect(md).toBe('# mind-map-zen\n\n## 目标\n\n### 一句话定位\n')
  })

  test('不传模板 = 空白导图（根节点=文件名）；非法模板回退空白不阻断', async () => {
    const { createMap } = await import('./workspace')
    await createMap(fs, '/ws', '普通图')
    expect(await fs.readTextFile('/ws/普通图.md')).toBe('# 普通图\n')
    // 无标题的文本（parse 失败）
    await createMap(fs, '/ws', '坏模板图', 'mindmap', '这段 md 没有标题')
    expect(await fs.readTextFile('/ws/坏模板图.md')).toBe('# 坏模板图\n')
  })

  test(`${TEMPLATES_DIR} 目录在案头清单中正常可见（不隐藏，模板即普通导图）`, async () => {
    const { listMaps } = await import('./workspace')
    await fs.mkdir('/ws/templates')
    await fs.writeTextFileAtomic('/ws/templates/周会.md', '# 周会\n')
    const maps = await listMaps(fs, '/ws')
    expect(maps.map((m) => m.name)).toEqual(['周会'])
    expect(maps[0]?.relDir).toBe(TEMPLATES_DIR)
  })
})
