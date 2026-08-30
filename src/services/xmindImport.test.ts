import { describe, expect, test } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { parseXmind } from './xmindImport'
import { serialize } from './mdTree'

/** 新版 content.json 样例打包为 .xmind 字节（fflate zipSync 现造 fixture） */
function newXmind(): Uint8Array {
  const content = [
    JSON.stringify([
      {
        id: 's1',
        rootTopic: {
          id: 'r',
          title: '项目规划',
          notes: { plain: { content: '根节点备注' } },
          children: {
            attached: [
              { id: 'a1', title: '目标', children: { attached: [{ id: 'a1a', title: '上线' }] } },
              { id: 'a2', title: '风险', labels: ['P1'], markers: ['priority-1'] },
            ],
            detached: [{ id: 'd1', title: '游离想法' }],
          },
        },
      },
      { id: 's2', rootTopic: { id: 'r2', title: '第二画布' } },
    ]),
  ]
  return zipSync({ 'content.json': strToU8(content.join('')), 'manifest.json': strToU8('{}') })
}

/** 旧版 content.xml 样例 */
function oldXmind(): Uint8Array {
  const xml = `<?xml version="1.0"?>
<xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0" version="2.0">
  <sheet id="s1"><topic id="r" title="旧版根">
    <children><topics type="attached">
      <topic id="c1" title="子一"><notes><plain>子一备注</plain></notes></topic>
      <topic id="c2" title="子二"><children><topics type="attached">
        <topic id="c2a" title="孙一"/></topics></children></topic>
    </topics></children>
  </topic></sheet>
</xmap-content>`
  return zipSync({ 'content.xml': strToU8(xml) })
}

describe('parseXmind（M21 XMind 导入）', () => {
  test('新版 content.json：树/备注还原；游离/标签/标记/多画布入摘要（不静默丢）', () => {
    const r = parseXmind(newXmind())
    expect(r.tree.text).toBe('项目规划')
    expect(r.tree.note).toBe('根节点备注')
    expect(r.tree.children.map((c) => c.text)).toEqual(['目标', '风险'])
    expect(r.tree.children[0]?.children[0]?.text).toBe('上线')
    const kinds = r.warnings.map((w) => w.type)
    expect(kinds).toContain('游离主题')
    expect(kinds).toContain('标签')
    expect(kinds).toContain('标记')
    expect(kinds).toContain('多画布')
  })

  test('旧版 content.xml：标题树与备注还原', () => {
    const r = parseXmind(oldXmind())
    expect(r.tree.text).toBe('旧版根')
    expect(r.tree.children[1]?.children[0]?.text).toBe('孙一')
    expect(r.tree.children[0]?.note).toBe('子一备注')
    expect(r.warnings).toEqual([])
  })

  test('产出树直落 md 规范序列化（导入链即用）', () => {
    const r = parseXmind(newXmind())
    const md = serialize(r.tree)
    expect(md).toContain('# 项目规划\n')
    expect(md).toContain('> 根节点备注')
    expect(md).toContain('## 目标')
  })

  test('坏文件中文报错：非 zip / 缺内容件', () => {
    expect(() => parseXmind(new Uint8Array([1, 2, 3]))).toThrow('无法解压')
    expect(() => parseXmind(zipSync({ 'a.txt': strToU8('x') }))).toThrow('content.json/content.xml')
  })
})
