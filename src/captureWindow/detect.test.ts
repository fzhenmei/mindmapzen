import { test, expect } from 'vitest'
import { detectWindowLabel, CAPTURE_WINDOW_LABEL } from './detect'

test('detectWindowLabel：无 internals 为 null；label 透传（jsdom / Tauri 两态）', () => {
  expect(CAPTURE_WINDOW_LABEL).toBe('quick-capture')
  expect(detectWindowLabel()).toBeNull() // jsdom 无 __TAURI_INTERNALS__
  ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'quick-capture' } },
  }
  expect(detectWindowLabel()).toBe('quick-capture')
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
})
