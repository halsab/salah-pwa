import { expect, it } from 'vitest'

import { resolveLocale, restoreLanguagePreference } from './locale'

it('restores only the supported language and safely falls back for unknown preferences', () => {
  expect(restoreLanguagePreference('ru-RU')).toBe('ru')
  expect(restoreLanguagePreference('en')).toBe('auto')
  expect(restoreLanguagePreference({})).toBe('auto')
  expect(resolveLocale('auto', ['ru-RU'], ['ru'])).toBe('ru')
  expect(resolveLocale('auto', ['en-US'], ['ru'])).toBe('ru')
})
