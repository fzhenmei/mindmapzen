import { test, expect } from 'vitest'
import { setTrayEnabled } from './quickCaptureTray'

test('非 Tauri 环境（jsdom）早退不抛（守卫惯例）', async () => {
  await expect(setTrayEnabled(true, { onShowMain: () => {}, onNewIdea: () => {}, onQuit: () => {} })).resolves.toBeUndefined()
  await expect(setTrayEnabled(false, { onShowMain: () => {}, onNewIdea: () => {}, onQuit: () => {} })).resolves.toBeUndefined()
})
