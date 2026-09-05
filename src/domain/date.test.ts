import { describe, expect, it } from 'vitest'

import { addDays, formatCompactDateLabel, formatDateLabel, getSystemDate } from './date'

describe('getSystemDate', () => {
  it('использует календарный день указанного часового пояса', () => {
    const instant = new Date('2026-09-01T06:30:00.000Z')

    expect(getSystemDate(instant, 'America/Los_Angeles')).toBe('2026-08-31')
    expect(getSystemDate(instant, 'Pacific/Kiritimati')).toBe('2026-09-01')
  })
})

describe('addDays', () => {
  it('корректно переходит через границу года', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it.each([
    ['2026-01-31', 1, '2026-02-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2028-02-29', 1, '2028-03-01'],
    ['2026-03-01', -1, '2026-02-28'],
  ] as const)('соблюдает календарную границу %s', (date, offset, expected) => {
    expect(addDays(date, offset)).toBe(expected)
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
