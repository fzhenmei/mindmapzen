import { describe, expect, test } from 'vitest'
import { applyCopySettings, stripLinkBrackets, stripTreeBody } from './copyFilter'
import { serialize } from './mdTree'
import type { ZenNode } from '../types/tree'

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
    const tree: ZenNode = { text: 'r', body: '论述。', children: [{ text: 'c', body: '子论述。', children: [] }] }
    expect(stripTreeBody(tree)).toEqual({ text: 'r', children: [{ text: 'c', children: [] }] })
  })
  test('纯函数:入参树不被改动(原 body 原样保留)', () => {
    const child: ZenNode = { text: 'c', body: '子论述。', children: [] }
    const tree: ZenNode = { text: 'r', body: '论述。', children: [child] }
    stripTreeBody(tree)
    expect(tree.body).toBe('论述。')
    expect(child.body).toBe('子论述。')
  })
  test('「剥正文」管全部正文:body 内引用块随整块一并剥(2026-09-06 备注合并后引用块已是正文合法块类型,无独立备注层)', () => {
    const tree: ZenNode = { text: 'r', body: '论述。\n\n> 引用', children: [] }
    expect(stripTreeBody(tree)).toEqual({ text: 'r', children: [] })
  })
  test('C1 回归:含正文时正文代码块内 `> ` 行不丢(剥除只发生在树层,md 层零触碰)', () => {
    const tree: ZenNode = { text: 'r', body: '```diff\n> 删除的行\n```', children: [] }
    expect(serialize(tree)).toBe('# r\n```diff\n> 删除的行\n```\n')
  })
})

describe('applyCopySettings（按设置组合；md 层仅剩双链剥除——剥正文在树层先于 serialize）', () => {
  test('copyIncludeLinks=true：原文恒等', () => {
    const md = '# 根\n\n## A\n论述。\n'
    expect(applyCopySettings(md, { copyIncludeLinks: true, copyIncludeBody: true })).toBe(md)
  })
  test('copyIncludeLinks=false：[[B]] → B', () => {
    expect(applyCopySettings('## A 见 [[B]]\n', { copyIncludeLinks: false, copyIncludeBody: true })).toBe('## A 见 B\n')
  })
})
