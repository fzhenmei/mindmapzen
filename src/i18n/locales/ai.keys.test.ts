// src/i18n/locales/ai.keys.test.ts —— zh/en 词典键集同构（Task 4）
import { describe, expect, test } from 'vitest'
import zh from '../zh-CN'
import en from '../en'

function flatKeys(o: unknown, prefix = ''): string[] {
  if (typeof o !== 'object' || o === null) return [prefix]
  return Object.entries(o).flatMap(([k, v]) => flatKeys(v, prefix ? `${prefix}.${k}` : k))
}

describe('ai 词典结构', () => {
  test('zh 与 en 键集完全一致', () => {
    expect(flatKeys(en.ai).sort()).toEqual(flatKeys(zh.ai).sort())
  })
  test('无空串值', () => {
    expect(flatKeys(zh.ai).length).toBeGreaterThan(0)
  })
})
