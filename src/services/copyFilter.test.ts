import { describe, expect, test } from 'vitest'
import { applyCopySettings, stripLinkBrackets, stripTreeBody, stripTreeNote } from './copyFilter'
import { serialize } from './mdTree'
import type { ZenNode } from '../types/tree'

describe('stripTreeNote（copyIncludeNote=false 树层剥备注，终审 C1）', () => {
  test('递归剥除全部 note，其余字段不动（body/icons 原样保留）', () => {
    const tree: ZenNode = {
      text: 'r', body: '论述。', note: '备注', children: [{ text: 'c', note: '子备注', body: '子论述。', children: [] }],
    }
    expect(stripTreeNote(tree)).toEqual({
      text: 'r', body: '论述。', children: [{ text: 'c', body: '子论述。', children: [] }],
    })
  })
  test('纯函数：入参树不被改动（原 note 原样保留）', () => {
    const child: ZenNode = { text: 'c', note: '子备注', children: [] }
    const tree: ZenNode = { text: 'r', note: '备注', children: [child] }
    stripTreeNote(tree)
    expect(tree.note).toBe('备注')
    expect(child.note).toBe('子备注')
  })
  test('C1 回归：copyIncludeNote=false 时正文代码块内 `> ` 行不丢（剥在树层，md 行级正则已退役）', () => {
    const tree: ZenNode = { text: 'r', body: '```diff\n> 删除的行\n```', note: '备注', children: [] }
    // doCopy 同款链：树层剥 note → serialize（旧 stripNoteLines 行级正则会把代码块内 `> ` 行整行剥掉）
    expect(serialize(stripTreeNote(tree))).toBe('# r\n```diff\n> 删除的行\n```\n')
  })
  test('C1 回归：copyIncludeNote=false 时正文内引用块不丢（手写 md 场景，树层不误伤）', () => {
    // I1 落地后编辑器不再产出正文引用块，但手写 md 仍可能有；树层剥除只删 note 字段，
    // 不按行剥 `> `（旧正则还会在剥除处留双空行）
    const tree: ZenNode = { text: 'r', body: '论述。\n\n> 引用', note: '备注', children: [] }
    expect(serialize(stripTreeNote(tree))).toBe('# r\n论述。\n\n> 引用\n')
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

describe('applyCopySettings（按设置组合；终审 C1 后仅剩双链剥除——备注剥除已上移树层）', () => {
  test('copyIncludeLinks=true：原文恒等（备注剥除不再走此处）', () => {
    const md = '# 根\n\n## A\n> 备注\n'
    expect(applyCopySettings(md, { copyIncludeNote: false, copyIncludeLinks: true, copyIncludeBody: true })).toBe(md)
  })
  test('copyIncludeLinks=false：[[B]] → B', () => {
    expect(applyCopySettings('## A 见 [[B]]\n', { copyIncludeNote: false, copyIncludeLinks: false, copyIncludeBody: true })).toBe('## A 见 B\n')
  })
})
