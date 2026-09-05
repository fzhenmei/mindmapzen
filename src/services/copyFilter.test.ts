import { describe, expect, test } from 'vitest'
import { applyCopySettings, stripLinkBrackets, stripNoteLines, stripTreeBody } from './copyFilter'
import type { ZenNode } from '../types/tree'

describe('stripNoteLines（copyIncludeNote=false 剥备注引用块）', () => {
  test('剥标题层备注行（含行尾换行不留空行）', () => {
    expect(stripNoteLines('# 根\n\n## A\n> 备注\n')).toBe('# 根\n\n## A\n')
  })
  test('剥多行备注：逐行全剥', () => {
    expect(stripNoteLines('## A\n> 第一行\n> 第二行\n')).toBe('## A\n')
  })
  test('剥列表项缩进形式备注（深度 ≥7 嵌套列表，引用块缩进进内容列）', () => {
    expect(stripNoteLines('- 项\n  > 列表备注\n  - 子项\n    > 子项备注\n')).toBe('- 项\n  - 子项\n')
  })
  test('剥空内容备注行（备注本身含空行 → 序列化为 `> ` 裸前缀行）', () => {
    expect(stripNoteLines('## A\n> \n> 有字\n')).toBe('## A\n')
  })
  test('文件末尾无换行的备注行也可剥', () => {
    expect(stripNoteLines('## A\n> 末尾备注')).toBe('## A\n')
  })
  test('非备注内容原样保留', () => {
    const md = '# 根\n\n## A\n- x\n'
    expect(stripNoteLines(md)).toBe(md)
  })
})

describe('stripLinkBrackets（copyIncludeLinks=false 留名去括号）', () => {
  test('[[名称]] → 名称', () => {
    expect(stripLinkBrackets('见 [[B]] 后')).toBe('见 B 后')
  })
  test('一节点多链逐个替换；全路径形式同样剥括号留路径', () => {
    expect(stripLinkBrackets('[[A]] 与 [[/根/B]]')).toBe('A 与 /根/B')
  })
  test('空括号 [[]] 与含内层括号的非法形式不动（与 links.ts 解析口径一致）', () => {
    expect(stripLinkBrackets('a [[]] b [[x[y]] c')).toBe('a [[]] b [[x[y]] c')
  })
  test('内层嵌套 [[ 形式按 LINK_RE 口径剥内层合法链（最外层括号保留）', () => {
    // links.ts 对 [[[a]] 同样只解析到内层 [[a]]（链名 a）：剥内层留最外层的 [
    expect(stripLinkBrackets('[[[a]]')).toBe('[a')
  })
})

describe('stripTreeBody（copyIncludeBody=false 树层剥正文，2026-09）', () => {
  test('stripTreeBody:递归剥除全部 body,其余字段不动(2026-09 正文)', () => {
    const tree: ZenNode = { text: 'r', body: '论述。', note: '备注', children: [{ text: 'c', body: '子论述。', children: [] }] }
    expect(stripTreeBody(tree)).toEqual({ text: 'r', note: '备注', children: [{ text: 'c', children: [] }] })
  })
  test('纯函数:入参树不被改动(原 body 原样保留)', () => {
    const child: ZenNode = { text: 'c', body: '子论述。', children: [] }
    const tree: ZenNode = { text: 'r', body: '论述。', children: [child] }
    stripTreeBody(tree)
    expect(tree.body).toBe('论述。')
    expect(child.body).toBe('子论述。')
  })
})

describe('applyCopySettings（按设置组合）', () => {
  test('默认 {false,true}：剥备注、留双链', () => {
    expect(applyCopySettings('# 根\n\n## A\n> 备注\n', { copyIncludeNote: false, copyIncludeLinks: true, copyIncludeBody: true }))
      .toBe('# 根\n\n## A\n')
    expect(applyCopySettings('## 见 [[B]]\n', { copyIncludeNote: false, copyIncludeLinks: true, copyIncludeBody: true })).toBe('## 见 [[B]]\n')
  })
  test('copyIncludeNote=true：备注保留', () => {
    expect(applyCopySettings('## A\n> 备注\n', { copyIncludeNote: true, copyIncludeLinks: true, copyIncludeBody: true })).toBe('## A\n> 备注\n')
  })
  test('copyIncludeLinks=false：[[B]] → B', () => {
    expect(applyCopySettings('## A 见 [[B]]\n', { copyIncludeNote: false, copyIncludeLinks: false, copyIncludeBody: true })).toBe('## A 见 B\n')
  })
  test('两开关全开：原文恒等', () => {
    const md = '# 根\n\n## A 见 [[B]]\n> 备注\n'
    expect(applyCopySettings(md, { copyIncludeNote: true, copyIncludeLinks: true, copyIncludeBody: true })).toBe(md)
  })
  test('两开关全关：备注与括号都剥', () => {
    expect(applyCopySettings('# 根\n\n## A 见 [[B]]\n> 备注\n', { copyIncludeNote: false, copyIncludeLinks: false, copyIncludeBody: true }))
      .toBe('# 根\n\n## A 见 B\n')
  })
})
