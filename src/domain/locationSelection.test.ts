import { describe, expect, it } from 'vitest'

import {
  isLocationSelectionSource,
  shouldStartAutomaticLocation,
} from './locationSelection'

describe('location selection provenance', () => {
  it('автоматически обновляет только ранее сохранённый автоматический выбор', () => {
    expect(shouldStartAutomaticLocation({ source: 'automatic' })).toBe(true)
    expect(shouldStartAutomaticLocation({ source: 'manual' })).toBe(false)
    expect(shouldStartAutomaticLocation({ source: 'default' })).toBe(false)
    expect(shouldStartAutomaticLocation(null)).toBe(false)
    expect(shouldStartAutomaticLocation({ source: 'invalid' })).toBe(false)
  })

  it('проверяет допустимые источники выбора независимо от режима расписания', () => {
    expect(isLocationSelectionSource('default')).toBe(true)
    expect(isLocationSelectionSource('manual')).toBe(true)
    expect(isLocationSelectionSource('automatic')).toBe(true)
    expect(isLocationSelectionSource('official')).toBe(false)
    expect(isLocationSelectionSource('calculated')).toBe(false)
  })
})
