import { describe, expect, it } from 'vitest'

import { addDays, formatCompactDateLabel, formatDateLabel, getMoscowDate } from './date'

describe('getMoscowDate', () => {
  it('использует календарный день Татарстана, а не часовой пояс устройства', () => {
    expect(getMoscowDate(new Date('2026-08-31T21:30:00.000Z'))).toBe('2026-09-01')
  })
})

describe('addDays', () => {
  it('корректно переходит через границу года', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
})

describe('formatDateLabel', () => {
  it('возвращает спокойную русскую подпись без лишней пунктуации', () => {
    expect(formatDateLabel('2026-09-01')).toBe('вторник, 1 сентября')
  })

  it('возвращает короткую подпись для тесной мобильной строки', () => {
    expect(formatCompactDateLabel('2026-09-01')).toBe('1 сентября')
  })
})
