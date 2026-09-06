import { describe, expect, it } from 'vitest'
import { resolveUiLang } from './resolve'

describe('resolveUiLang(语言三态解析)', () => {
  it('显式偏好直出,不看系统语言', () => {
    expect(resolveUiLang('zh-CN', 'en-US')).toBe('zh-CN')
    expect(resolveUiLang('en', 'zh-CN')).toBe('en')
  })
  it('auto 按系统语言:zh 变体一律归简体', () => {
    expect(resolveUiLang('auto', 'zh')).toBe('zh-CN')
    expect(resolveUiLang('auto', 'zh-CN')).toBe('zh-CN')
    expect(resolveUiLang('auto', 'zh-TW')).toBe('zh-CN')
    expect(resolveUiLang('auto', 'zh-Hans-CN')).toBe('zh-CN')
  })
  it('auto 按系统语言:en 变体归英文', () => {
    expect(resolveUiLang('auto', 'en')).toBe('en')
    expect(resolveUiLang('auto', 'en-US')).toBe('en')
  })
  it('不支持的语言与缺失系统语言回退英文', () => {
    expect(resolveUiLang('auto', 'ja-JP')).toBe('en')
    expect(resolveUiLang('auto', 'fr')).toBe('en')
    expect(resolveUiLang('auto', undefined)).toBe('en')
    expect(resolveUiLang('auto', '')).toBe('en')
  })
})
