// src/services/aiConfig.test.ts —— AiConfig 宽容解析与往返（Task 3）
import { describe, expect, test } from 'vitest'
import { loadConfig, saveConfig } from './config'
import { DEFAULT_AI_CONFIG, parseAiConfig } from '../types/files'
import type { FsAdapter } from '../types/files'

const fakeAdapter = (files: Record<string, string>): FsAdapter => ({
  readTextFile: async (p: string) => (p in files ? files[p] : Promise.reject(new Error('NotFound'))),
  writeTextFileAtomic: async (p: string, s: string) => {
    files[p] = s
  },
  ensureDir: async () => {},
} as unknown as FsAdapter)

describe('parseAiConfig', () => {
  test('缺字段/非对象回退默认（旧配置兼容）', () => {
    expect(parseAiConfig(undefined)).toEqual(DEFAULT_AI_CONFIG)
    expect(parseAiConfig('x')).toEqual(DEFAULT_AI_CONFIG)
    expect(parseAiConfig({ baseUrl: ' https://a/v1 ' })).toEqual({
      baseUrl: 'https://a/v1',
      apiKey: '',
      model: '',
    })
  })
})

test('loadConfig/saveConfig 往返保留 ai 与 aiChatWidth', async () => {
  const files: Record<string, string> = {}
  const fs = fakeAdapter(files)
  await saveConfig(fs, '/cfg.json', {
    ...(await loadConfig(fs, '/cfg.json')),
    ai: { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-1', model: 'deepseek-chat' },
    aiChatWidth: 360,
  })
  const cfg = await loadConfig(fs, '/cfg.json')
  expect(cfg.ai).toEqual({ baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-1', model: 'deepseek-chat' })
  expect(cfg.aiChatWidth).toBe(360)
})
